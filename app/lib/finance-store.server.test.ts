import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { authFromEnv } from "./auth.server";
import { handleBilling, handleBillingWebhook } from "./billing.server";
import { hasCloudEntitlement } from "./billing-entitlement";
import {
  handleAccountDeletion,
  handleFinanceExport,
  handleFinanceForm,
  loadFinanceState,
  starterFinanceDocument,
} from "./finance-store.server";
import { runFinanceRetention } from "./finance-retention.server";
import type { LocalFinanceDocument } from "./local-finance";

const origin = "https://auth.example.test";

const canceledProvider = (async (input: RequestInfo | URL) =>
  Response.json({
    id: String(input).split("/").at(-1),
    status: "canceled",
  })) as typeof fetch;

/** Two live subscriptions on one plan: a second charge is possible, so neither may be picked. */
const ambiguousPlanSearch = async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/preapproval/search?"))
    return Response.json({
      paging: { total: 2 },
      results: [{ id: "a" }, { id: "b" }],
    });

  return Response.json({ id: url.split("/").at(-1), status: "authorized" });
};

/** Run the actual D1 SQL and foreign keys using an isolated SQLite database. */
function localD1(database: DatabaseSync): D1Database {
  const prepare = (query: string) => {
    let values: unknown[] = [];

    const statement = {
      bind(...next: unknown[]) {
        values = next;

        return statement;
      },
      async all<T>() {
        const results = database.prepare(query).all(...(values as [])) as T[];
        return {
          results,
          success: true,
          meta: {
            changes: Number(
              database.prepare("SELECT changes() AS value").get()?.value ?? 0,
            ),
          },
        };
      },
      async first<T>() {
        return (
          (database.prepare(query).get(...(values as [])) as T | undefined) ??
          null
        );
      },
      async run() {
        const result = database.prepare(query).run(...(values as []));
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };

    return statement;
  };

  return {
    prepare,
    async exec(query: string) {
      database.exec(query);

      return { count: 1, duration: 0 };
    },
    async batch(statements: D1PreparedStatement[]) {
      database.exec("BEGIN");

      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());

        database.exec("COMMIT");

        return results;
      } catch (error) {
        database.exec("ROLLBACK");

        throw error;
      }
    },
  } as unknown as D1Database;
}

async function setup(onTestFinished: (fn: () => void) => void) {
  const database = new DatabaseSync(":memory:");
  onTestFinished(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");

  for (const name of [
    "0001_personal_finance",
    "0002_planned_expenses",
    "0003_auth",
    "0004_finance_sync",
    "0005_billing",
    "0006_finance_documents",
    "0007_drop_legacy_finance_tables",
    "0008_retention_notice_attempt",
  ])
    database.exec(
      readFileSync(
        new URL(`../../migrations/${name}.sql`, import.meta.url),
        "utf8",
      ),
    );

  const delivery = {
    messages: [] as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }[],
    status: 200,
  };

  vi.stubGlobal("fetch", (async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const message = JSON.parse(String(init?.body)) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };

    delivery.messages.push({ ...message, to: message.to[0] });

    return new Response(null, { status: delivery.status });
  }) as typeof fetch);

  onTestFinished(() => vi.unstubAllGlobals());

  const env: CloudflareEnvironment = {
    DB: localD1(database),
    AUTH_ACCOUNTS_ENABLED: "true",
    FINANCE_STORAGE_ENABLED: "true",
    BILLING_ENABLED: "true",
    AUTH_BASE_URL: origin,
    AUTH_SECRET: "synthetic-auth-secret-0000000000000000",
    RESEND_API_KEY: "re_synthetic",
    EMAIL_FROM: "Tu Economía <acceso@auth.example.test>",
  };

  const auth = authFromEnv(env)!;

  /** The verification URL of the most recently delivered message. */
  async function issueLink(email: string) {
    const send = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    );

    expect(send.status).toBe(200);

    return delivery.messages.at(-1)!.text.match(/https:\/\/\S+/)![0];
  }

  async function signIn(email: string) {
    const response = await auth.handler(new Request(await issueLink(email)));

    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");

    const session = await auth.api.getSession({
      headers: new Headers({ Cookie: cookie }),
    });

    expect(session).not.toBeNull();

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, subscription_id, provider_status, trial_ends_at, canceled_at, created_at, updated_at) VALUES (?, ?, 'canceled', '2030-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
      )
      .run(session!.user.id, `synthetic-${session!.user.id}`);

    return { cookie, userId: session!.user.id };
  }

  return { env, database, auth, signIn, issueLink, delivery };
}

function request(
  method: string,
  cookie = "",
  body?: unknown,
  headers?: HeadersInit,
) {
  return new Request(`${origin}/api/finance-export`, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signedBillingEvent(secret: string, type: string, id: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = `synthetic-${id}`;

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
      new TextEncoder().encode(`id:${id};request-id:${requestId};ts:${ts};`),
    ),
  );

  const signature = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");

  return new Request(`${origin}/api/billing/webhook?data.id=${id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-signature": `ts=${ts},v1=${signature}`,
    },
    body: JSON.stringify({ type }),
  });
}

const document = (): LocalFinanceDocument => ({
  version: 1,
  salaries: { "2026-01": 20000000 },
  categories: [
    { id: "category", name: "Vivienda", archivedAt: null },
    { id: "archived", name: "Anterior", archivedAt: "2025-12-01" },
  ],
  allocations: { "2026-01": { category: 10000000, archived: 0 } },
  expenses: [
    {
      id: "expense",
      categoryId: "category",
      incurredOn: "2026-01-05",
      amountCents: 1000000,
      description: "Pago con descripción",
    },
  ],
  plans: [
    {
      id: "plan",
      categoryId: "category",
      title: "Alquiler",
      amountCents: 1000000,
      amountKind: "confirmed",
      recurrence: "monthly",
      firstDueOn: "2026-01-05",
      lastDueOn: null,
      archivedAt: null,
      revisesPlanId: null,
    },
  ],
  resolutions: [
    {
      plannedExpenseId: "plan",
      dueOn: "2026-01-05",
      state: "paid",
      expenseId: "expense",
    },
    {
      plannedExpenseId: "plan",
      dueOn: "2026-02-05",
      state: "skipped",
      expenseId: null,
    },
  ],
  goals: [
    { id: "goal", name: "Reserva", targetCents: 30000000, savedCents: 100000 },
  ],
});

function formRequest(
  cookie: string,
  fields: Record<string, string | File>,
  headers?: HeadersInit,
) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);

  return new Request(`${origin}/mi-economia`, {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie, ...headers },
    body,
  });
}

const save = (
  env: CloudflareEnvironment,
  cookie: string,
  fields: Record<string, string | File>,
) => handleFinanceForm(formRequest(cookie, fields), env);

const load = (env: CloudflareEnvironment, cookie = "") =>
  loadFinanceState(
    new Request(`${origin}/mi-economia`, { headers: { Cookie: cookie } }),
    env,
  );

const backup = (value: unknown) =>
  new File([JSON.stringify(value)], "copia.json", {
    type: "application/json",
  });

async function seedDocument(env: CloudflareEnvironment, cookie: string) {
  const result = await save(env, cookie, {
    _intent: "data.import",
    file: backup(document()),
  });

  expect(result.ok).toBe(true);
}

describe("cloud finance storage", () => {
  it("shows starter records to every visitor and saves only for an active session", async ({
    onTestFinished,
  }) => {
    const { env, signIn } = await setup(onTestFinished);

    expect(await load({ ...env, AUTH_ACCOUNTS_ENABLED: "false" })).toEqual({
      access: "unavailable",
      userId: null,
      email: null,
      billingEnabled: false,
      googleLinked: false,
      deletionDate: null,
      trialEligible: true,
      document: starterFinanceDocument(),
    });

    const visitor = await load(env);
    expect(visitor.access).toBe("signed-out");
    expect(visitor.trialEligible).toBe(true);
    expect(visitor.document).toEqual(starterFinanceDocument());

    expect(
      (await save(env, "", { _intent: "category.add", name: "Viajes" })).ok,
    ).toBe(false);

    const { cookie, userId } = await signIn("one@example.test");

    expect(
      await load({ ...env, FINANCE_STORAGE_ENABLED: undefined }, cookie),
    ).toMatchObject({ access: "unavailable", userId });

    expect(
      await save({ ...env, FINANCE_STORAGE_ENABLED: undefined }, cookie, {
        _intent: "category.add",
        name: "Viajes",
      }),
    ).toEqual({
      ok: false,
      message:
        "No fue posible guardar sus datos en este momento. Intente nuevamente más tarde.",
    });

    expect(await load(env, cookie)).toMatchObject({
      access: "edit",
      userId,
      email: "one@example.test",
      document: starterFinanceDocument(),
    });
  });

  it("applies form commands to the stored document using the starter category IDs already shown", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("plan@example.test");
    const [category] = (await load(env, cookie)).document.categories;

    expect(category.id).toBe("starter-1");

    expect(
      await save(env, cookie, {
        _intent: "allocation.save",
        month: "2026-10",
        categoryId: category.id,
        amount: "1500,50",
      }),
    ).toEqual({ ok: true, message: "Cambios guardados." });

    expect(
      (
        await save(env, cookie, {
          _intent: "salary.save",
          month: "2026-10",
          amount: "900000",
        })
      ).ok,
    ).toBe(true);

    const { document: stored } = await load(env, cookie);
    expect(stored.allocations).toEqual({
      "2026-10": { [category.id]: 150050 },
    });
    expect(stored.salaries).toEqual({ "2026-10": 90000000 });

    expect(
      database
        .prepare("SELECT revision FROM finance_documents WHERE user_id = ?")
        .get(userId),
    ).toEqual({ revision: 2 });
  });

  it("reads a stored document written before a defaulted field existed", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("legacy@example.test");

    // A document stored by an earlier release lacks fields that are defaults today.
    const legacy: Partial<LocalFinanceDocument> = document();
    delete legacy.goals;

    database
      .prepare(
        "INSERT INTO finance_documents (user_id, revision, document, created_at, updated_at) VALUES (?, 1, ?, datetime('now'), datetime('now'))",
      )
      .run(userId, JSON.stringify(legacy));

    expect(await load(env, cookie)).toMatchObject({
      access: "edit",
      document: { goals: [], salaries: document().salaries },
    });
  });

  it("re-applies concurrent saves on the latest revision instead of overwriting them", async ({
    onTestFinished,
  }) => {
    const { env, signIn } = await setup(onTestFinished);
    const { cookie } = await signIn("race@example.test");

    const results = await Promise.all(
      ["Viajes", "Regalos", "Mascotas"].map((name) =>
        save(env, cookie, { _intent: "category.add", name }),
      ),
    );

    expect(results.every((result) => result.ok)).toBe(true);

    expect(
      (await load(env, cookie)).document.categories.map((item) => item.name),
    ).toEqual(expect.arrayContaining(["Viajes", "Regalos", "Mascotas"]));
  });

  it("round trips an imported copy and isolates accounts", async ({
    onTestFinished,
  }) => {
    const { env, signIn } = await setup(onTestFinished);
    const first = await signIn("first@example.test");
    const second = await signIn("second@example.test");

    await seedDocument(env, first.cookie);

    expect((await load(env, first.cookie)).document).toEqual(document());

    expect((await load(env, second.cookie)).document).toEqual(
      starterFinanceDocument(),
    );

    const exported = await handleFinanceExport(
      request("GET", first.cookie),
      env,
    );

    expect(exported.status).toBe(200);
    expect(exported.headers.get("Cache-Control")).toBe("private, no-store");

    expect(exported.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="tu-economia-\d{4}-\d{2}-\d{2}\.json"$/,
    );

    expect(await exported.json()).toEqual(document());
  });

  it("rejects cross-origin forms, ambiguous amounts and invalid copies without changing the record", async ({
    onTestFinished,
  }) => {
    const { env, signIn } = await setup(onTestFinished);
    const { cookie } = await signIn("strict@example.test");
    await seedDocument(env, cookie);

    expect(
      (
        await handleFinanceForm(
          formRequest(
            cookie,
            { _intent: "category.add", name: "Viajes" },
            { Origin: "https://attacker.example.test" },
          ),
          env,
        )
      ).ok,
    ).toBe(false);

    expect(
      await save(env, cookie, {
        _intent: "salary.save",
        month: "2026-01",
        amount: "1.000.000",
      }),
    ).toEqual({
      ok: false,
      message: "Ingrese un importe válido, sin separadores de miles.",
    });

    expect(
      (
        await save(env, cookie, {
          _intent: "data.import",
          file: new File(["{"], "copia.json"),
        })
      ).ok,
    ).toBe(false);

    expect(
      (
        await save(env, cookie, {
          _intent: "data.import",
          file: backup({ ...document(), version: 2 }),
        })
      ).ok,
    ).toBe(false);

    expect((await load(env, cookie)).document).toEqual(document());
  });

  it("keeps reading, export and deletion open after the entitlement lapses", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("lapsed@example.test");
    await seedDocument(env, cookie);

    database
      .prepare(
        "UPDATE billing_subscriptions SET trial_ends_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(userId);

    // A lapsed subscription already used its free month.
    expect(await load(env, cookie)).toMatchObject({
      access: "read-only",
      trialEligible: false,
      document: document(),
    });

    expect(
      await save(env, cookie, { _intent: "category.add", name: "Viajes" }),
    ).toEqual({
      ok: false,
      message:
        "Su suscripción no está activa. Puede consultar, exportar o eliminar sus registros, pero no modificarlos.",
    });

    expect(
      (
        await save(env, cookie, {
          _intent: "data.import",
          file: backup(document()),
        })
      ).ok,
    ).toBe(false);

    expect(
      (await handleFinanceExport(request("GET", cookie), env)).status,
    ).toBe(200);

    expect(
      (await save(env, cookie, { _intent: "data.clear", confirmation: "no" }))
        .ok,
    ).toBe(false);

    expect(
      await save(env, cookie, {
        _intent: "data.clear",
        confirmation: " Borrar ",
      }),
    ).toEqual({ ok: true, message: "Sus registros se eliminaron." });

    expect((await load(env, cookie)).document).toEqual(
      starterFinanceDocument(),
    );
  });

  it("requires activation and a session to export", async ({
    onTestFinished,
  }) => {
    const { env, signIn } = await setup(onTestFinished);
    const { cookie } = await signIn("export@example.test");

    expect((await handleFinanceExport(request("GET"), env)).status).toBe(401);

    expect(
      (
        await handleFinanceExport(request("GET", cookie), {
          ...env,
          FINANCE_STORAGE_ENABLED: "false",
        })
      ).status,
    ).toBe(503);

    expect(
      (await handleFinanceExport(request("POST", cookie, {}), env)).status,
    ).toBe(405);
  });
});

describe("lapsed record retention", () => {
  it("notifies before deleting, retries failed notices and spares resubscribed accounts", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database, delivery } = await setup(onTestFinished);
    const lapsed = await signIn("lapsed-retention@example.test");
    const active = await signIn("active-retention@example.test");
    await seedDocument(env, lapsed.cookie);
    await seedDocument(env, active.cookie);

    const lapse = (trialEnd: string) =>
      database
        .prepare(
          "UPDATE billing_subscriptions SET trial_ends_at = ? WHERE user_id = ?",
        )
        .run(trialEnd, lapsed.userId);

    lapse("2026-01-31T00:00:00.000Z");

    database
      .prepare("UPDATE finance_documents SET updated_at = ?")
      .run("2026-01-15T00:00:00.000Z");

    const noticeState = () =>
      database
        .prepare(
          "SELECT deletion_notice_attempted_at AS attempted, deletion_notice_sent_at AS sent FROM finance_documents WHERE user_id = ?",
        )
        .get(lapsed.userId) as {
        attempted: string | null;
        sent: string | null;
      };

    const idle = { notified: 0, deleted: 0, reset: 0, failed: 0 };

    expect(
      await runFinanceRetention(
        { ...env, FINANCE_STORAGE_ENABLED: undefined },
        new Date("2026-04-01T00:00:00.000Z"),
      ),
    ).toEqual(idle);

    expect(
      await runFinanceRetention(env, new Date("2026-03-01T00:00:00.000Z")),
    ).toEqual(idle);

    // A failed delivery still records the attempt, so the deletion clock starts.
    delivery.status = 500;

    expect(
      await runFinanceRetention(env, new Date("2026-04-01T00:00:00.000Z")),
    ).toEqual({ ...idle, failed: 1 });

    expect(noticeState()).toEqual({
      attempted: "2026-04-01T00:00:00.000Z",
      sent: null,
    });

    // Resend accepts the message for delivery with a 2xx response, so 204 counts as delivered.
    delivery.status = 204;

    expect(
      await runFinanceRetention(env, new Date("2026-04-01T00:00:00.000Z")),
    ).toEqual({ ...idle, notified: 1 });

    expect(noticeState()).toEqual({
      attempted: "2026-04-01T00:00:00.000Z",
      sent: "2026-04-01T00:00:00.000Z",
    });

    // The notice is dated in the account's timezone, one calendar day earlier than the stored deadline.
    expect(delivery.messages.at(-1)).toEqual({
      from: "Tu Economía <acceso@auth.example.test>",
      to: "lapsed-retention@example.test",
      subject:
        "Se eliminarán sus registros de Mi economía el 30 de abril de 2026",
      text: expect.stringContaining(
        `${origin}/mi-economia?tab=usuario#suscripcion`,
      ),
      html: expect.stringContaining(
        `${origin}/mi-economia?tab=usuario#suscripcion`,
      ),
    });

    expect(await load(env, lapsed.cookie)).toMatchObject({
      access: "read-only",
      deletionDate: "2026-05-01T00:00:00.000Z",
    });

    expect((await load(env, active.cookie)).deletionDate).toBeNull();

    // Resubscribing before the deadline cancels the pending deletion.
    lapse("2099-01-01T00:00:00.000Z");

    expect(
      await runFinanceRetention(env, new Date("2026-05-01T00:00:00.000Z")),
    ).toEqual({ ...idle, reset: 1 });

    expect(noticeState()).toEqual({ attempted: null, sent: null });

    lapse("2026-01-31T00:00:00.000Z");
    await runFinanceRetention(env, new Date("2026-04-01T00:00:00.000Z"));

    expect(
      await runFinanceRetention(env, new Date("2026-04-29T00:00:00.000Z")),
    ).toEqual(idle);

    expect(
      await runFinanceRetention(env, new Date("2026-05-01T00:00:00.000Z")),
    ).toEqual({ ...idle, deleted: 1 });

    expect(
      database.prepare("SELECT user_id FROM finance_documents").all(),
    ).toEqual([{ user_id: active.userId }]);

    expect(await load(env, lapsed.cookie)).toMatchObject({
      access: "read-only",
      deletionDate: null,
      document: starterFinanceDocument(),
    });
  });

  it("deletes a month after a failed notice when the address is unusable", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database, delivery } = await setup(onTestFinished);
    const lapsed = await signIn("undeliverable@example.test");
    await seedDocument(env, lapsed.cookie);

    database
      .prepare(
        "UPDATE billing_subscriptions SET trial_ends_at = ? WHERE user_id = ?",
      )
      .run("2026-01-31T00:00:00.000Z", lapsed.userId);

    database
      .prepare("UPDATE finance_documents SET updated_at = ? WHERE user_id = ?")
      .run("2026-01-15T00:00:00.000Z", lapsed.userId);

    delivery.status = 550;

    expect(
      await runFinanceRetention(env, new Date("2026-04-01T00:00:00.000Z")),
    ).toEqual({ notified: 0, deleted: 0, reset: 0, failed: 1 });

    expect(
      database
        .prepare(
          "SELECT deletion_notice_attempted_at AS attempted, deletion_notice_sent_at AS sent FROM finance_documents WHERE user_id = ?",
        )
        .get(lapsed.userId),
    ).toEqual({
      attempted: "2026-04-01T00:00:00.000Z",
      sent: null,
    });

    // The provider keeps rejecting, but the first attempt anchors the deadline.
    expect(
      await runFinanceRetention(env, new Date("2026-05-01T00:00:00.000Z")),
    ).toEqual({ notified: 0, deleted: 1, reset: 0, failed: 0 });

    expect(
      database
        .prepare("SELECT user_id FROM finance_documents WHERE user_id = ?")
        .get(lapsed.userId),
    ).toBeUndefined();
  });
});

describe("account deletion", () => {
  it("requires a session, explicit confirmation and same-origin JSON", async ({
    onTestFinished,
  }) => {
    const { env, signIn } = await setup(onTestFinished);

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", "", {
            expectedUserId: "anonymous",
            confirmation: "ELIMINAR",
          }),
          env,
        )
      ).status,
    ).toBe(401);

    const { cookie, userId } = await signIn("delete-confirm@example.test");

    expect(
      (await handleAccountDeletion(request("DELETE", cookie, {}), env)).status,
    ).toBe(400);

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", cookie, { confirmation: "ELIMINAR" }),
          env,
        )
      ).status,
    ).toBe(400);

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", cookie, {
            expectedUserId: userId,
            confirmation: "DELETE",
          }),
          env,
        )
      ).status,
    ).toBe(400);

    expect(
      (
        await handleAccountDeletion(
          request(
            "DELETE",
            cookie,
            { expectedUserId: userId, confirmation: "ELIMINAR" },
            { Origin: "https://evil.example" },
          ),
          env,
        )
      ).status,
    ).toBe(403);

    const noOrigin = request("DELETE", cookie, {
      expectedUserId: userId,
      confirmation: "ELIMINAR",
    });

    noOrigin.headers.delete("Origin");
    expect((await handleAccountDeletion(noOrigin, env)).status).toBe(403);

    expect(
      (await handleAccountDeletion(request("GET", cookie), env)).status,
    ).toBe(405);
  });

  it("deletes only the authenticated account, cloud snapshots and legacy finance, and revokes its sessions", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database, auth } = await setup(onTestFinished);
    const first = await signIn("delete-first@example.test");
    const second = await signIn("delete-second@example.test");
    for (const account of [first, second]) {
      await seedDocument(env, account.cookie);

      database
        .prepare(
          'INSERT INTO "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          `provider-${account.userId}`,
          account.userId,
          "synthetic",
          account.userId,
          Date.now(),
          Date.now(),
        );
    }

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", first.cookie, {
            expectedUserId: first.userId,
            confirmation: "ELIMINAR",
            userId: second.userId,
          }),
          env,
        )
      ).status,
    ).toBe(400);

    // Account deletion remains available even when finance storage has been disabled.
    const deleted = await handleAccountDeletion(
      request("DELETE", first.cookie, {
        expectedUserId: first.userId,
        confirmation: "ELIMINAR",
      }),
      {
        ...env,
        FINANCE_STORAGE_ENABLED: "false",
        MP_ACCESS_TOKEN: "synthetic-token",
      },
      canceledProvider,
    );

    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });

    for (const [table, column] of [
      ["user", "id"],
      ["session", "userId"],
      ["account", "userId"],
      ["finance_documents", "user_id"],
    ])
      expect(
        database.prepare(`SELECT "${column}" AS owner FROM "${table}"`).all(),
      ).toEqual([{ owner: second.userId }]);

    expect(
      await auth.api.getSession({
        headers: new Headers({ Cookie: first.cookie }),
      }),
    ).toBeNull();

    expect(
      (await handleFinanceExport(request("GET", first.cookie), env)).status,
    ).toBe(401);

    expect(
      (await handleFinanceExport(request("GET", second.cookie), env)).status,
    ).toBe(200);
  });

  it("revokes only pending magic links for the deleted email, including differently cased addresses", async ({
    onTestFinished,
  }) => {
    const { env, signIn, issueLink, database, auth } =
      await setup(onTestFinished);

    const email = "pending-delete@example.test";
    const first = await signIn(email);
    const second = await signIn("pending-other@example.test");

    const pendingLinks = [
      await issueLink(email),
      await issueLink(email.toUpperCase()),
    ];

    const otherLink = await issueLink("pending-other@example.test");

    const before = database
      .prepare("SELECT identifier, value FROM verification ORDER BY rowid")
      .all();

    expect(before).toHaveLength(3);

    expect(before.map((row) => JSON.parse(String(row.value)))).toEqual([
      { type: "magic-link", email },
      { type: "magic-link", email: email.toUpperCase() },
      { type: "magic-link", email: "pending-other@example.test" },
    ]);

    for (const row of before) expect(row.identifier).toMatch(/^magic-link:/);

    // Other verification purposes and malformed unrelated rows must remain intact.
    for (const [id, value] of [
      ["malformed", "not-json"],
      ["other-type", JSON.stringify({ type: "other", email })],
    ])
      database
        .prepare(
          'INSERT INTO verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          `magic-link:${id}`,
          value,
          Date.now() + 300000,
          Date.now(),
          Date.now(),
        );

    const deleted = await handleAccountDeletion(
      request("DELETE", first.cookie, {
        expectedUserId: first.userId,
        confirmation: "ELIMINAR",
      }),
      { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
      canceledProvider,
    );

    expect(deleted.status).toBe(200);

    expect(
      database
        .prepare("SELECT identifier, value FROM verification ORDER BY rowid")
        .all(),
    ).toEqual([
      before[2],
      { identifier: "magic-link:malformed", value: "not-json" },
      {
        identifier: "magic-link:other-type",
        value: JSON.stringify({ type: "other", email }),
      },
    ]);

    for (const link of pendingLinks) {
      const attempted = await auth.handler(new Request(link));
      expect(attempted.status).toBe(302);

      expect(
        new URL(attempted.headers.get("Location")!).searchParams.get("error"),
      ).toBe("INVALID_TOKEN");

      expect(attempted.headers.getSetCookie().join(";")).not.toContain(
        "better-auth.session_token=",
      );
    }

    expect(database.prepare('SELECT id FROM "user"').all()).toEqual([
      { id: second.userId },
    ]);

    const otherSignIn = await auth.handler(new Request(otherLink));

    expect(otherSignIn.headers.getSetCookie().join(";")).toContain(
      "better-auth.session_token=",
    );

    expect(database.prepare('SELECT id FROM "user"').all()).toEqual([
      { id: second.userId },
    ]);
  });

  it("rolls back verification and legacy deletions if deleting the auth user fails", async ({
    onTestFinished,
  }) => {
    const { env, signIn, issueLink, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("rollback@example.test");
    await issueLink("rollback@example.test");

    const verificationBefore = database
      .prepare("SELECT * FROM verification")
      .all();

    database.exec(
      "CREATE TRIGGER reject_user_delete BEFORE DELETE ON \"user\" BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", cookie, {
            expectedUserId: userId,
            confirmation: "ELIMINAR",
          }),
          env,
        )
      ).status,
    ).toBe(500);

    expect(database.prepare("SELECT * FROM verification").all()).toEqual(
      verificationBefore,
    );

    expect(
      (await handleFinanceExport(request("GET", cookie), env)).status,
    ).toBe(200);
  });
});

describe("subscription entitlement", () => {
  it("preserves canceled trial access to its exact end and rejects expired or pending records", () => {
    const row = {
      user_id: "synthetic",
      plan_id: "plan",
      checkout_url: null,
      subscription_id: "sub",
      provider_status: "canceled",
      trial_ends_at: "2026-02-28T12:00:00.000Z",
      paid_until: null,
      canceled_at: "2026-01-31T12:00:00.000Z",
      account_deleted_at: null,
      last_verified_at: null,
    };

    expect(hasCloudEntitlement(row, new Date("2026-02-28T11:59:59.999Z"))).toBe(
      true,
    );

    expect(hasCloudEntitlement(row, new Date("2026-02-28T12:00:00.000Z"))).toBe(
      false,
    );

    expect(
      hasCloudEntitlement(
        { ...row, provider_status: "pending" },
        new Date("2026-02-01"),
      ),
    ).toBe(false);

    expect(
      hasCloudEntitlement(
        { ...row, account_deleted_at: "2026-02-01" },
        new Date("2026-02-01"),
      ),
    ).toBe(false);

    const paid = {
      ...row,
      trial_ends_at: "2026-01-01T00:00:00.000Z",
      paid_until: "2026-03-01T00:00:00.000Z",
    };

    expect(
      hasCloudEntitlement(paid, new Date("2026-02-28T23:59:59.999Z")),
    ).toBe(true);

    expect(
      hasCloudEntitlement(
        { ...paid, provider_status: "paused" },
        new Date("2026-02-28T23:59:59.999Z"),
      ),
    ).toBe(true);

    expect(
      hasCloudEntitlement(
        { ...paid, provider_status: "paused" },
        new Date("2026-03-01T00:00:00.000Z"),
      ),
    ).toBe(false);

    expect(
      hasCloudEntitlement(paid, new Date("2026-03-01T00:00:00.000Z")),
    ).toBe(false);

    expect(
      hasCloudEntitlement(
        { ...paid, paid_until: null },
        new Date("2026-02-01"),
      ),
    ).toBe(false);
  });

  it("cancels renewal even when authorized-payment recovery is unavailable", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);

    const { cookie, userId } = await signIn(
      "cancel-without-search@example.test",
    );

    database
      .prepare(
        "UPDATE billing_subscriptions SET provider_status = 'authorized', trial_ends_at = '2020-01-01T00:00:00.000Z', canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };
    let status = "authorized";

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.includes("authorized_payments"))
        return new Response(null, { status: 503 });

      if (!url.endsWith(`/preapproval/synthetic-${userId}`))
        throw new Error(`Unexpected request ${url}`);

      if (init?.method === "PUT") status = "canceled";

      return Response.json({ id: `synthetic-${userId}`, status });
    }) as typeof fetch;

    expect(
      (
        await handleBilling(
          request("DELETE", cookie, { expectedUserId: userId }),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT provider_status FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({ provider_status: "canceled" });
  });

  it("stops a known renewal during a plan-search outage and reports incomplete reconciliation", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);

    const { cookie, userId } = await signIn(
      "cancel-search-outage@example.test",
    );

    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = 'plan-outage', provider_status = 'authorized', canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };
    let status = "authorized";

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.includes("/preapproval/search?"))
        return new Response(null, { status: 503 });

      if (!url.endsWith(`/preapproval/synthetic-${userId}`))
        throw new Error(`Unexpected request ${url}`);

      if (init?.method === "PUT") status = "canceled";

      return Response.json({ id: `synthetic-${userId}`, status });
    }) as typeof fetch;

    const response = await handleBilling(
      request("DELETE", cookie, { expectedUserId: userId }),
      live,
      providerFetch,
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toMatchObject({
      canceled: true,
      reconciliationRequired: true,
    });

    expect(
      database
        .prepare(
          "SELECT provider_status FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({ provider_status: "canceled" });
  });

  it("reports the paid period as access end after cancelling a plan without a trial", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("cancel-paid-only@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = NULL, provider_status = 'authorized', trial_ends_at = NULL, paid_until = '2030-05-10T00:00:00.000Z', canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };
    let status = "authorized";

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      if (!String(input).endsWith(`/preapproval/synthetic-${userId}`))
        throw new Error(`Unexpected request ${input}`);

      if (init?.method === "PUT") status = "canceled";

      return Response.json({ id: `synthetic-${userId}`, status });
    }) as typeof fetch;

    const response = await handleBilling(
      request("DELETE", cookie, { expectedUserId: userId }),
      live,
      providerFetch,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      canceled: true,
      reconciliationRequired: false,
      accessUntil: "2030-05-10T00:00:00.000Z",
    });
  });

  it("refuses account deletion if provider cancellation fails, then cancels before deleting", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("cancel-delete@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET provider_status = 'authorized', canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };

    const deletion = request("DELETE", cookie, {
      expectedUserId: userId,
      confirmation: "ELIMINAR",
    });

    const failed = (async () =>
      new Response(null, { status: 500 })) as typeof fetch;

    expect((await handleAccountDeletion(deletion, live, failed)).status).toBe(
      500,
    );

    expect(
      database.prepare('SELECT id FROM "user" WHERE id = ?').get(userId),
    ).toEqual({ id: userId });

    expect(
      database
        .prepare(
          "SELECT provider_status FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({ provider_status: "authorized" });

    const successful = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      Response.json({
        id: `synthetic-${userId}`,
        preapproval_plan_id: "plan",
        payer_email: "cancel-delete@example.test",
        status: "canceled",
        date_created: "2026-01-01T00:00:00.000Z",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 5000,
          currency_id: "ARS",
          free_trial: { frequency: 1, frequency_type: "months" },
        },
        method: init?.method,
      })) as typeof fetch;

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", cookie, {
            expectedUserId: userId,
            confirmation: "ELIMINAR",
          }),
          live,
          successful,
        )
      ).status,
    ).toBe(200);

    expect(
      database.prepare('SELECT id FROM "user" WHERE id = ?').get(userId),
    ).toBeUndefined();

    expect(
      database
        .prepare(
          "SELECT account_deleted_at, provider_status FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      account_deleted_at: expect.any(String),
      provider_status: "canceled",
    });
  });

  it("does not start a trial from sign-in or a pending checkout, and gates finance edits", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("pending@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    const edit = { _intent: "category.add", name: "Viajes" };
    expect((await save(env, cookie, edit)).ok).toBe(false);
    expect((await load(env, cookie)).access).toBe("read-only");

    expect(
      (await handleFinanceExport(request("GET", cookie), env)).status,
    ).toBe(200);

    expect(
      (
        await handleBilling(
          request("POST", cookie, { expectedUserId: userId }),
          env,
        )
      ).status,
    ).toBe(400);

    expect(
      (
        await handleBilling(
          request("POST", cookie, {
            expectedUserId: "other",
            acceptedTerms: true,
          }),
          env,
        )
      ).status,
    ).toBe(403);

    const checkout =
      "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=plan-1";

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        "https://api.mercadopago.com/preapproval_plan",
      );

      expect(init?.method).toBe("POST");

      expect(JSON.parse(String(init?.body)).auto_recurring).toMatchObject({
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 5000,
        currency_id: "ARS",
        free_trial: { frequency: 1, frequency_type: "months" },
      });

      return Response.json({ id: "plan-1", init_point: checkout });
    }) as typeof fetch;

    const enrolled = await handleBilling(
      request("POST", cookie, { expectedUserId: userId, acceptedTerms: true }),
      { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
      providerFetch,
    );

    expect(await enrolled.json()).toEqual({ checkoutURL: checkout });

    const pendingFetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://api.mercadopago.com/preapproval/search?preapproval_plan_id=plan-1",
      );

      return Response.json({ paging: { total: 0 }, results: [] });
    }) as typeof fetch;

    // A checkout that produced no subscription resumes on its own plan instead of creating another one.
    const retried = await handleBilling(
      request("POST", cookie, {
        expectedUserId: userId,
        acceptedTerms: true,
      }),
      { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
      pendingFetch,
    );

    expect(retried.status).toBe(200);
    expect(await retried.json()).toEqual({ checkoutURL: checkout });

    const status = await handleBilling(
      request("GET", cookie),
      { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
      pendingFetch,
    );

    expect(await status.json()).toMatchObject({
      status: "pending",
      entitled: false,
      checkoutURL: checkout,
    });

    expect((await save(env, cookie, edit)).ok).toBe(false);

    expect(
      database
        .prepare(
          "SELECT trial_ends_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      trial_ends_at: null,
    });

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", cookie, {
            expectedUserId: userId,
            confirmation: "ELIMINAR",
          }),
          { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
          pendingFetch,
        )
      ).status,
    ).toBe(409);
  });

  it("links the subscription when its first payment notification arrives before it", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { userId } = await signIn("payment-first@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, plan_id, provider_status, created_at, updated_at) VALUES (?, 'plan-replacement', 'pending', ?, ?)",
      )
      .run(userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    const providerFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/authorized_payments/pay-first"))
        return Response.json({
          id: "pay-first",
          preapproval_id: "sub-replacement",
          debit_date: "2026-03-10T12:00:00.000Z",
          currency_id: "ARS",
          transaction_amount: 5000,
          payment: { status: "approved" },
        });

      if (url.endsWith("/preapproval/sub-replacement"))
        return Response.json({
          id: "sub-replacement",
          preapproval_plan_id: "plan-replacement",
          payer_email: "",
          status: "authorized",
          date_created: "2026-03-10T11:59:00.000Z",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 5000,
            currency_id: "ARS",
          },
        });

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    const response = await handleBillingWebhook(
      await signedBillingEvent(
        live.MP_WEBHOOK_SECRET,
        "subscription_authorized_payment",
        "pay-first",
      ),
      live,
      providerFetch,
    );

    expect(await response.json()).toEqual({ received: true });

    expect(
      database
        .prepare(
          "SELECT subscription_id, provider_status, trial_ends_at, paid_until FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      subscription_id: "sub-replacement",
      provider_status: "authorized",
      trial_ends_at: null,
      paid_until: "2026-04-10T12:00:00.000Z",
    });

    expect(
      database
        .prepare(
          "SELECT status FROM billing_payments WHERE provider_payment_id = 'pay-first'",
        )
        .get(),
    ).toEqual({ status: "approved" });
  });

  it("adopts a re-subscription the buyer made from Mercado Pago on the cancelled subscription's plan", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("buyer-resubscribed@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = 'plan-current', subscription_id = 'sub-cancelled', provider_status = 'canceled', trial_ends_at = NULL, paid_until = NULL, canceled_at = '2026-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(userId);

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    const providerFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/preapproval/search?preapproval_plan_id=plan-current"))
        return Response.json({
          paging: { total: 2 },
          results: [{ id: "sub-cancelled" }, { id: "sub-again" }],
        });

      if (url.endsWith("/preapproval/sub-cancelled"))
        return Response.json({ id: "sub-cancelled", status: "cancelled" });

      if (url.endsWith("/preapproval/sub-again"))
        return Response.json({
          id: "sub-again",
          preapproval_plan_id: "plan-current",
          status: "authorized",
          date_created: "2026-03-10T11:59:00.000Z",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 5000,
            currency_id: "ARS",
          },
        });

      if (url.includes("/authorized_payments/search?"))
        return Response.json({ paging: { total: 0 }, results: [] });

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    const notified = await handleBillingWebhook(
      await signedBillingEvent(
        live.MP_WEBHOOK_SECRET,
        "subscription_preapproval",
        "sub-again",
      ),
      live,
      providerFetch,
    );

    expect(await notified.json()).toEqual({ received: true });

    expect(
      database
        .prepare(
          "SELECT subscription_id, provider_status, canceled_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      subscription_id: "sub-again",
      provider_status: "authorized",
      canceled_at: null,
    });

    // The status check now finds the adopted subscription live and the old one cancelled.
    const status = await handleBilling(
      request("GET", cookie),
      live,
      providerFetch,
    );

    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ status: "authorized" });
  });

  it("stops when a cancelled subscription reads as authorized again", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("reactivated@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = 'plan-current', subscription_id = 'sub-reactivated', provider_status = 'canceled', canceled_at = '2026-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(userId);

    const providerFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/preapproval/search?preapproval_plan_id=plan-current"))
        return Response.json({
          paging: { total: 1 },
          results: [{ id: "sub-reactivated" }],
        });

      if (url.endsWith("/preapproval/sub-reactivated"))
        return Response.json({
          id: "sub-reactivated",
          preapproval_plan_id: "plan-current",
          status: "authorized",
          date_created: "2026-01-01T00:00:00.000Z",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 5000,
            currency_id: "ARS",
          },
        });

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };

    const response = await handleBilling(
      request("GET", cookie),
      live,
      providerFetch,
    );

    expect(response.status).toBe(409);

    expect(
      database
        .prepare(
          "SELECT provider_status, canceled_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      provider_status: "canceled",
      canceled_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("cancels a subscription whose plan belongs to no account", async ({
    onTestFinished,
  }) => {
    const { env } = await setup(onTestFinished);
    const cancellations: string[] = [];

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith("/preapproval/sub-orphan")) {
        if (init?.method === "PUT") {
          cancellations.push(String(init.body));

          return Response.json({ id: "sub-orphan", status: "cancelled" });
        }

        return Response.json({
          id: "sub-orphan",
          preapproval_plan_id: "plan-replaced",
          status: cancellations.length ? "cancelled" : "authorized",
          date_created: "2026-03-10T11:59:00.000Z",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 5000,
            currency_id: "ARS",
            free_trial: { frequency: 1, frequency_type: "months" },
          },
        });
      }

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    const response = await handleBillingWebhook(
      await signedBillingEvent(
        live.MP_WEBHOOK_SECRET,
        "subscription_preapproval",
        "sub-orphan",
      ),
      live,
      providerFetch,
    );

    expect(await response.json()).toEqual({ ignored: true });
    expect(cancellations).toEqual([JSON.stringify({ status: "cancelled" })]);
  });

  it("recovers a lost subscription notification before status, cancellation, and deletion", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("recovered@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, plan_id, provider_status, created_at, updated_at) VALUES (?, 'plan-recovered', 'pending', ?, ?)",
      )
      .run(userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };
    let status = "authorized";
    let cancellations = 0;

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (
        url.endsWith("/preapproval/search?preapproval_plan_id=plan-recovered")
      )
        return Response.json({
          paging: { total: 1 },
          results: [{ id: "sub-recovered" }],
        });

      if (url.endsWith("/preapproval/sub-recovered")) {
        if (init?.method === "PUT") {
          status = "canceled";
          cancellations++;
        }

        return Response.json({
          id: "sub-recovered",
          preapproval_plan_id: "plan-recovered",
          // A plan's hosted checkout can leave the payer email empty; it must not block the subscription.
          payer_email: "",
          status,
          date_created: new Date().toISOString(),
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: "5000.00",
            currency_id: "ARS",
            free_trial: { frequency: 1, frequency_type: "months" },
          },
        });
      }

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    const recovered = await handleBilling(
      request("GET", cookie),
      live,
      providerFetch,
    );

    expect(recovered.status).toBe(200);

    expect(await recovered.json()).toMatchObject({
      entitled: true,
      status: "authorized",
    });

    expect(
      database
        .prepare(
          "SELECT subscription_id, trial_ends_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      subscription_id: "sub-recovered",
      trial_ends_at: expect.any(String),
    });

    expect(
      (
        await handleBilling(
          request("DELETE", cookie, { expectedUserId: userId }),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(cancellations).toBe(1);

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", cookie, {
            expectedUserId: userId,
            confirmation: "ELIMINAR",
          }),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(cancellations).toBe(1);
  });

  it("sets aside a cancelled subscription left on the plan by a rejected card", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("rejected-card@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = 'plan-rejected', subscription_id = NULL, provider_status = 'pending', trial_ends_at = NULL, paid_until = NULL, canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const providerFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/preapproval/search?preapproval_plan_id=plan-rejected"))
        return Response.json({
          paging: { total: 2 },
          results: [{ id: "sub-rejected" }, { id: "sub-live" }],
        });

      // Mercado Pago spells the status it returns "cancelled".
      if (url.endsWith("/preapproval/sub-rejected"))
        return Response.json({ id: "sub-rejected", status: "cancelled" });

      if (url.endsWith("/preapproval/sub-live"))
        return Response.json({
          id: "sub-live",
          preapproval_plan_id: "plan-rejected",
          status: "authorized",
          date_created: new Date().toISOString(),
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 5000,
            currency_id: "ARS",
            free_trial: { frequency: 1, frequency_type: "months" },
          },
        });

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };
    const response = await handleBilling(
      request("GET", cookie),
      live,
      providerFetch,
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toMatchObject({
      entitled: true,
      status: "authorized",
    });

    expect(
      database
        .prepare(
          "SELECT subscription_id FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({ subscription_id: "sub-live" });
  });

  it("keeps an uncertain plan creation reserved so a retry cannot create a second checkout", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("uncertain@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    let providerCalls = 0;

    const failedProvider = (async () => {
      providerCalls++;

      return new Response(null, { status: 503 });
    }) as typeof fetch;

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };

    const checkoutRequest = () =>
      request("POST", cookie, { expectedUserId: userId, acceptedTerms: true });

    expect(
      (await handleBilling(checkoutRequest(), live, failedProvider)).status,
    ).toBe(502);

    expect(
      database
        .prepare(
          "SELECT provider_status, plan_id FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      provider_status: "creating",
      plan_id: null,
    });

    expect(
      (await handleBilling(checkoutRequest(), live, failedProvider)).status,
    ).toBe(409);

    expect(providerCalls).toBe(1);
  });

  it("starts a new plan for a cancelled subscription whose access has ended", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn(
      "resubscribe-canceled@example.test",
    );

    database
      .prepare(
        "UPDATE billing_subscriptions SET trial_ends_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(userId);

    const checkout =
      "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=plan-new";

    let planRequests = 0;

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        "https://api.mercadopago.com/preapproval_plan",
      );

      expect(init?.method).toBe("POST");

      const { auto_recurring } = JSON.parse(String(init?.body));

      expect(auto_recurring).toMatchObject({
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 5000,
        currency_id: "ARS",
      });
      expect(auto_recurring).not.toHaveProperty("free_trial");

      planRequests++;

      return Response.json({ id: "plan-new", init_point: checkout });
    }) as typeof fetch;

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };

    const checkoutRequest = () =>
      request("POST", cookie, { expectedUserId: userId, acceptedTerms: true });

    const response = await handleBilling(
      checkoutRequest(),
      live,
      providerFetch,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checkoutURL: checkout });

    expect(
      database
        .prepare(
          "SELECT plan_id, checkout_url, subscription_id, provider_status, trial_ends_at, paid_until, canceled_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      plan_id: "plan-new",
      checkout_url: checkout,
      subscription_id: null,
      provider_status: "pending",
      trial_ends_at: null,
      paid_until: null,
      canceled_at: null,
    });

    // Until it is reconciled, the replacement checkout resumes its own plan instead of creating another.
    const pendingFetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://api.mercadopago.com/preapproval/search?preapproval_plan_id=plan-new",
      );

      return Response.json({ paging: { total: 0 }, results: [] });
    }) as typeof fetch;

    const resumed = await handleBilling(checkoutRequest(), live, pendingFetch);

    expect(await resumed.json()).toEqual({ checkoutURL: checkout });
    expect(planRequests).toBe(1);
  });

  it("keeps a replacement reservation when its plan response is lost", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("resubscribe-lost@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET trial_ends_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(userId);

    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };
    let providerCalls = 0;

    const failedProvider = (async () => {
      providerCalls++;

      return new Response(null, { status: 503 });
    }) as typeof fetch;

    const checkoutRequest = () =>
      request("POST", cookie, { expectedUserId: userId, acceptedTerms: true });

    expect(
      (await handleBilling(checkoutRequest(), live, failedProvider)).status,
    ).toBe(502);

    expect(
      database
        .prepare(
          "SELECT plan_id, subscription_id, provider_status FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      plan_id: null,
      subscription_id: null,
      provider_status: "creating",
    });

    expect(
      (await handleBilling(checkoutRequest(), live, failedProvider)).status,
    ).toBe(409);

    expect(providerCalls).toBe(1);
  });

  it("cancels an expired subscription before starting its replacement plan", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);

    const { cookie, userId } = await signIn("resubscribe-expired@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = 'plan-expired', provider_status = 'authorized', trial_ends_at = '2020-01-01T00:00:00.000Z', canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const subscriptionId = `synthetic-${userId}`;
    const checkout =
      "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=plan-replacement";

    let providerStatus = "authorized";
    let cancellations = 0;

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);

      if (url.endsWith("/preapproval/search?preapproval_plan_id=plan-expired"))
        return Response.json({
          paging: { total: 1 },
          results: [{ id: subscriptionId }],
        });

      if (url.endsWith(`/preapproval/${subscriptionId}`)) {
        if (init?.method === "PUT") {
          providerStatus = "canceled";
          cancellations++;
        }

        return Response.json({
          id: subscriptionId,
          preapproval_plan_id: "plan-expired",
          payer_email: "resubscribe-expired@example.test",
          status: providerStatus,
          date_created: "2026-01-01T00:00:00.000Z",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 5000,
            currency_id: "ARS",
            free_trial: { frequency: 1, frequency_type: "months" },
          },
        });
      }

      if (url.endsWith("/preapproval_plan")) {
        expect(init?.method).toBe("POST");

        return Response.json({ id: "plan-replacement", init_point: checkout });
      }

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    const response = await handleBilling(
      request("POST", cookie, { expectedUserId: userId, acceptedTerms: true }),
      { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
      providerFetch,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checkoutURL: checkout });
    expect(cancellations).toBe(1);

    expect(
      database
        .prepare(
          "SELECT plan_id, subscription_id, provider_status, trial_ends_at, paid_until, canceled_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      plan_id: "plan-replacement",
      subscription_id: null,
      provider_status: "pending",
      trial_ends_at: null,
      paid_until: null,
      canceled_at: null,
    });
  });

  it("grants no trial when a plan has no free month and gains access from its first payment", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { userId } = await signIn("no-trial@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, plan_id, provider_status, created_at, updated_at) VALUES (?, 'plan-no-trial', 'pending', ?, ?)",
      )
      .run(userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    const providerFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/preapproval/sub-no-trial"))
        return Response.json({
          id: "sub-no-trial",
          preapproval_plan_id: "plan-no-trial",
          payer_email: "no-trial@example.test",
          status: "authorized",
          date_created: "2026-10-16T12:00:00.000Z",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 5000,
            currency_id: "ARS",
          },
        });

      if (url.endsWith("/authorized_payments/pay-no-trial"))
        return Response.json({
          id: "pay-no-trial",
          preapproval_id: "sub-no-trial",
          debit_date: "2026-10-20T12:00:00.000Z",
          currency_id: "ARS",
          transaction_amount: "5000.00",
          payment: { status: "approved" },
        });

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    expect(
      (
        await handleBillingWebhook(
          await signedBillingEvent(
            live.MP_WEBHOOK_SECRET!,
            "subscription_preapproval",
            "sub-no-trial",
          ),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT trial_ends_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({ trial_ends_at: null });

    expect(
      (
        await handleBillingWebhook(
          await signedBillingEvent(
            live.MP_WEBHOOK_SECRET!,
            "subscription_authorized_payment",
            "pay-no-trial",
          ),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT trial_ends_at, paid_until FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      trial_ends_at: null,
      paid_until: "2026-11-20T12:00:00.000Z",
    });
  });

  it("still blocks active, pending, creating and ambiguous checkouts", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("checkout-guards@example.test");
    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };

    const checkoutRequest = () =>
      request("POST", cookie, { expectedUserId: userId, acceptedTerms: true });

    let providerCalls = 0;

    const unexpected = (async () => {
      providerCalls++;

      throw new Error("Unexpected provider request");
    }) as typeof fetch;

    // The seeded trial runs to 2030, so an active subscription is refused without contacting the provider.
    expect(
      (await handleBilling(checkoutRequest(), live, unexpected)).status,
    ).toBe(409);

    // An authorized replacement without a trial or a verified payment is still activating.
    database
      .prepare(
        "UPDATE billing_subscriptions SET provider_status = 'authorized', trial_ends_at = NULL, paid_until = NULL, canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    expect(
      (await handleBilling(checkoutRequest(), live, unexpected)).status,
    ).toBe(409);

    // A checkout that produced a plan but no confirmed subscription stays unreconciled.
    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = 'plan-pending', subscription_id = NULL, provider_status = 'pending', trial_ends_at = NULL, canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const pendingFetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://api.mercadopago.com/preapproval/search?preapproval_plan_id=plan-pending",
      );

      providerCalls++;

      return Response.json({ paging: { total: 0 }, results: [] });
    }) as typeof fetch;

    expect(
      (await handleBilling(checkoutRequest(), live, pendingFetch)).status,
    ).toBe(409);

    // A lost plan-creation response keeps its reservation.
    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = NULL, provider_status = 'creating' WHERE user_id = ?",
      )
      .run(userId);

    expect(
      (await handleBilling(checkoutRequest(), live, unexpected)).status,
    ).toBe(409);

    // Ambiguous plan results are never resolved into a replacement plan.
    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = 'plan-ambiguous', subscription_id = ?, provider_status = 'canceled', trial_ends_at = '2020-01-01T00:00:00.000Z', paid_until = NULL, canceled_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(`synthetic-${userId}`, userId);

    const ambiguousFetch = (async (input: RequestInfo | URL) => {
      providerCalls++;

      return ambiguousPlanSearch(input);
    }) as typeof fetch;

    expect(
      (await handleBilling(checkoutRequest(), live, ambiguousFetch)).status,
    ).toBe(409);

    // One search and one status read per result, and no plan request.
    expect(providerCalls).toBe(4);

    expect(
      database
        .prepare(
          "SELECT plan_id, subscription_id, provider_status FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      plan_id: "plan-ambiguous",
      subscription_id: `synthetic-${userId}`,
      provider_status: "canceled",
    });
  });

  it("refuses ambiguous provider subscriptions and preserves the account", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("ambiguous@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET plan_id = 'plan-ambiguous' WHERE user_id = ?",
      )
      .run(userId);

    const providerFetch = ambiguousPlanSearch as typeof fetch;
    const live = { ...env, MP_ACCESS_TOKEN: "synthetic-token" };

    expect(
      (await handleBilling(request("GET", cookie), live, providerFetch)).status,
    ).toBe(409);

    expect(
      (
        await handleAccountDeletion(
          request("DELETE", cookie, {
            expectedUserId: userId,
            confirmation: "ELIMINAR",
          }),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(409);

    expect(
      database.prepare('SELECT id FROM "user" WHERE id = ?').get(userId),
    ).toEqual({ id: userId });
  });

  it("attaches a subscription paid from a different address", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("right@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, plan_id, provider_status, created_at, updated_at) VALUES (?, 'plan-right', 'pending', ?, ?)",
      )
      .run(userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const providerFetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/preapproval/search?"))
        return Response.json({
          paging: { total: 1 },
          results: [{ id: "sub-other-payer" }],
        });

      return Response.json({
        id: "sub-other-payer",
        preapproval_plan_id: "plan-right",
        payer_email: "mercado-pago-account@example.test",
        status: "authorized",
        date_created: new Date().toISOString(),
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 5000,
          currency_id: "ARS",
          free_trial: { frequency: 1, frequency_type: "months" },
        },
      });
    }) as typeof fetch;

    expect(
      (
        await handleBilling(
          request("GET", cookie),
          { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
          providerFetch,
        )
      ).status,
    ).toBe(200);

    const stored = database
      .prepare(
        "SELECT subscription_id, trial_ends_at FROM billing_subscriptions WHERE user_id = ?",
      )
      .get(userId) as {
      subscription_id: string | null;
      trial_ends_at: string | null;
    };

    expect(stored.subscription_id).toBe("sub-other-payer");
    expect(stored.trial_ends_at).not.toBeNull();
  });

  it("accepts a webhook whose payer differs from the account email", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { userId } = await signIn("webhook-payer@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, plan_id, provider_status, created_at, updated_at) VALUES (?, 'plan-webhook-payer', 'pending', ?, ?)",
      )
      .run(userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    const providerFetch = (async () =>
      Response.json({
        id: "sub-webhook-payer",
        preapproval_plan_id: "plan-webhook-payer",
        payer_email: "mercado-pago-account@example.test",
        status: "authorized",
        date_created: "2026-10-16T12:00:00.000Z",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 5000,
          currency_id: "ARS",
          free_trial: { frequency: 1, frequency_type: "months" },
        },
      })) as typeof fetch;

    expect(
      (
        await handleBillingWebhook(
          await signedBillingEvent(
            live.MP_WEBHOOK_SECRET,
            "subscription_preapproval",
            "sub-webhook-payer",
          ),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT subscription_id, trial_ends_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      subscription_id: "sub-webhook-payer",
      trial_ends_at: "2026-11-16T12:00:00.000Z",
    });
  });

  it("refuses a subscription whose plan does not belong to the account", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("wrong-plan@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, plan_id, provider_status, created_at, updated_at) VALUES (?, 'plan-right', 'pending', ?, ?)",
      )
      .run(userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const providerFetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/preapproval/search?"))
        return Response.json({
          paging: { total: 1 },
          results: [{ id: "sub-wrong-plan" }],
        });

      return Response.json({
        id: "sub-wrong-plan",
        preapproval_plan_id: "plan-other",
        payer_email: "wrong-plan@example.test",
        status: "authorized",
        date_created: new Date().toISOString(),
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 5000,
          currency_id: "ARS",
          free_trial: { frequency: 1, frequency_type: "months" },
        },
      });
    }) as typeof fetch;

    expect(
      (
        await handleBilling(
          request("GET", cookie),
          { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
          providerFetch,
        )
      ).status,
    ).toBe(409);

    expect(
      database
        .prepare(
          "SELECT subscription_id, trial_ends_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      subscription_id: null,
      trial_ends_at: null,
    });
  });

  it("recovers an approved payment with a string amount after a missed notification", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("payment-recovery@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET trial_ends_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(userId);

    const debitDate = new Date().toISOString();

    const providerFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/authorized_payments/search?preapproval_id="))
        return Response.json({
          paging: { total: 1 },
          results: [{ id: "pay-recovered" }],
        });

      if (url.endsWith("/authorized_payments/pay-recovered"))
        return Response.json({
          id: "pay-recovered",
          preapproval_id: `synthetic-${userId}`,
          debit_date: debitDate,
          currency_id: "ARS",
          transaction_amount: "5000.00",
          payment: { status: "approved" },
        });

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    const recovered = await handleBilling(
      request("GET", cookie),
      { ...env, MP_ACCESS_TOKEN: "synthetic-token" },
      providerFetch,
    );

    expect(recovered.status).toBe(200);

    expect(await recovered.json()).toMatchObject({
      entitled: true,
      paidUntil: expect.any(String),
    });

    expect(
      database
        .prepare("SELECT provider_payment_id FROM billing_payments")
        .all(),
    ).toEqual([{ provider_payment_id: "pay-recovered" }]);
  });

  it("orders offset payment dates by instant and removes a refunded payment's access", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { userId } = await signIn("offsets@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET provider_status = 'authorized', trial_ends_at = '2020-01-01T00:00:00.000Z', canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    let laterStatus = "approved";

    const providerFetch = (async (input: RequestInfo | URL) => {
      const id = String(input).split("/").at(-1);

      const debitDate =
        id === "offset-earlier"
          ? "2026-12-01T00:15:00+02:00"
          : "2026-11-30T23:30:00Z";

      return Response.json({
        id,
        preapproval_id: `synthetic-${userId}`,
        debit_date: debitDate,
        currency_id: "ARS",
        transaction_amount: "5000.00",
        payment: { status: id === "offset-earlier" ? "approved" : laterStatus },
      });
    }) as typeof fetch;

    for (const id of ["offset-earlier", "offset-later"])
      expect(
        (
          await handleBillingWebhook(
            await signedBillingEvent(
              live.MP_WEBHOOK_SECRET!,
              "subscription_authorized_payment",
              id,
            ),
            live,
            providerFetch,
          )
        ).status,
      ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT debit_date FROM billing_payments WHERE provider_payment_id = 'offset-earlier'",
        )
        .get(),
    ).toEqual({ debit_date: "2026-11-30T22:15:00.000Z" });

    expect(
      database
        .prepare(
          "SELECT paid_until FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      paid_until: "2026-12-30T23:30:00.000Z",
    });

    laterStatus = "refunded";

    expect(
      (
        await handleBillingWebhook(
          await signedBillingEvent(
            live.MP_WEBHOOK_SECRET!,
            "subscription_authorized_payment",
            "offset-later",
          ),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT paid_until FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      paid_until: "2026-12-30T22:15:00.000Z",
    });
  });

  it("retries a delayed payment update instead of regressing the paid-through date", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { userId } = await signIn("concurrent-payments@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET provider_status = 'authorized', trial_ends_at = '2020-01-01T00:00:00.000Z', canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    const originalDb = live.DB!;
    let reachedEarlyUpdate!: () => void;
    let releaseEarlyUpdate!: () => void;

    const earlyUpdateReady = new Promise<void>((resolve) => {
      reachedEarlyUpdate = resolve;
    });

    const earlyUpdateGate = new Promise<void>((resolve) => {
      releaseEarlyUpdate = resolve;
    });

    let delayed = false;

    live.DB = {
      ...originalDb,
      prepare(query: string) {
        const statement = originalDb.prepare(query);
        if (!query.startsWith("UPDATE billing_subscriptions SET paid_until ="))
          return statement;

        return {
          bind(...values: unknown[]) {
            const bound = statement.bind(...values);
            return {
              async run() {
                if (!delayed && values[0] === "2026-03-29T00:00:00.000Z") {
                  delayed = true;
                  reachedEarlyUpdate();
                  await earlyUpdateGate;
                }

                return bound.run();
              },
            };
          },
        } as unknown as D1PreparedStatement;
      },
    } as D1Database;

    const providerFetch = (async (input: RequestInfo | URL) => {
      const id = String(input).split("/").at(-1);
      return Response.json({
        id,
        preapproval_id: `synthetic-${userId}`,
        debit_date:
          id === "early-payment"
            ? "2026-03-01T00:00:00.000Z"
            : "2026-04-01T00:00:00.000Z",
        currency_id: "ARS",
        transaction_amount: 5000,
        payment: { status: "approved" },
      });
    }) as typeof fetch;

    const early = handleBillingWebhook(
      await signedBillingEvent(
        live.MP_WEBHOOK_SECRET!,
        "subscription_authorized_payment",
        "early-payment",
      ),
      live,
      providerFetch,
    );

    await earlyUpdateReady;

    const later = await handleBillingWebhook(
      await signedBillingEvent(
        live.MP_WEBHOOK_SECRET!,
        "subscription_authorized_payment",
        "later-payment",
      ),
      live,
      providerFetch,
    );

    releaseEarlyUpdate();
    expect(later.status).toBe(200);
    expect((await early).status).toBe(200);

    expect(
      database
        .prepare(
          "SELECT paid_until FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      paid_until: "2026-05-01T00:00:00.000Z",
    });
  });

  it("does not restore access from an older approval response after a verified refund", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { userId } = await signIn("refund-race@example.test");

    database
      .prepare(
        "UPDATE billing_subscriptions SET provider_status = 'authorized', trial_ends_at = '2020-01-01T00:00:00.000Z', canceled_at = NULL WHERE user_id = ?",
      )
      .run(userId);

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    const originalDb = live.DB!;
    let reachedOldInsert!: () => void;
    let releaseOldInsert!: () => void;

    const oldInsertReady = new Promise<void>((resolve) => {
      reachedOldInsert = resolve;
    });

    const oldInsertGate = new Promise<void>((resolve) => {
      releaseOldInsert = resolve;
    });

    let delayed = false;

    live.DB = {
      ...originalDb,
      prepare(query: string) {
        const statement = originalDb.prepare(query);
        if (!query.startsWith("INSERT INTO billing_payments")) return statement;

        return {
          bind(...values: unknown[]) {
            const bound = statement.bind(...values);
            return {
              async run() {
                if (!delayed && values[3] === "approved") {
                  delayed = true;
                  reachedOldInsert();
                  await oldInsertGate;
                }

                return bound.run();
              },
            };
          },
        } as unknown as D1PreparedStatement;
      },
    } as D1Database;

    let calls = 0;

    const providerFetch = (async () =>
      Response.json({
        id: "same-payment",
        preapproval_id: `synthetic-${userId}`,
        debit_date: "2026-03-01T00:00:00.000Z",
        currency_id: "ARS",
        transaction_amount: 5000,
        payment: { status: ++calls === 1 ? "approved" : "refunded" },
      })) as typeof fetch;

    const event = () =>
      signedBillingEvent(
        live.MP_WEBHOOK_SECRET!,
        "subscription_authorized_payment",
        "same-payment",
      );

    const older = handleBillingWebhook(await event(), live, providerFetch);
    await oldInsertReady;

    const refund = await handleBillingWebhook(
      await event(),
      live,
      providerFetch,
    );

    releaseOldInsert();
    expect(refund.status).toBe(200);
    expect((await older).status).toBe(200);

    expect(
      database
        .prepare(
          "SELECT status FROM billing_payments WHERE provider_payment_id = 'same-payment'",
        )
        .get(),
    ).toEqual({ status: "refunded" });

    expect(
      database
        .prepare(
          "SELECT paid_until FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      paid_until: null,
    });
  });

  it("keeps an authorized trial when an older pending subscription response arrives", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { userId } = await signIn("stale-pending@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, plan_id, provider_status, created_at, updated_at) VALUES (?, 'plan-stale', 'pending', ?, ?)",
      )
      .run(userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    let status = "authorized";

    const providerFetch = (async () =>
      Response.json({
        id: "sub-stale",
        preapproval_plan_id: "plan-stale",
        payer_email: "stale-pending@example.test",
        status,
        date_created: "2026-10-16T12:00:00.000Z",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 5000,
          currency_id: "ARS",
          free_trial: { frequency: 1, frequency_type: "months" },
        },
      })) as typeof fetch;

    const event = () =>
      signedBillingEvent(
        live.MP_WEBHOOK_SECRET!,
        "subscription_preapproval",
        "sub-stale",
      );

    expect(
      (await handleBillingWebhook(await event(), live, providerFetch)).status,
    ).toBe(200);

    status = "pending";

    expect(
      (await handleBillingWebhook(await event(), live, providerFetch)).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT provider_status, trial_ends_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      provider_status: "authorized",
      trial_ends_at: "2026-11-16T12:00:00.000Z",
    });
  });

  it("grants only verified authorized trial and approved paid periods; cancellation preserves the period", async ({
    onTestFinished,
  }) => {
    const { env, signIn, database } = await setup(onTestFinished);
    const { cookie, userId } = await signIn("billing@example.test");

    database
      .prepare("DELETE FROM billing_subscriptions WHERE user_id = ?")
      .run(userId);

    database
      .prepare(
        "INSERT INTO billing_subscriptions (user_id, plan_id, checkout_url, created_at, updated_at) VALUES (?, 'plan-1', 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=plan-1', ?, ?)",
      )
      .run(userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const live = {
      ...env,
      MP_ACCESS_TOKEN: "synthetic-token",
      MP_WEBHOOK_SECRET: "synthetic-webhook-secret",
    };

    let providerStatus = "authorized";
    let paymentStatus = "approved";

    const providerFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith("/preapproval/search?preapproval_plan_id=plan-1"))
        return Response.json({
          paging: { total: 1 },
          results: [{ id: "sub-1" }],
        });

      if (url.endsWith("/preapproval/sub-1")) {
        if (init?.method === "PUT") {
          // The live API rejects the documented `canceled`; its reads may use either spelling.
          expect(JSON.parse(String(init.body))).toEqual({
            status: "cancelled",
          });

          providerStatus = "cancelled";
        }

        return Response.json({
          id: "sub-1",
          preapproval_plan_id: "plan-1",
          payer_email: "billing@example.test",
          status: providerStatus,
          date_created: "2026-10-16T12:00:00.000Z",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 5000,
            currency_id: "ARS",
            free_trial: { frequency: 1, frequency_type: "months" },
          },
        });
      }

      if (url.endsWith("/authorized_payments/pay-1"))
        return Response.json({
          id: "pay-1",
          preapproval_id: "sub-1",
          debit_date: "2026-11-16T12:00:00.000Z",
          currency_id: "ARS",
          transaction_amount: 5000,
          payment: { status: paymentStatus },
        });

      throw new Error(`Unexpected mock request ${url}`);
    }) as typeof fetch;

    async function signedEvent(type: string, id: string) {
      const ts = String(Math.floor(Date.now() / 1000));
      const requestId = `synthetic-${id}`;

      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(live.MP_WEBHOOK_SECRET!),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const bytes = new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(
            `id:${id};request-id:${requestId};ts:${ts};`,
          ),
        ),
      );

      const signature = Array.from(bytes, (value) =>
        value.toString(16).padStart(2, "0"),
      ).join("");

      return new Request(`${origin}/api/billing/webhook?data.id=${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-signature": `ts=${ts},v1=${signature}`,
        },
        body: JSON.stringify({ type }),
      });
    }

    expect(
      (
        await handleBillingWebhook(
          new Request(`${origin}/api/billing/webhook?data.id=sub-1`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "subscription_preapproval" }),
          }),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(401);

    expect(
      (
        await handleBillingWebhook(
          await signedEvent("subscription_preapproval", "sub-1"),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT trial_ends_at FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      trial_ends_at: "2026-11-16T12:00:00.000Z",
    });

    expect(
      (await handleBilling(request("GET", cookie), live, providerFetch)).status,
    ).toBe(200);

    expect(
      (
        await handleBillingWebhook(
          await signedEvent("subscription_authorized_payment", "pay-1"),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT paid_until FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      paid_until: "2026-12-16T12:00:00.000Z",
    });

    expect(
      (
        await handleBilling(
          request("DELETE", cookie, { expectedUserId: userId }),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT provider_status FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({ provider_status: "canceled" });

    paymentStatus = "refunded";

    expect(
      (
        await handleBillingWebhook(
          await signedEvent("subscription_authorized_payment", "pay-1"),
          live,
          providerFetch,
        )
      ).status,
    ).toBe(200);

    expect(
      database
        .prepare(
          "SELECT paid_until FROM billing_subscriptions WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      paid_until: null,
    });

    database
      .prepare(
        "UPDATE billing_subscriptions SET trial_ends_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?",
      )
      .run(userId);

    expect(
      (await save(live, cookie, { _intent: "category.add", name: "Viajes" }))
        .ok,
    ).toBe(false);
  });
});
