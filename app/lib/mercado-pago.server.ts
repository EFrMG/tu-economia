import { z } from "zod";

import { MONTHLY_PRICE_ARS } from "~/lib/billing-entitlement";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

const api = "https://api.mercadopago.com";

/** Provider calls sit on interactive paths (status, checkout, cancellation and account deletion), so none may outlive this. */
const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * The subscription API rejects the documented `canceled` ("Invalid preapproval status param: canceled") and takes `cancelled`. Statuses read back are normalized to `canceled`, the spelling stored and compared everywhere else, whichever one the provider returns.
 */
const PROVIDER_CANCELLED = "cancelled";

const providerStatus = z
  .string()
  .transform((status) => (status === PROVIDER_CANCELLED ? "canceled" : status));

const planSchema = z.object({ id: z.string().min(1), init_point: z.url() });

const amountSchema = z
  .union([z.number(), z.string().regex(/^\d+(?:\.\d{1,2})?$/)])
  .transform(Number)
  .pipe(z.literal(MONTHLY_PRICE_ARS));

const searchSchema = z.object({
  paging: z.object({ total: z.number().int().min(0) }),
  results: z
    .array(
      z.object({ id: z.union([z.string(), z.number()]).transform(String) }),
    )
    .max(20),
});

export const subscriptionSchema = z.object({
  id: z.string().min(1),
  preapproval_plan_id: z.string().min(1),
  // `payer_email` is not read: the plan ID identifies the account, and a subscription made through a plan's hosted checkout can carry an empty one.
  status: providerStatus,
  date_created: z.iso.datetime({ offset: true }),
  next_payment_date: z.iso.datetime({ offset: true }).nullable().optional(),
  auto_recurring: z.object({
    frequency: z.literal(1),
    frequency_type: z.literal("months"),
    transaction_amount: amountSchema,
    currency_id: z.literal("ARS"),
    free_trial: z
      .object({
        frequency: z.literal(1),
        frequency_type: z.literal("months"),
      })
      .nullish(),
  }),
});

export const paymentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  preapproval_id: z.string().min(1),
  debit_date: z.iso.datetime({ offset: true }),
  currency_id: z.literal("ARS"),
  transaction_amount: amountSchema,
  payment: z.object({ status: z.string() }),
});

/** Mercado Pago's own short error description, for the logs. Only its `error` and `message` strings are kept, never the rest of the body. */
async function providerReason(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: unknown;
      message?: unknown;
    };

    const reason = [body.error, body.message]
      .filter((value): value is string => typeof value === "string")
      .join(": ")
      .slice(0, 200);

    return reason ? `: ${reason}` : "";
  } catch {
    return "";
  }
}

async function callProvider(
  env: CloudflareEnvironment,
  path: string,
  method: string,
  body?: unknown,
  providerFetch: typeof fetch = fetch,
) {
  if (!env.MP_ACCESS_TOKEN) throw new Error("Mercado Pago is not configured");

  return withUpstreamTimeout(PROVIDER_TIMEOUT_MS, async (signal) => {
    const response = await providerFetch(`${api}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!response.ok)
      throw new Error(
        `Mercado Pago request failed (${method} ${path.split("?")[0]}, ${response.status})${await providerReason(response)}`,
      );

    // The deadline also covers the body read: a provider that stalls mid-response must not hold the request.
    return response.json() as Promise<unknown>;
  });
}

export async function createHostedPlan(
  env: CloudflareEnvironment,
  backURL: string,
  providerFetch: typeof fetch = fetch,
  freeTrial = true,
) {
  const plan = planSchema.parse(
    await callProvider(
      env,
      "/preapproval_plan",
      "POST",
      {
        reason: "Tu Economía · sincronización personal",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: MONTHLY_PRICE_ARS,
          currency_id: "ARS",
          ...(freeTrial
            ? { free_trial: { frequency: 1, frequency_type: "months" } }
            : {}),
        },
        back_url: backURL,
      },
      providerFetch,
    ),
  );

  const checkout = new URL(plan.init_point);
  if (
    checkout.protocol !== "https:" ||
    checkout.hostname !== "www.mercadopago.com.ar" ||
    checkout.pathname !== "/subscriptions/checkout" ||
    checkout.searchParams.get("preapproval_plan_id") !== plan.id
  )
    throw new Error("Invalid Mercado Pago checkout URL");

  return { planId: plan.id, checkoutURL: checkout.href };
}

export const getSubscription = async (
  env: CloudflareEnvironment,
  id: string,
  providerFetch: typeof fetch = fetch,
) =>
  subscriptionSchema.parse(
    await callProvider(
      env,
      `/preapproval/${encodeURIComponent(id)}`,
      "GET",
      undefined,
      providerFetch,
    ),
  );

export const getSubscriptionStatus = async (
  env: CloudflareEnvironment,
  id: string,
  providerFetch: typeof fetch = fetch,
) =>
  z
    .object({ id: z.string().min(1), status: providerStatus })
    .parse(
      await callProvider(
        env,
        `/preapproval/${encodeURIComponent(id)}`,
        "GET",
        undefined,
        providerFetch,
      ),
    );

/** The documented plan filter is checked again against each canonical subscription. */
export const searchSubscriptionsByPlan = async (
  env: CloudflareEnvironment,
  planId: string,
  providerFetch: typeof fetch = fetch,
) =>
  searchSchema.parse(
    await callProvider(
      env,
      `/preapproval/search?preapproval_plan_id=${encodeURIComponent(planId)}`,
      "GET",
      undefined,
      providerFetch,
    ),
  );

export const getAuthorizedPayment = async (
  env: CloudflareEnvironment,
  id: string,
  providerFetch: typeof fetch = fetch,
) =>
  paymentSchema.parse(
    await callProvider(
      env,
      `/authorized_payments/${encodeURIComponent(id)}`,
      "GET",
      undefined,
      providerFetch,
    ),
  );

/** Bounded to the provider's first result page; callers refuse incomplete pages. */
export const searchAuthorizedPayments = async (
  env: CloudflareEnvironment,
  subscriptionId: string,
  providerFetch: typeof fetch = fetch,
) =>
  searchSchema.parse(
    await callProvider(
      env,
      `/authorized_payments/search?preapproval_id=${encodeURIComponent(subscriptionId)}`,
      "GET",
      undefined,
      providerFetch,
    ),
  );

export const cancelSubscription = async (
  env: CloudflareEnvironment,
  id: string,
  providerFetch: typeof fetch = fetch,
) => {
  await callProvider(
    env,
    `/preapproval/${encodeURIComponent(id)}`,
    "PUT",
    { status: PROVIDER_CANCELLED },
    providerFetch,
  );

  const verified = await getSubscriptionStatus(env, id, providerFetch);
  if (verified.id !== id || verified.status !== "canceled")
    throw new Error("Mercado Pago cancellation was not confirmed");

  return verified;
};
