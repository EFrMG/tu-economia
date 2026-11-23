import { z } from "zod";

import type { SourceHealth } from "~/lib/exchange-rates.server";
import { createPromiseCache } from "~/lib/promise-cache.server";

/** The database the copies live in, and the INDEC token the INDEC services are read with. */
export type SnapshotEnv = Pick<CloudflareEnvironment, "DB" | "INDEC_API_TOKEN">;

/** The last valid rows of a source and when they were fetched. */
export interface Snapshot<Row> {
  rows: Row[];
  fetchedAt: string;
}

/** A slow-changing upstream source whose rows are kept in D1. See docs/market-data.md#saved-copies. */
export interface SnapshotSource<Row> {
  /** The source and a schema version, such as `indec:pobreza_eph@1`. Bump the version when the stored shape changes, so an old copy is never read with the new one. */
  key: string;
  /** Checks each stored row again when it is read. */
  schema: z.ZodType<Row>;
  /**
   * Asks the source for every row; rejects when it fails or answers nothing usable.
   * On a scheduled refresh, `previous` holds the copy being replaced, so a source can reuse what has not changed instead of asking for it again.
   */
  fetchRows(env: SnapshotEnv, now: Date, previous?: Row[]): Promise<Row[]>;
  /** A copy older than this has missed at least one refresh; `STALE_AFTER_MS` for the daily sources. */
  staleAfterMs?: number;
}

/** `cached` is a copy served as it is; `stale` is one that missed its refresh. */
export type SnapshotStatus = "fetched" | "cached" | "stale";

export interface SnapshotResult<Row> extends Snapshot<Row> {
  status: SnapshotStatus;
}

/** A daily copy is at most about a day old; an older one has missed at least one day's refresh. */
export const STALE_AFTER_MS = 36 * 60 * 60_000;

/**
 * Coalesces the requests of one instance and spares each visit a D1 read and the copy's validation; the copy in D1 is what instances share.
 * The copies change at most once a day, so an instance may serve the previous one for up to an hour after the morning refresh.
 */
const MEMORY_TTL_MS = 60 * 60_000;

const storedSchema = z.object({ body: z.string(), fetched_at: z.string() });

/**
 * The stored copy, with every row validated again by `schema`, so a copy written by an older deploy cannot reach the page unchecked.
 * An unreadable copy, or one without a single valid row, counts as missing.
 */
export async function readSnapshot<Row>(
  db: D1Database,
  key: string,
  schema: z.ZodType<Row>,
): Promise<Snapshot<Row> | null> {
  const stored = storedSchema.safeParse(
    await db
      .prepare("SELECT body, fetched_at FROM source_snapshots WHERE key = ?")
      .bind(key)
      .first(),
  );

  if (!stored.success || Number.isNaN(Date.parse(stored.data.fetched_at)))
    return null;

  let body: unknown;

  try {
    body = JSON.parse(stored.data.body);
  } catch {
    return null;
  }

  if (!Array.isArray(body)) return null;

  const rows = body.flatMap((row) => {
    const result = schema.safeParse(row);

    return result.success ? [result.data] : [];
  });

  return rows.length ? { rows, fetchedAt: stored.data.fetched_at } : null;
}

export async function writeSnapshot<Row>(
  db: D1Database,
  key: string,
  snapshot: Snapshot<Row>,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO source_snapshots (key, body, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at`,
    )
    .bind(key, JSON.stringify(snapshot.rows), snapshot.fetchedAt)
    .run();
}

const logged = (job: string, key: string) => (error: unknown) => {
  console.error(JSON.stringify({ job, key, error: String(error) }));

  return null;
};

/**
 * The stored copy however old it is, since the cron is the only regular writer; the source is asked only when there is no copy, and its answer is stored.
 * Database errors never fail the read: they only cost the copy.
 */
export async function readThrough<Row>(
  source: SnapshotSource<Row>,
  env: SnapshotEnv,
  now: Date,
): Promise<SnapshotResult<Row>> {
  const { key, schema, staleAfterMs = STALE_AFTER_MS } = source;

  const stored = env.DB
    ? await readSnapshot(env.DB, key, schema).catch(
        logged("snapshot-read", key),
      )
    : null;

  if (stored) {
    const age = now.getTime() - Date.parse(stored.fetchedAt);

    return { ...stored, status: age > staleAfterMs ? "stale" : "cached" };
  }

  const fresh = {
    rows: await source.fetchRows(env, now),
    fetchedAt: now.toISOString(),
  };

  if (env.DB)
    await writeSnapshot(env.DB, key, fresh).catch(
      logged("snapshot-write", key),
    );

  return { ...fresh, status: "fetched" };
}

interface KeyHealth {
  status: SnapshotStatus | "failed";
  /** When the rows served were fetched from the source, which for a copy is older than the visit. */
  fetchedAt: string | null;
  failedAt: string | null;
}

const memory = createPromiseCache();

/** The last outcome of each copy in this instance. The keys are bounded by the sources and the SEC issuer table. */
const health = new Map<string, KeyHealth>();

/** The rows of `source` and when they were fetched, through `readThrough`, shared by the concurrent requests of this instance and recorded in its health. Rejects only without any copy. */
export function loadSnapshot<Row>(
  source: SnapshotSource<Row>,
  env: SnapshotEnv,
  now = new Date(),
): Promise<Snapshot<Row>> {
  return memory.get(source.key, MEMORY_TTL_MS, async () => {
    const previous = health.get(source.key);

    try {
      const result = await readThrough(source, env, now);

      health.set(source.key, {
        status: result.status,
        fetchedAt: result.fetchedAt,
        failedAt: previous?.failedAt ?? null,
      });

      return { rows: result.rows, fetchedAt: result.fetchedAt };
    } catch (error) {
      health.set(source.key, {
        status: "failed",
        fetchedAt: previous?.fetchedAt ?? null,
        failedAt: now.toISOString(),
      });

      throw error;
    }
  });
}

/** The rows alone, for callers that do not show when they were fetched. */
export const loadRows = <Row>(
  source: SnapshotSource<Row>,
  env: SnapshotEnv,
  now = new Date(),
) => loadSnapshot(source, env, now).then(({ rows }) => rows);

const newest = (values: (string | null)[]) =>
  values.reduce<string | null>(
    (latest, value) =>
      value !== null && (latest === null || value > latest) ? value : latest,
    null,
  );

/** One `/api-status` row for every copy whose key starts with `prefix`: `stale` when any copy missed its refresh, `partial` when some could not be read at all. */
export function snapshotHealth(prefix: string): SourceHealth {
  const outcomes = [...health.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([, outcome]) => outcome);

  const failed = outcomes.filter(({ status }) => status === "failed").length;

  const status =
    outcomes.length === 0
      ? "not-checked"
      : failed === outcomes.length
        ? "failed"
        : failed > 0
          ? "partial"
          : outcomes.some(({ status }) => status === "stale")
            ? "stale"
            : outcomes.every(({ status }) => status === "cached")
              ? "cached"
              : "fetched";

  return {
    status,
    lastSuccessfulFetchAt: newest(outcomes.map(({ fetchedAt }) => fetchedAt)),
    lastFailureAt: newest(outcomes.map(({ failedAt }) => failedAt)),
  };
}

export type RefreshOutcome =
  | { key: string; status: "current" }
  | { key: string; status: "refreshed"; rows: number }
  | { key: string; status: "failed"; error: string };

/** The cron's refresh of one copy: asks the source unless the copy was already fetched today (UTC), so a retry slot never repeats a successful refresh. */
export async function refreshSnapshot<Row>(
  source: SnapshotSource<Row>,
  env: SnapshotEnv,
  now: Date,
): Promise<RefreshOutcome> {
  const { key } = source;

  try {
    if (!env.DB) throw new Error("Falta la base de datos (DB).");

    const stored = await readSnapshot(env.DB, key, source.schema).catch(
      logged("snapshot-read", key),
    );

    const today = now.toISOString().slice(0, 10);

    if (
      stored &&
      new Date(stored.fetchedAt).toISOString().slice(0, 10) === today
    )
      return { key, status: "current" };

    const rows = await source.fetchRows(env, now, stored?.rows);

    await writeSnapshot(env.DB, key, { rows, fetchedAt: now.toISOString() });

    return { key, status: "refreshed", rows: rows.length };
  } catch (error) {
    return { key, status: "failed", error: String(error) };
  }
}
