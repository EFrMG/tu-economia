import { z } from "zod";

import { authFromEnv } from "~/lib/auth.server";
import {
  billingRecord,
  cancelActiveForDeletion,
  hasActiveBilling,
} from "~/lib/billing.server";
import {
  entitlementEndsAt,
  hasCloudEntitlement,
} from "~/lib/billing-entitlement";
import type { FinanceAccess } from "~/lib/finance-access";
import { commandFromForm, formField } from "~/lib/finance-form";
import { retentionDeletionDate } from "~/lib/finance-retention";
import {
  applyFinanceCommand,
  initialLocalFinance,
  parseLocalFinanceDocument,
  type FinanceActionResult,
  type LocalFinanceDocument,
} from "~/lib/local-finance";
import {
  authenticated,
  privateJSON,
  readLimitedJSON,
  requireOrigin,
} from "~/lib/request-guards.server";

export interface FinanceSnapshot {
  userId: string;
  revision: number;
  document: LocalFinanceDocument | null;
}

export interface FinanceState {
  access: FinanceAccess;
  userId: string | null;
  email: string | null;
  billingEnabled: boolean;
  /** Whether the signed-in account already has Google linked. */
  googleLinked: boolean;
  /** When a lapsed account's stored records are scheduled for deletion. */
  deletionDate: string | null;
  /** Whether subscribing would still start with the free month: true until the account has any billing record. */
  trialEligible: boolean;
  document: LocalFinanceDocument;
}

interface StoredSnapshot {
  revision: number;
  document: string;
}

const MAX_JSON_BYTES = 512 * 1024;

/** Multipart framing adds headers and boundaries on top of the JSON and file limits checked below. */
const MAX_FORM_BYTES = MAX_JSON_BYTES + 1024 * 1024;

/** Concurrent saves from other tabs are re-applied on the fresh document this many times before giving up. */
const SAVE_ATTEMPTS = 3;

const deletionSchema = z.strictObject({
  expectedUserId: z.string().min(1),
  confirmation: z.literal("ELIMINAR"),
});

/** Object property order is irrelevant to a retry; array order remains part of the document. */
function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;

  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;

  return JSON.stringify(value);
}

function snapshot(userId: string, row: StoredSnapshot | null): FinanceSnapshot {
  return {
    userId,
    revision: row?.revision ?? 0,
    // Reads accept documents written before a defaulted field existed; the next save writes the completed shape.
    document: row ? parseLocalFinanceDocument(JSON.parse(row.document)) : null,
  };
}

async function currentSnapshot(db: D1Database, userId: string) {
  const row = await db
    .prepare(
      "SELECT revision, document FROM finance_documents WHERE user_id = ?",
    )
    .bind(userId)
    .first<StoredSnapshot>();

  return snapshot(userId, row);
}

/** D1 batches are transactional, including verification rows without an account foreign key. */
export async function handleAccountDeletion(
  request: Request,
  env: CloudflareEnvironment,
  providerFetch: typeof fetch = fetch,
): Promise<Response> {
  try {
    const { db, userId, baseURL } = await authenticated(request, env);

    if (request.method !== "DELETE")
      return privateJSON({ error: "Method not allowed" }, 405, {
        Allow: "DELETE",
      });

    requireOrigin(request, baseURL);
    const body = deletionSchema.safeParse(
      await readLimitedJSON(request, MAX_JSON_BYTES),
    );
    if (!body.success)
      return privateJSON(
        { error: "Explicit account deletion confirmation required" },
        400,
      );

    if (body.data.expectedUserId !== userId)
      return privateJSON({ error: "Account changed" }, 403);

    await cancelActiveForDeletion(db, userId, env, providerFetch);

    await db.batch([
      db
        .prepare(
          "UPDATE billing_subscriptions SET account_deleted_at = ?, updated_at = ? WHERE user_id = ?",
        )
        .bind(new Date().toISOString(), new Date().toISOString(), userId),
      // Better Auth 1.7.10 magic links use magic-link:<hashed token> identifiers and a JSON {type:"magic-link",email,...} value. Match the authenticated account's stored email, including casing accepted by its sign-in endpoint.
      db
        .prepare(
          `DELETE FROM verification WHERE identifier LIKE 'magic-link:%' AND CASE WHEN json_valid(value) THEN json_extract(value, '$.type') = 'magic-link' AND lower(json_extract(value, '$.email')) = (SELECT lower(email) FROM "user" WHERE id = ?) ELSE 0 END`,
        )
        .bind(userId),
      db.prepare('DELETE FROM "user" WHERE id = ?').bind(userId),
    ]);

    return privateJSON({ deleted: true });
  } catch (error) {
    if (error instanceof Response) return error;

    return privateJSON({ error: "Account deletion failed" }, 500);
  }
}

/**
 * Every account starts from the same starter categories. Their IDs are stable so a page rendered before the first save still points at the categories that save creates.
 */
export function starterFinanceDocument(): LocalFinanceDocument {
  let next = 0;

  return initialLocalFinance(() => `starter-${++next}`);
}

const storageReady = (env: CloudflareEnvironment) =>
  env.FINANCE_STORAGE_ENABLED === "true" && Boolean(env.DB);

export async function loadFinanceState(
  request: Request,
  env: CloudflareEnvironment,
): Promise<FinanceState> {
  const state: FinanceState = {
    access: "unavailable",
    userId: null,
    email: null,
    billingEnabled: false,
    googleLinked: false,
    deletionDate: null,
    trialEligible: true,
    document: starterFinanceDocument(),
  };

  const auth = authFromEnv(env);
  if (!auth || !env.DB) return state;

  let session;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {
    // Missing or unapplied auth tables leave account access unavailable.
    return state;
  }

  if (!session) return { ...state, access: "signed-out" };

  let record = null;
  try {
    record = await billingRecord(env.DB, session.user.id);
  } catch {
    // Before migration 0005, no account has an entitlement.
  }

  let googleLinked = false;
  try {
    const row = await env.DB.prepare(
      'SELECT 1 AS present FROM "account" WHERE "userId" = ? AND "providerId" = ?',
    )
      .bind(session.user.id, "google")
      .first<{ present: number }>();
    googleLinked = Boolean(row);
  } catch {
    // Older databases may not have the account table yet.
  }

  const signedIn = {
    ...state,
    userId: session.user.id,
    email: session.user.email,
    billingEnabled: env.BILLING_ENABLED === "true" || record !== null,
    googleLinked,
    trialEligible: record === null,
  };

  if (!storageReady(env)) return signedIn;

  const current = await currentSnapshot(env.DB, session.user.id);
  if (hasCloudEntitlement(record))
    return {
      ...signedIn,
      access: "edit",
      document: current.document ?? signedIn.document,
    };

  const retention = await env.DB.prepare(
    "SELECT updated_at, deletion_notice_attempted_at, deletion_notice_sent_at FROM finance_documents WHERE user_id = ?",
  )
    .bind(session.user.id)
    .first<{
      updated_at: string;
      deletion_notice_attempted_at: string | null;
      deletion_notice_sent_at: string | null;
    }>();

  return {
    ...signedIn,
    access: "read-only",
    deletionDate: retention
      ? retentionDeletionDate({
          entitlementEndsAt: entitlementEndsAt(record),
          documentUpdatedAt: retention.updated_at,
          deletionNoticeAttemptedAt: retention.deletion_notice_attempted_at,
        }).toISOString()
      : null,
    document: current.document ?? signedIn.document,
  };
}

/** Applies an edit to the latest stored document, retrying on a newer revision instead of overwriting it. */
async function saveDocument(
  db: D1Database,
  userId: string,
  edit: (document: LocalFinanceDocument) => LocalFinanceDocument,
) {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const current = await currentSnapshot(db, userId);
    const encoded = canonicalJSON(
      edit(current.document ?? starterFinanceDocument()),
    );

    const now = new Date().toISOString();

    const row =
      current.revision === 0
        ? await db
            .prepare(
              "INSERT INTO finance_documents (user_id, revision, document, created_at, updated_at) VALUES (?, 1, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING RETURNING revision",
            )
            .bind(userId, encoded, now, now)
            .first()
        : await db
            .prepare(
              "UPDATE finance_documents SET revision = revision + 1, document = ?, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision",
            )
            .bind(encoded, now, userId, current.revision)
            .first();

    if (row) return;
  }

  throw new RangeError(
    "Otra sesión guardó cambios al mismo tiempo. Actualice la página e intente nuevamente.",
  );
}

/**
 * Handles every Mi economía form. Reading, exporting and deleting stay open to the account owner after a subscription lapses; any other change requires a current entitlement.
 */
export async function handleFinanceForm(
  request: Request,
  env: CloudflareEnvironment,
): Promise<FinanceActionResult> {
  try {
    if (!storageReady(env))
      throw new RangeError(
        "No fue posible guardar sus datos en este momento. Intente nuevamente más tarde.",
      );

    const { db, userId, baseURL } = await authenticated(request, env);
    requireOrigin(request, baseURL);

    // Reject an oversized body before the multipart parser buffers it, and keep the parse failure inside this handler's friendly result.
    const length = request.headers.get("Content-Length");
    if (length && Number(length) > MAX_FORM_BYTES)
      throw new RangeError("La solicitud supera el tamaño permitido.");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new RangeError(
        "No fue posible leer el formulario. Actualice la página e intente nuevamente.",
      );
    }

    const intent = formField(form, "_intent");

    if (intent === "data.clear") {
      // The word is matched in any letter case, as the form's own check does.
      if (formField(form, "confirmation").toUpperCase() !== "BORRAR")
        throw new RangeError('Escriba "BORRAR" para confirmar.');

      await db
        .prepare("DELETE FROM finance_documents WHERE user_id = ?")
        .bind(userId)
        .run();

      return { ok: true, message: "Sus registros se eliminaron." };
    }

    if (!(await hasActiveBilling(db, userId)))
      throw new RangeError(
        "Su suscripción no está activa. Puede consultar, exportar o eliminar sus registros, pero no modificarlos.",
      );

    if (intent === "data.import") {
      const file = form.get("file");
      if (!(file instanceof File) || file.size > MAX_JSON_BYTES)
        throw new RangeError("Seleccione un archivo JSON de hasta 2 MB.");

      let imported: LocalFinanceDocument;
      try {
        imported = parseLocalFinanceDocument(JSON.parse(await file.text()));
      } catch {
        throw new RangeError(
          "El archivo no contiene una copia válida de Mi economía. No se modificaron los datos guardados.",
        );
      }

      await saveDocument(db, userId, () => imported);

      return { ok: true, message: "La copia se importó en su cuenta." };
    }

    const command = commandFromForm(form);
    await saveDocument(db, userId, (document) =>
      applyFinanceCommand(document, command),
    );

    return { ok: true, message: "Cambios guardados." };
  } catch (error) {
    if (error instanceof Response)
      return {
        ok: false,
        message:
          error.status === 401
            ? "Su sesión terminó. Inicie sesión nuevamente para guardar cambios."
            : "No fue posible verificar su sesión. Actualice la página e intente nuevamente.",
      };

    return {
      ok: false,
      message:
        error instanceof RangeError
          ? error.message
          : "No fue posible guardar los cambios. Intente nuevamente.",
    };
  }
}

/** The account's records as a downloadable JSON copy; it stays available after a subscription lapses. */
export async function handleFinanceExport(
  request: Request,
  env: CloudflareEnvironment,
): Promise<Response> {
  try {
    if (!storageReady(env))
      return privateJSON({ error: "Finance storage is unavailable" }, 503);

    const { db, userId } = await authenticated(request, env);
    if (request.method !== "GET")
      return privateJSON({ error: "Method not allowed" }, 405, {
        Allow: "GET",
      });

    const current = await currentSnapshot(db, userId);
    const date = new Date().toISOString().slice(0, 10);

    return privateJSON(current.document ?? starterFinanceDocument(), 200, {
      "Content-Disposition": `attachment; filename="tu-economia-${date}.json"`,
    });
  } catch (error) {
    if (error instanceof Response) return error;

    return privateJSON({ error: "Finance export failed" }, 500);
  }
}
