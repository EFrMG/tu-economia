import { z } from "zod";

import {
  RESUMEN_BOLETIN_LIMIT,
  isBoletinDigestEnabled,
  type BoletinDigest,
  type BoletinNotice,
  type BoletinResumen,
} from "~/lib/boletin";
import {
  LISTING_URL,
  exclusionReason,
  isContingencyPage,
  isRelevantListing,
  noticeUrl,
  operativeText,
  parseListing,
  parseNoticeBody,
} from "~/lib/boletin-source.server";
import {
  BOLETIN_MODEL,
  requestSummary,
  summaryRejection,
} from "~/lib/boletin-summary.server";
import { SITE_URL } from "~/lib/site";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

/**
 * The Boletín Oficial digest. The shared cron runs every five minutes through the morning; each run does one small job (collect today's edition, or summarize a few notices) so it stays inside the Free plan's 10 ms of CPU and 50 subrequests. Pages only read D1. See docs/boletin-oficial.md.
 */

const USER_AGENT = `TuEconomia/1.0 (+${SITE_URL})`;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** A notice whose page or summary fails this many runs is kept with its official reference only. */
export const MAX_ATTEMPTS = 3;

/**
 * Notices one run summarizes at most, one after another. Each takes about 4 s of wall time, which does not count as CPU, and three subrequests: its page, the model and the D1 write.
 * A whole run with one notice measured 1 to 3 ms of CPU on 2026-11-27, so three stay inside the Free plan's 10 ms. With the pending query a run makes 10 subrequests, and 17 after a refresh run that found nothing to refresh, against the limit of 50.
 */
export const NOTICES_PER_RUN = 3;

/** Editions older than this are deleted by the daily maintenance run; readers can page back through the rest. Three weeks is about fifteen editions, some 30 KB of summaries. The latest is never deleted, so a longer gap without editions still leaves something to show. */
export const BOLETIN_RETENTION_DAYS = 21;

const argentinaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in Argentina, the date the Boletín prints on its edition. */
export const editionDateFor = (now: Date) => argentinaDate.format(now);

type FetchLike = typeof fetch;

/** How far into a page the contingency marker is looked for; it sits about 21 KB in. */
const CONTINGENCY_HEAD_BYTES = 64 * 1024;

/** The site's contingency page, recognized from its start; the download stops there. */
class ContingencyPageError extends Error {
  constructor() {
    super("El Boletín Oficial muestra su página de contingencia.");
  }
}

/**
 * The body as text, stopping the download as soon as it is the contingency page or passes 2 MB.
 * The site sends the page compressed and chunked, without a length, so the size is only known while reading.
 */
async function readPage(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  let headChecked = false;

  const stop = (error: Error) => {
    void reader.cancel().catch(() => undefined);

    return error;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();

    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });

    if (!headChecked && bytes >= CONTINGENCY_HEAD_BYTES) {
      headChecked = true;

      if (isContingencyPage(text)) throw stop(new ContingencyPageError());
    }

    if (
      bytes > MAX_RESPONSE_BYTES ||
      (headChecked && declared > MAX_RESPONSE_BYTES)
    )
      throw stop(new Error("La página excede el tamaño permitido."));
  }
}

/** The page as text, refusing anything over 2 MB so a broken upstream cannot exhaust the run. */
async function fetchPage(url: string, fetcher: FetchLike) {
  return withUpstreamTimeout(REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetcher(url, {
      signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
    });

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);

      throw new Error(`HTTP ${response.status}`);
    }

    return readPage(response);
  });
}

export type BoletinStepResult =
  | { step: "disabled" }
  | { step: "waiting-edition" }
  | { step: "contingency" }
  | { step: "collected"; edition: string; listed: number; selected: number }
  | { step: "processed"; id: string; status: NoticeOutcome }
  | { step: "retry"; id: string; reason: string }
  | { step: "idle" };

type NoticeOutcome = "summarized" | "title_only" | "excluded";

interface PendingRow {
  id: string;
  edition_date: string;
  rubro: string;
  heading: string;
  norm: string;
  has_annexes: number;
  attempts: number;
}

export interface BoletinDeps {
  fetch?: FetchLike;
}

/**
 * One cron run, yielding each step as it ends so the caller can log it at once. Summarizes up to `NOTICES_PER_RUN` pending notices, oldest first, one after another; with none pending, and today's edition not on file yet, reads the section page for an edition newer than the stored ones instead.
 * Pending notices come first so a day without an edition, which reads the page on every run, still finishes the previous one. Collecting is a run of its own, so a run never adds the cost of the listing to that of its notices.
 * The run stops at the first notice that will be retried: a quota spent for the day or a network spell would otherwise use up the attempts of every notice in the run at once.
 */
export async function* runBoletinSteps(
  env: CloudflareEnvironment,
  now = new Date(),
  { fetch: fetcher = fetch }: BoletinDeps = {},
): AsyncGenerator<BoletinStepResult, void, undefined> {
  const db = env.DB;

  if (!isBoletinDigestEnabled(env) || !db) {
    yield { step: "disabled" };

    return;
  }

  const pending = await db
    .prepare(
      "SELECT id, edition_date, rubro, heading, norm, has_annexes, attempts FROM boletin_notices WHERE status = 'pending' ORDER BY edition_date, position LIMIT ?",
    )
    .bind(NOTICES_PER_RUN)
    .all<PendingRow>();

  if (pending.results.length > 0) {
    for (const row of pending.results) {
      const result = await processNotice(db, env.AI, row, now, fetcher);

      yield result;

      if (result.step === "retry") return;
    }

    return;
  }

  const newest = await db
    .prepare("SELECT MAX(edition_date) AS date FROM boletin_editions")
    .first<{ date: string | null }>();

  const newestStored = newest?.date ?? null;

  if (newestStored !== null && newestStored >= editionDateFor(now)) {
    yield { step: "idle" };

    return;
  }

  yield await collectEdition(db, newestStored, now, fetcher);
}

/**
 * Reads the section page and records its newest edition when it is newer than every stored one.
 * Not requiring today's date means an edition missed on its own day (published after the cron's last run, or while the cron or the site was down) is still collected the next day, as long as the page shows it.
 */
async function collectEdition(
  db: D1Database,
  newestStored: string | null,
  now: Date,
  fetcher: FetchLike,
): Promise<BoletinStepResult> {
  let page: string;

  try {
    page = await fetchPage(LISTING_URL, fetcher);
  } catch (error) {
    // The site's state, not a failure here: nothing can be collected until the listing returns.
    if (error instanceof ContingencyPageError) return { step: "contingency" };

    throw error;
  }

  if (isContingencyPage(page)) return { step: "contingency" };

  const notices = parseListing(page);

  const latest = notices.reduce<string | null>(
    (date, notice) =>
      date === null || notice.editionDate > date ? notice.editionDate : date,
    null,
  );

  if (latest === null || (newestStored !== null && latest <= newestStored))
    return { step: "waiting-edition" };

  const listed = notices.filter((notice) => notice.editionDate === latest);

  const selected = listed.filter(isRelevantListing);
  const timestamp = now.toISOString();

  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO boletin_editions (edition_date, collected_at, listed_count, selected_count) VALUES (?, ?, ?, ?)",
      )
      .bind(latest, timestamp, listed.length, selected.length),
    ...selected.map((notice) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO boletin_notices (id, edition_date, position, rubro, heading, norm, url, has_annexes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          notice.id,
          notice.editionDate,
          notice.position,
          notice.rubro,
          notice.heading,
          notice.norm,
          noticeUrl(notice.id, notice.editionDate),
          notice.hasAnnexes ? 1 : 0,
          timestamp,
        ),
    ),
  ]);

  return {
    step: "collected",
    edition: latest,
    listed: listed.length,
    selected: selected.length,
  };
}

interface Resolution {
  status: NoticeOutcome;
  outcome: string;
  title?: string;
  summary?: string;
  points?: string[];
  affectsHouseholds?: boolean;
  partial?: boolean;
  operativeChars?: number;
  sentChars?: number;
  /** Set when the model was called, whatever came back. */
  model?: string;
  neurons?: number | null;
}

async function resolveNotice(
  db: D1Database,
  id: string,
  resolution: Resolution,
  now: Date,
) {
  await db
    .prepare(
      "UPDATE boletin_notices SET status = ?, outcome = ?, title = ?, summary = ?, points = ?, affects_households = ?, partial = ?, operative_chars = ?, sent_chars = ?, neurons = ?, model = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'",
    )
    .bind(
      resolution.status,
      resolution.outcome,
      resolution.title ?? null,
      resolution.summary ?? null,
      resolution.points ? JSON.stringify(resolution.points) : null,
      resolution.affectsHouseholds ? 1 : 0,
      resolution.partial ? 1 : 0,
      resolution.operativeChars ?? null,
      resolution.sentChars ?? null,
      resolution.neurons ?? null,
      resolution.model ?? null,
      now.toISOString(),
      id,
    )
    .run();
}

/** A failure worth retrying: the notice stays pending until its last attempt, then keeps its official reference only. */
async function failAttempt(
  db: D1Database,
  row: PendingRow,
  reason: string,
  now: Date,
): Promise<BoletinStepResult> {
  if (row.attempts + 1 >= MAX_ATTEMPTS) {
    await resolveNotice(
      db,
      row.id,
      { status: "title_only", outcome: reason },
      now,
    );

    return { step: "processed", id: row.id, status: "title_only" };
  }

  await db
    .prepare(
      "UPDATE boletin_notices SET attempts = attempts + 1, outcome = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
    )
    .bind(reason, now.toISOString(), row.id)
    .run();

  return { step: "retry", id: row.id, reason };
}

async function processNotice(
  db: D1Database,
  ai: Ai | undefined,
  row: PendingRow,
  now: Date,
  fetcher: FetchLike,
): Promise<BoletinStepResult> {
  let html: string;

  try {
    html = await fetchPage(noticeUrl(row.id, row.edition_date), fetcher);
  } catch {
    return failAttempt(db, row, "fetch-failed", now);
  }

  const body = parseNoticeBody(html);
  if (!body) return failAttempt(db, row, "body-not-found", now);

  const excluded = exclusionReason(body);

  if (excluded) {
    await resolveNotice(
      db,
      row.id,
      { status: "excluded", outcome: excluded },
      now,
    );

    return { step: "processed", id: row.id, status: "excluded" };
  }

  const operative = operativeText(body);
  const header = `Norma: ${row.rubro} · ${row.heading} · ${row.norm}`;

  const measured = {
    partial: operative.truncated,
    operativeChars: operative.fullLength,
    sentChars: operative.text.length,
  };

  if (!ai) {
    await resolveNotice(
      db,
      row.id,
      { status: "title_only", outcome: "no-ai-binding", ...measured },
      now,
    );

    return { step: "processed", id: row.id, status: "title_only" };
  }

  let result: Awaited<ReturnType<typeof requestSummary>>;

  try {
    result = await requestSummary(ai, {
      header,
      text: operative.text,
      truncated: operative.truncated,
      fullLength: operative.fullLength,
      hasAnnexes: row.has_annexes === 1,
    });
  } catch {
    // Quota exhaustion on the Free plan fails every call until 00:00 UTC; after the last attempt the notice keeps its official reference.
    return failAttempt(db, row, "model-failed", now);
  }

  const { summary, neurons } = result;

  const rejection = summary
    ? summaryRejection(summary, `${header}\n${operative.text}`)
    : "invalid-output";

  if (!summary || rejection) {
    await resolveNotice(
      db,
      row.id,
      {
        status: "title_only",
        outcome: rejection ?? "invalid-output",
        model: BOLETIN_MODEL,
        neurons,
        ...measured,
      },
      now,
    );

    return { step: "processed", id: row.id, status: "title_only" };
  }

  await resolveNotice(
    db,
    row.id,
    {
      status: "summarized",
      outcome: "ok",
      title: summary.titulo,
      summary: summary.resumen,
      points: summary.puntos,
      affectsHouseholds: summary.afecta_hogares,
      model: BOLETIN_MODEL,
      neurons,
      ...measured,
    },
    now,
  );

  return { step: "processed", id: row.id, status: "summarized" };
}

/** Part of the daily maintenance run: drops editions older than the retention window, except the latest one. */
export async function pruneBoletin(
  env: CloudflareEnvironment,
  now = new Date(),
) {
  const db = env.DB;
  if (!db) return;

  const cutoff = editionDateFor(
    new Date(now.getTime() - BOLETIN_RETENTION_DAYS * 86_400_000),
  );

  // The maintenance runs at 06:00 UTC, before the day's edition is collected, so the latest edition is the one on screen.
  const stale =
    "edition_date < ?1 AND edition_date < (SELECT MAX(edition_date) FROM boletin_editions)";

  await db.batch([
    db.prepare(`DELETE FROM boletin_notices WHERE ${stale}`).bind(cutoff),
    db.prepare(`DELETE FROM boletin_editions WHERE ${stale}`).bind(cutoff),
  ]);
}

const noticeRowSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  rubro: z.string(),
  heading: z.string(),
  norm: z.string(),
  has_annexes: z.number(),
  status: z.enum(["summarized", "title_only"]),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  points: z.string().nullable(),
  affects_households: z.number(),
  partial: z.number(),
});

const pointsSchema = z.array(z.string());

/** The stored JSON array, or no points when it is missing or unreadable. */
function parsePoints(value: string | null): string[] {
  try {
    return pointsSchema.parse(JSON.parse(value ?? "[]"));
  } catch {
    return [];
  }
}

function toNotice(row: z.infer<typeof noticeRowSchema>): BoletinNotice {
  const points = parsePoints(row.points);
  const summarized = row.status === "summarized";

  return {
    id: row.id,
    url: row.url,
    rubro: row.rubro,
    heading: row.heading,
    norm: row.norm,
    hasAnnexes: row.has_annexes === 1,
    status: row.status,
    title: summarized ? row.title : null,
    summary: summarized ? row.summary : null,
    points: summarized ? points : [],
    affectsHouseholds: summarized && row.affects_households === 1,
    partial: summarized && row.partial === 1,
  };
}

/**
 * The latest edition with something to show: a notice past 'pending', or none selected at all. While a new edition is being summarized the previous one stays on screen until its first notice is ready.
 * Household-affecting summaries lead, then the listing order.
 */
/** An edition is shown once a notice is past `pending` (or it selected none), so the previous one stays until the new one has something to read. */
const SHOWN_EDITION =
  "e.selected_count = 0 OR EXISTS (SELECT 1 FROM boletin_notices n WHERE n.edition_date = e.edition_date AND n.status <> 'pending')";

const SHOWN_EDITIONS = `SELECT e.edition_date FROM boletin_editions e WHERE ${SHOWN_EDITION} ORDER BY e.edition_date DESC`;

const LATEST_SHOWN_EDITION = `SELECT MAX(e.edition_date) AS edition_date FROM boletin_editions e WHERE ${SHOWN_EDITION}`;

const NOTICE_COLUMNS =
  "id, url, rubro, heading, norm, has_annexes, status, title, summary, points, affects_households, partial";

const editionRowsSchema = z.array(z.object({ edition_date: z.string() }));

/** The requested edition, or the latest when it is missing, unknown or already deleted, with its neighbours for the edition bar. */
export async function getBoletinDigest(
  env: CloudflareEnvironment,
  requested: string | null = null,
): Promise<BoletinDigest | null> {
  const db = env.DB;
  if (!db) return null;

  const editions = await db.prepare(SHOWN_EDITIONS).all();

  const dates = editionRowsSchema
    .parse(editions.results)
    .map((row) => row.edition_date);

  if (dates.length === 0) {
    return {
      editionDate: null,
      notices: [],
      pending: 0,
      previous: null,
      next: null,
    };
  }

  const index = requested === null ? 0 : Math.max(0, dates.indexOf(requested));
  const editionDate = dates[index];

  const [shown, pending] = await db.batch([
    db
      .prepare(
        `SELECT ${NOTICE_COLUMNS} FROM boletin_notices WHERE edition_date = ? AND status IN ('summarized', 'title_only') ORDER BY (status = 'summarized' AND affects_households = 1) DESC, position`,
      )
      .bind(editionDate),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM boletin_notices WHERE edition_date = ? AND status = 'pending'",
      )
      .bind(editionDate),
  ]);

  const notices = z.array(noticeRowSchema).parse(shown.results).map(toNotice);
  const count = z.object({ count: z.number() }).parse(pending.results[0]).count;

  return {
    editionDate,
    notices,
    pending: count,
    previous: dates[index + 1] ?? null,
    next: index > 0 ? dates[index - 1] : null,
  };
}

/**
 * The Resumen card: household summaries first, from any kept edition and newest first, then the latest edition's other summaries, in listing order.
 * A summarized notice always belongs to a shown edition, so only the latest needs resolving.
 */
export async function getResumenBoletin(
  env: CloudflareEnvironment,
): Promise<BoletinResumen | null> {
  const db = env.DB;
  if (!db) return null;

  const [latest, shown] = await db.batch([
    db.prepare(LATEST_SHOWN_EDITION),
    db
      .prepare(
        `SELECT ${NOTICE_COLUMNS} FROM boletin_notices WHERE status = 'summarized' AND (affects_households = 1 OR edition_date = (${LATEST_SHOWN_EDITION})) ORDER BY affects_households DESC, edition_date DESC, position LIMIT ?`,
      )
      .bind(RESUMEN_BOLETIN_LIMIT),
  ]);

  const editionDate = z
    .object({ edition_date: z.string().nullable() })
    .parse(latest.results[0]).edition_date;

  return {
    editionDate,
    notices: z.array(noticeRowSchema).parse(shown.results).map(toNotice),
  };
}
