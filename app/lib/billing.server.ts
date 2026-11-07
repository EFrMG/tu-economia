import { z } from "zod";

import {
  calendarMonthAfterArgentina,
  hasCloudEntitlement,
  type BillingRecord,
} from "~/lib/billing-entitlement";
import {
  cancelSubscription,
  createHostedPlan,
  getAuthorizedPayment,
  getSubscription,
  getSubscriptionStatus,
  searchAuthorizedPayments,
  searchSubscriptionsByPlan,
} from "~/lib/mercado-pago.server";
import {
  authenticated,
  privateJSON,
  readLimitedJSON,
  requireOrigin,
  type AuthenticationMessages,
} from "~/lib/request-guards.server";

/** Billing bodies are two-field objects. */
const MAX_JSON_BYTES = 1024;

const authenticationMessages: AuthenticationMessages = {
  unavailable:
    "No pudimos verificar su cuenta. Actualice la página e intente nuevamente.",
  unauthenticated: "Su sesión terminó. Inicie sesión nuevamente.",
};

/**
 * Records why a billing call failed in Workers Logs. A provider response that fails validation reports only each issue's path, code and message, never the payload, so payer data stays out of the logs.
 */
const logFailure = (context: string, error: unknown) => {
  if (error instanceof z.ZodError) {
    console.error(
      `${context}: provider response failed validation`,
      error.issues.map(({ path, code, message }) => ({
        path: path.join("."),
        code,
        message,
      })),
    );

    return;
  }

  console.error(
    `${context}: ${error instanceof Error ? error.message : "unknown error"}`,
  );
};

/** Keeps the technical `error` for logs and API clients, with user-facing Spanish copy beside it. */
const failure = (error: string, status: number, message: string) =>
  privateJSON({ error, message }, status);

const checkoutSchema = z.strictObject({
  expectedUserId: z.string().min(1),
  acceptedTerms: z.literal(true),
});

const cancelSchema = z.strictObject({ expectedUserId: z.string().min(1) });

export async function billingRecord(
  db: D1Database,
  userId: string,
): Promise<BillingRecord | null> {
  return db
    .prepare(
      "SELECT user_id, plan_id, checkout_url, subscription_id, provider_status, trial_ends_at, paid_until, canceled_at, account_deleted_at, last_verified_at FROM billing_subscriptions WHERE user_id = ?",
    )
    .bind(userId)
    .first<BillingRecord>();
}

/**
 * The stored hosted checkout of a plan that reconciliation found no subscription for, typically an abandoned or failed checkout. Offering it again resumes the checkout the account already started; a new plan would cost the account its free month and leave the first plan unresolved.
 */
const resumableCheckout = (row: BillingRecord | null) =>
  row?.provider_status === "pending" &&
  row.plan_id &&
  !row.subscription_id &&
  !row.account_deleted_at
    ? row.checkout_url
    : null;

export async function hasActiveBilling(db: D1Database, userId: string) {
  return hasCloudEntitlement(await billingRecord(db, userId));
}

async function storeSubscription(
  db: D1Database,
  row: BillingRecord,
  subscription: Awaited<ReturnType<typeof getSubscription>>,
) {
  // The plan is unique per account
  if (
    !row.plan_id ||
    subscription.preapproval_plan_id !== row.plan_id ||
    (row.subscription_id && row.subscription_id !== subscription.id)
  )
    throw privateJSON(
      { error: "Provider subscription does not match this account" },
      409,
    );

  const now = new Date().toISOString();

  const trialEnd =
    subscription.status === "authorized" &&
    !row.trial_ends_at &&
    subscription.auto_recurring.free_trial
      ? calendarMonthAfterArgentina(subscription.date_created)
      : row.trial_ends_at;

  const updated = await db
    .prepare(
      "UPDATE billing_subscriptions SET subscription_id = ?, provider_status = ?, trial_ends_at = COALESCE(trial_ends_at, ?), checkout_url = CASE WHEN ? IN ('authorized', 'canceled') THEN NULL ELSE checkout_url END, canceled_at = CASE WHEN ? = 'canceled' THEN COALESCE(canceled_at, ?) ELSE canceled_at END, last_verified_at = ?, updated_at = ? WHERE user_id = ? AND account_deleted_at IS NULL AND (subscription_id IS NULL OR subscription_id = ?) AND (canceled_at IS NULL OR ? = 'canceled') AND NOT (? = 'pending' AND provider_status IN ('authorized', 'canceled'))",
    )
    .bind(
      subscription.id,
      subscription.status,
      trialEnd,
      subscription.status,
      subscription.status,
      now,
      now,
      now,
      row.user_id,
      subscription.id,
      subscription.status,
      subscription.status,
    )
    .run();

  if (!updated.meta.changes) {
    const current = await billingRecord(db, row.user_id);
    if (
      current?.subscription_id === subscription.id &&
      ((subscription.status === "pending" &&
        ["authorized", "canceled"].includes(current.provider_status)) ||
        (current.provider_status === "canceled" &&
          subscription.status === "authorized"))
    )
      return;

    throw failure(
      "Subscription changed during verification",
      409,
      "La suscripción cambió mientras se verificaba. Actualice la página e intente nuevamente.",
    );
  }
}

/** One filtered search and one canonical GET; an ambiguous search is never resolved by picking a result. */
async function reconcileSubscription(
  db: D1Database,
  userId: string,
  env: CloudflareEnvironment,
  providerFetch: typeof fetch,
) {
  const row = await billingRecord(db, userId);
  if (!row?.plan_id || row.account_deleted_at) return row;

  if (!env.MP_ACCESS_TOKEN)
    throw failure(
      "Subscription verification is unavailable",
      503,
      "No pudimos verificar la suscripción en este momento. Intente nuevamente en unos minutos.",
    );

  const found = await searchSubscriptionsByPlan(
    env,
    row.plan_id,
    providerFetch,
  );

  if (
    found.paging.total === 0 &&
    found.results.length === 0 &&
    !row.subscription_id
  )
    return row;

  if (found.paging.total !== 1 || found.results.length !== 1)
    throw failure(
      "Subscription search requires manual reconciliation",
      409,
      "La suscripción requiere una verificación manual. Contacte a soporte.",
    );

  const subscription = await getSubscription(
    env,
    found.results[0].id,
    providerFetch,
  );

  if (subscription.id !== found.results[0].id)
    throw privateJSON(
      { error: "Provider subscription identity mismatch" },
      502,
    );

  await storeSubscription(db, row, subscription);

  return billingRecord(db, userId);
}

async function storeAuthorizedPayment(
  db: D1Database,
  payment: Awaited<ReturnType<typeof getAuthorizedPayment>>,
) {
  const owner = await db
    .prepare(
      "SELECT user_id FROM billing_subscriptions WHERE subscription_id = ? AND account_deleted_at IS NULL",
    )
    .bind(payment.preapproval_id)
    .first<{ user_id: string }>();

  if (!owner) return false;

  const now = new Date().toISOString();
  const debitDate = new Date(payment.debit_date).toISOString();

  await db
    .prepare(
      "INSERT INTO billing_payments (provider_payment_id, subscription_id, debit_date, status, amount_ars, verified_at) VALUES (?, ?, ?, ?, 5000, ?) ON CONFLICT(provider_payment_id) DO UPDATE SET status = CASE WHEN billing_payments.status IN ('refunded', 'reversed', 'charged_back') AND excluded.status NOT IN ('refunded', 'reversed', 'charged_back') THEN billing_payments.status ELSE excluded.status END, verified_at = excluded.verified_at",
    )
    .bind(
      payment.id,
      payment.preapproval_id,
      debitDate,
      payment.payment.status,
      now,
    )
    .run();

  // D1 serializes statements, but concurrent handlers can interleave between the read and write. Retry a compare-and-swap instead of writing stale time.
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await db
      .prepare(
        "SELECT paid_until, trial_ends_at FROM billing_subscriptions WHERE user_id = ? AND subscription_id = ? AND account_deleted_at IS NULL",
      )
      .bind(owner.user_id, payment.preapproval_id)
      .first<{ paid_until: string | null; trial_ends_at: string | null }>();

    if (!current) return false;

    const latest = await db
      .prepare(
        "SELECT debit_date FROM billing_payments WHERE subscription_id = ? AND status = 'approved' AND amount_ars = 5000 ORDER BY julianday(debit_date) DESC, debit_date DESC LIMIT 1",
      )
      .bind(payment.preapproval_id)
      .first<{ debit_date: string }>();

    const latestDate = latest?.debit_date
      ? new Date(latest.debit_date).toISOString()
      : null;

    const paidUntil =
      latestDate &&
      (!current.trial_ends_at ||
        latestDate >= new Date(current.trial_ends_at).toISOString())
        ? calendarMonthAfterArgentina(latestDate)
        : null;

    const updated = await db
      .prepare(
        "UPDATE billing_subscriptions SET paid_until = ?, last_verified_at = ?, updated_at = ? WHERE user_id = ? AND subscription_id = ? AND account_deleted_at IS NULL AND paid_until IS ? AND trial_ends_at IS ?",
      )
      .bind(
        paidUntil,
        now,
        now,
        owner.user_id,
        payment.preapproval_id,
        current.paid_until,
        current.trial_ends_at,
      )
      .run();

    if (updated.meta.changes) return true;
  }

  throw failure(
    "Payment verification changed during update",
    409,
    "La verificación de un pago cambió durante la actualización. Intente nuevamente en unos minutos.",
  );
}

async function recoverPayments(
  db: D1Database,
  row: BillingRecord,
  env: CloudflareEnvironment,
  providerFetch: typeof fetch,
) {
  if (!row.subscription_id || hasCloudEntitlement(row)) return;

  const found = await searchAuthorizedPayments(
    env,
    row.subscription_id,
    providerFetch,
  );

  if (found.paging.total !== found.results.length)
    throw failure(
      "Payment search requires manual reconciliation",
      409,
      "Hay pagos pendientes de conciliación. Contacte a soporte.",
    );

  for (const result of found.results) {
    const payment = await getAuthorizedPayment(env, result.id, providerFetch);
    if (
      payment.id !== result.id ||
      payment.preapproval_id !== row.subscription_id
    )
      throw privateJSON({ error: "Provider payment identity mismatch" }, 502);

    await storeAuthorizedPayment(db, payment);
  }
}

export async function cancelActiveForDeletion(
  db: D1Database,
  userId: string,
  env: CloudflareEnvironment,
  providerFetch: typeof fetch = fetch,
) {
  const row = await reconcileSubscription(db, userId, env, providerFetch);

  if (!row || row.account_deleted_at) return;

  if (
    row.provider_status === "creating" ||
    (row.plan_id && !row.subscription_id)
  )
    throw privateJSON(
      {
        error:
          "Subscription checkout must be reconciled before account deletion",
      },
      409,
    );

  if (row.subscription_id) {
    if (!env.MP_ACCESS_TOKEN)
      throw new Error(
        "Mercado Pago cancellation requires its configured credential",
      );

    const remote = await getSubscriptionStatus(
      env,
      row.subscription_id,
      providerFetch,
    );

    if (remote.id !== row.subscription_id)
      throw new Error("Provider subscription identity mismatch");

    if (remote.status !== "canceled")
      await cancelSubscription(env, row.subscription_id, providerFetch);
  }

  const now = new Date().toISOString();

  await db
    .prepare(
      "UPDATE billing_subscriptions SET provider_status = 'canceled', canceled_at = COALESCE(canceled_at, ?), updated_at = ? WHERE user_id = ?",
    )
    .bind(now, now, userId)
    .run();
}

export async function handleBilling(
  request: Request,
  env: CloudflareEnvironment,
  providerFetch: typeof fetch = fetch,
) {
  try {
    const { db, userId, baseURL } = await authenticated(
      request,
      env,
      authenticationMessages,
    );
    if (request.method === "GET") {
      const billingEnabled = env.BILLING_ENABLED === "true";
      const row = billingEnabled
        ? await reconcileSubscription(db, userId, env, providerFetch)
        : await billingRecord(db, userId);

      if (billingEnabled && row)
        await recoverPayments(db, row, env, providerFetch);

      const current = await billingRecord(db, userId);

      return privateJSON({
        entitled: hasCloudEntitlement(current),
        status: current?.provider_status ?? "none",
        trialEndsAt: current?.trial_ends_at ?? null,
        paidUntil: current?.paid_until ?? null,
        canceledAt: current?.canceled_at ?? null,
        checkoutURL: billingEnabled ? resumableCheckout(current) : null,
      });
    }

    if (request.method !== "POST" && request.method !== "DELETE")
      return privateJSON({ error: "Method not allowed" }, 405);

    requireOrigin(request, baseURL);
    const body = await readLimitedJSON(request, MAX_JSON_BYTES);
    if (request.method === "POST") {
      if (
        env.BILLING_ENABLED !== "true" ||
        env.FINANCE_STORAGE_ENABLED !== "true"
      )
        return failure(
          "New subscriptions are unavailable",
          503,
          "La inscripción no está disponible en este momento. Contacte a soporte.",
        );

      const parsed = checkoutSchema.safeParse(body);
      if (!parsed.success)
        return privateJSON(
          { error: "Explicit subscription terms required" },
          400,
        );

      if (parsed.data.expectedUserId !== userId)
        return failure(
          "Account changed",
          403,
          "La sesión cambió. Recargue la página e intente nuevamente.",
        );

      if (!env.MP_ACCESS_TOKEN)
        return failure(
          "Billing is not configured",
          503,
          "La inscripción no está disponible en este momento. Contacte a soporte.",
        );

      const existing = await reconcileSubscription(
        db,
        userId,
        env,
        providerFetch,
      );

      const now = new Date().toISOString();

      let reserved: { user_id: string } | null;

      if (!existing) {
        reserved = await db
          .prepare(
            "INSERT INTO billing_subscriptions (user_id, provider_status, created_at, updated_at) VALUES (?, 'creating', ?, ?) ON CONFLICT(user_id) DO NOTHING RETURNING user_id",
          )
          .bind(userId, now, now)
          .first<{ user_id: string }>();
      } else {
        // Only a confirmed subscription whose access has ended may be replaced.
        // An active period, a checkout without a subscription, or a deleted-account row still blocks checkout.
        if (existing.account_deleted_at || hasCloudEntitlement(existing))
          return failure(
            "Subscription is still active",
            409,
            "Su suscripción actual todavía tiene acceso vigente. Podrá inscribirse cuando termine el período.",
          );

        // A plan without a free month grants access only after its first verified payment, which can arrive after authorization. A fresh paid subscription has no trial or paid date yet.
        if (
          existing.provider_status === "authorized" &&
          !existing.trial_ends_at &&
          !existing.paid_until
        )
          return failure(
            "Subscription activation is still being verified",
            409,
            "La activación de su suscripción todavía se está verificando. Intente nuevamente en unos minutos.",
          );

        const resumable = resumableCheckout(existing);
        if (resumable) return privateJSON({ checkoutURL: resumable });

        if (!existing.subscription_id)
          return failure(
            "Subscription checkout already started; verify its status before retrying",
            409,
            "Ya hay una inscripción de Mercado Pago pendiente de verificación. Contacte a soporte antes de reintentar.",
          );

        // A lapsed renewal can still be charging at the provider. Cancel it before the replacement plan so the account cannot hold two subscriptions.
        if (existing.provider_status !== "canceled") {
          const remote = await getSubscriptionStatus(
            env,
            existing.subscription_id,
            providerFetch,
          );

          if (remote.id !== existing.subscription_id)
            return privateJSON(
              { error: "Provider subscription identity mismatch" },
              502,
            );

          if (remote.status !== "canceled")
            await cancelSubscription(
              env,
              existing.subscription_id,
              providerFetch,
            );

          await db
            .prepare(
              "UPDATE billing_subscriptions SET provider_status = 'canceled', canceled_at = COALESCE(canceled_at, ?), updated_at = ? WHERE user_id = ? AND subscription_id = ? AND provider_status = ?",
            )
            .bind(
              now,
              now,
              userId,
              existing.subscription_id,
              existing.provider_status,
            )
            .run();
        }

        const ended = await billingRecord(db, userId);

        if (
          ended?.subscription_id !== existing.subscription_id ||
          hasCloudEntitlement(ended)
        )
          return failure(
            "Subscription checkout is already starting",
            409,
            "Ya hay una inscripción de Mercado Pago en curso. Intente nuevamente en unos minutos.",
          );

        // Replace the ended subscription with a new reservation. Verified payments keep their rows; the previous plan and subscription IDs do not.
        reserved = await db
          .prepare(
            "UPDATE billing_subscriptions SET plan_id = NULL, checkout_url = NULL, subscription_id = NULL, provider_status = 'creating', trial_ends_at = NULL, paid_until = NULL, canceled_at = NULL, last_verified_at = NULL, updated_at = ? WHERE user_id = ? AND account_deleted_at IS NULL AND subscription_id = ? AND provider_status = 'canceled' AND trial_ends_at IS ? AND paid_until IS ? RETURNING user_id",
          )
          .bind(
            now,
            userId,
            ended.subscription_id,
            ended.trial_ends_at,
            ended.paid_until,
          )
          .first<{ user_id: string }>();
      }

      if (!reserved)
        return failure(
          "Subscription checkout is already starting",
          409,
          "Ya hay una inscripción de Mercado Pago en curso. Intente nuevamente en unos minutos.",
        );

      // The provider may create a plan even if its response is lost. Keep this reservation on every error so a retry cannot create another checkout.
      // Only the account's first plan carries the free calendar month; a replacement starts charging at authorization.
      const { planId, checkoutURL } = await createHostedPlan(
        env,
        `${baseURL}/mi-economia?tab=usuario`,
        providerFetch,
        existing === null,
      );

      await db
        .prepare(
          "UPDATE billing_subscriptions SET plan_id = ?, checkout_url = ?, provider_status = 'pending', updated_at = ? WHERE user_id = ? AND provider_status = 'creating'",
        )
        .bind(planId, checkoutURL, new Date().toISOString(), userId)
        .run();

      return privateJSON({ checkoutURL });
    }

    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success)
      return privateJSON({ error: "Invalid cancellation request" }, 400);

    if (parsed.data.expectedUserId !== userId)
      return failure(
        "Account changed",
        403,
        "La sesión cambió. Recargue la página e intente nuevamente.",
      );

    // A known subscription can be stopped even when plan search is unavailable.
    // Search remains necessary before deleting an account or attaching an unknown ID.
    const known = await billingRecord(db, userId);

    const row = known?.subscription_id
      ? known
      : await reconcileSubscription(db, userId, env, providerFetch);

    if (!row?.subscription_id)
      return failure(
        "No authorized subscription",
        409,
        "No se encontró una suscripción autorizada para cancelar.",
      );

    const remote = await getSubscriptionStatus(
      env,
      row.subscription_id,
      providerFetch,
    );

    if (remote.id !== row.subscription_id)
      throw new Error("Provider subscription identity mismatch");

    if (remote.status !== "canceled")
      await cancelSubscription(env, row.subscription_id, providerFetch);

    const now = new Date().toISOString();

    await db
      .prepare(
        "UPDATE billing_subscriptions SET provider_status = 'canceled', canceled_at = COALESCE(canceled_at, ?), updated_at = ? WHERE user_id = ?",
      )
      .bind(now, now, userId)
      .run();

    let reconciliationRequired = false;
    if (row.plan_id) {
      try {
        await reconcileSubscription(db, userId, env, providerFetch);
      } catch {
        reconciliationRequired = true;
      }
    }

    return privateJSON({
      canceled: true,
      reconciliationRequired,
      // A replacement plan has no trial date, so the paid period alone must still answer.
      accessUntil:
        [row.trial_ends_at, row.paid_until]
          .filter((value): value is string => value !== null)
          .sort()
          .at(-1) ?? null,
    });
  } catch (error) {
    if (error instanceof Response) return error;

    logFailure("billing request", error);

    return privateJSON({ error: "Billing request failed" }, 502);
  }
}

async function validSignature(request: Request, secret: string) {
  const match = /^ts=([^,]+),v1=([a-f\d]{64})$/i.exec(
    request.headers.get("x-signature") ?? "",
  );

  const requestId = request.headers.get("x-request-id");
  const dataId = new URL(request.url).searchParams.get("data.id");
  if (!match || !requestId || !dataId || !/^\d+$/.test(match[1])) return false;

  if (Math.abs(Date.now() - Number(match[1]) * 1000) > 5 * 60 * 1000)
    return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        `id:${dataId.toLowerCase()};request-id:${requestId};ts:${match[1]};`,
      ),
    ),
  );

  const actual = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");

  let difference = 0;
  for (let index = 0; index < actual.length; index++)
    difference |= actual.charCodeAt(index) ^ match[2].charCodeAt(index);

  return difference === 0;
}

/** Signed notifications are hints; every entitlement change uses a fresh provider GET. */
export async function handleBillingWebhook(
  request: Request,
  env: CloudflareEnvironment,
  providerFetch: typeof fetch = fetch,
) {
  try {
    if (!env.DB || !env.MP_ACCESS_TOKEN || !env.MP_WEBHOOK_SECRET)
      return privateJSON({ error: "Billing is unavailable" }, 503);

    if (request.method !== "POST")
      return privateJSON({ error: "Method not allowed" }, 405);

    if (!(await validSignature(request, env.MP_WEBHOOK_SECRET)))
      return privateJSON({ error: "Invalid signature" }, 401);

    const event = z
      .object({ type: z.string() })
      .safeParse(await readLimitedJSON(request, MAX_JSON_BYTES));

    if (!event.success) return privateJSON({ error: "Invalid event" }, 400);

    const id = new URL(request.url).searchParams.get("data.id")!;
    if (event.data.type === "subscription_preapproval") {
      const subscription = await getSubscription(env, id, providerFetch);
      if (subscription.id !== id)
        return privateJSON({ error: "Provider identity mismatch" }, 502);

      const owner = await env.DB.prepare(
        "SELECT user_id, plan_id, checkout_url, subscription_id, provider_status, trial_ends_at, paid_until, canceled_at, account_deleted_at, last_verified_at FROM billing_subscriptions WHERE plan_id = ? AND account_deleted_at IS NULL",
      )
        .bind(subscription.preapproval_plan_id)
        .first<BillingRecord>();

      if (!owner) return privateJSON({ ignored: true });

      await storeSubscription(env.DB, owner, subscription);

      return privateJSON({ received: true });
    }

    if (event.data.type === "subscription_authorized_payment") {
      const payment = await getAuthorizedPayment(env, id, providerFetch);
      if (payment.id !== id)
        return privateJSON({ error: "Provider identity mismatch" }, 502);

      if (!(await storeAuthorizedPayment(env.DB, payment)))
        return privateJSON({ ignored: true });

      return privateJSON({ received: true });
    }

    return privateJSON({ ignored: true });
  } catch (error) {
    if (error instanceof Response) return error;

    logFailure("billing notification", error);

    return privateJSON({ error: "Billing notification failed" }, 502);
  }
}
