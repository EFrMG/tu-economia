import { z } from "zod";

import {
  FIGURES,
  ISSUERS,
  RECENT_FILINGS_LIMIT,
  TAXONOMIES,
  alignToOneReport,
  findIssuer,
  isListedFiling,
  latestAnnualFact,
  latestAnnualReport,
  listsTicker,
  paddedCik,
  parseRecentFilings,
  toReportedFigure,
  unresolvedPanel,
  type CompanyFiguresData,
  type CompanyFilingsData,
  type CompanyPanel,
  type ConceptFact,
  type FigureId,
  type FilingRef,
  type Issuer,
  type IssuerListData,
  type IssuerRow,
  type ReportedFigure,
  type Taxonomy,
} from "~/lib/company-filings";
import type { EquityFreshness, EquityPanel } from "~/lib/equities";
import { argentineDateTime } from "~/lib/equities.server";
import type { SourceHealth } from "~/lib/exchange-rates.server";
import {
  loadSnapshot,
  readSnapshot,
  refreshSnapshot,
  snapshotHealth,
  STALE_AFTER_MS,
  type RefreshOutcome,
  type SnapshotEnv,
  type SnapshotSource,
} from "~/lib/source-snapshots.server";
import { SUPPORT_EMAIL } from "~/lib/support";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

const DATA_BASE = "https://data.sec.gov";

const DAY_MS = 24 * 60 * 60_000;

/** Filings and reported figures change a few times a year, so the cron refreshes each company once a week; a copy older than a week and a half missed its refresh. */
const STALE_COMPANY_COPY_MS = 7 * DAY_MS + STALE_AFTER_MS;

const KEY_PREFIX = "sec:";

const REQUEST_TIMEOUT_MS = 8_000;

/** At most eight request starts per second from this process, under the SEC's limit of ten. */
const REQUEST_INTERVAL_MS = 125;

/**
 * The SEC's fair-access policy refuses requests that do not name the application and a contact address.
 * No URL: on 2026-11-10 the SEC answered 403 ("Request Rate Threshold Exceeded") to the same header with the repository URL in it, and 200 without it.
 */
export const SEC_USER_AGENT = `TuEconomia/1.0 (${SUPPORT_EMAIL})`;

const nullableStrings = z.array(z.string().nullable());

const submissionsSchema = z.object({
  name: z.string().nullish(),
  tickers: z.array(z.string()).nullish(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()),
      filingDate: z.array(z.string()),
      form: z.array(z.string()),
      primaryDocument: z.array(z.string()),
      reportDate: nullableStrings.nullish(),
      primaryDocDescription: nullableStrings.nullish(),
    }),
  }),
});

const factSchema = z.object({
  start: z.string().optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  val: z.number().finite(),
  accn: z.string(),
  fy: z.number().int().nullish(),
  fp: z.string().nullish(),
  form: z.string(),
  filed: z.string(),
  frame: z.string().optional(),
});

/** Facts are checked one by one, so one malformed fact drops only itself. */
const conceptSchema = z.object({
  units: z.record(z.string(), z.array(z.unknown())),
});

const filingRefSchema = z.object({
  accessionNumber: z.string(),
  form: z.string(),
  filingDate: z.string(),
  reportDate: z.string().nullable(),
  primaryDocument: z.string(),
  description: z.string().nullable(),
  url: z.string(),
});

const storedSubmissionsSchema = z.object({
  name: z.string(),
  tickers: z.array(z.string()),
  filings: z.array(filingRefSchema),
  latestAnnual: filingRefSchema.nullable(),
});

const reportedFigureSchema = z.object({
  value: z.number().finite(),
  unit: z.string(),
  periodStart: z.string().nullable(),
  periodEnd: z.string(),
  fiscalYear: z.number().int().nullable(),
  form: z.string(),
  filed: z.string(),
  accession: z.string(),
  taxonomy: z.enum(TAXONOMIES),
  tag: z.string(),
});

const figureIds = FIGURES.map(({ id }) => id) as [FigureId, ...FigureId[]];

/** The figures as the page shows them, with the annual report they were read after, so a refresh asks for them again only when a new one is filed. */
const storedFiguresSchema = z.object({
  annualAccession: z.string().nullable(),
  data: z.object({
    taxonomy: z.enum(TAXONOMIES).nullable(),
    figures: z.record(z.enum(figureIds), reportedFigureSchema.nullable()),
    missing: z.array(z.enum(figureIds)),
  }),
});

type StoredFigures = z.infer<typeof storedFiguresSchema>;

interface Submissions {
  name: string;
  tickers: string[];
  /** Listed forms only, newest first, at most `RECENT_FILINGS_LIMIT`. */
  filings: FilingRef[];
  latestAnnual: FilingRef | null;
}

type ConceptUnits = Record<string, ConceptFact[]>;

function parseSubmissions(cik: number, payload: unknown): Submissions {
  const parsed = submissionsSchema.parse(payload);

  const filings = parseRecentFilings(cik, {
    ...parsed.filings.recent,
    reportDate: parsed.filings.recent.reportDate ?? undefined,
    primaryDocDescription:
      parsed.filings.recent.primaryDocDescription ?? undefined,
  });

  return {
    name: parsed.name?.trim() ?? "",
    tickers: parsed.tickers ?? [],
    filings: filings
      .filter((filing) => isListedFiling(filing.form))
      .slice(0, RECENT_FILINGS_LIMIT),
    latestAnnual: latestAnnualReport(filings),
  };
}

function parseConcept(payload: unknown): ConceptUnits {
  const units: ConceptUnits = {};

  for (const [unit, facts] of Object.entries(
    conceptSchema.parse(payload).units,
  )) {
    units[unit] = facts.flatMap((fact) => {
      const parsed = factSchema.safeParse(fact);

      return parsed.success ? [parsed.data] : [];
    });
  }

  return units;
}

class SecStatusError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`La SEC respondió con ${status} a ${url}.`);
  }
}

let nextStartAt = 0;

/** Spaces request starts by `REQUEST_INTERVAL_MS`; the wait happens before the timeout starts, so a queued request keeps its full deadline. */
async function paced<T>(run: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const startAt = Math.max(now, nextStartAt);

  nextStartAt = startAt + REQUEST_INTERVAL_MS;

  if (startAt > now)
    await new Promise((resolve) => setTimeout(resolve, startAt - now));

  return run();
}

/** One GET with the declared `User-Agent`. With `notFoundIsData`, a 404 resolves to `null`: the SEC answers 404 for a concept the company does not report. */
function requestSec(url: string, notFoundIsData = false): Promise<unknown> {
  return paced(() =>
    withUpstreamTimeout(REQUEST_TIMEOUT_MS, async (signal) => {
      const response = await fetch(url, {
        headers: { "user-agent": SEC_USER_AGENT, accept: "application/json" },
        signal,
      });

      if (notFoundIsData && response.status === 404) return null;
      if (!response.ok) throw new SecStatusError(url, response.status);

      return response.json() as Promise<unknown>;
    }),
  );
}

/** The company's submissions: its name, tickers, recent filings and latest annual report. One request. */
const filingsSource = (cik: number): SnapshotSource<Submissions> => ({
  key: `${KEY_PREFIX}filings:${cik}@1`,
  schema: storedSubmissionsSchema,
  staleAfterMs: STALE_COMPANY_COPY_MS,
  fetchRows: async () => [
    parseSubmissions(
      cik,
      await requestSec(`${DATA_BASE}/submissions/CIK${paddedCik(cik)}.json`),
    ),
  ],
});

/** `null` when the company does not report the tag (404). */
async function requestConcept(cik: number, taxonomy: Taxonomy, tag: string) {
  const payload = await requestSec(
    `${DATA_BASE}/api/xbrl/companyconcept/CIK${paddedCik(cik)}/${taxonomy}/${tag}.json`,
    true,
  );

  return payload === null ? null : parseConcept(payload);
}

const requestTaxonomy = (cik: number, taxonomy: Taxonomy) =>
  Promise.allSettled(
    FIGURES.map((figure) =>
      requestConcept(cik, taxonomy, figure.tags[taxonomy]),
    ),
  );

/**
 * The latest annual revenue, profit, total assets and equity as the company reported them, each with its unit, period and form.
 * Asks the four `ifrs-full` tags first; only when all four answer 404 does it ask the `us-gaap` ones, so a company costs four concept requests, or eight for a US-GAAP filer.
 * A tag the company does not report reads as `null`; a failed request also reads as `null` and is named in `missing`. Rejects when every request failed.
 */
async function requestFigures(cik: number): Promise<CompanyFiguresData> {
  let taxonomy: Taxonomy = TAXONOMIES[0];
  let results = await requestTaxonomy(cik, taxonomy);

  const nothingReported = (settled: typeof results) =>
    settled.every(
      (result) => result.status === "fulfilled" && result.value === null,
    );

  if (nothingReported(results)) {
    taxonomy = TAXONOMIES[1];
    results = await requestTaxonomy(cik, taxonomy);
  }

  if (results.every((result) => result.status === "rejected"))
    throw new Error("La SEC no respondió ninguna cifra de la empresa.");

  const figures = {} as Record<FigureId, ReportedFigure | null>;
  const missing: FigureId[] = [];

  FIGURES.forEach((figure, index) => {
    const result = results[index];

    if (result.status === "rejected") {
      figures[figure.id] = null;
      missing.push(figure.id);

      return;
    }

    const latest = result.value && latestAnnualFact(result.value, figure.kind);

    figures[figure.id] = latest
      ? toReportedFigure(taxonomy, figure.tags[taxonomy], latest)
      : null;
  });

  return {
    taxonomy: nothingReported(results) ? null : taxonomy,
    figures: alignToOneReport(figures),
    missing,
  };
}

/** The figures read after the annual report `annualAccession`. A refresh reuses the previous copy while no newer annual report is filed and nothing was missing, so it usually costs no request. */
const figuresSource = (
  cik: number,
  annualAccession: string | null,
): SnapshotSource<StoredFigures> => ({
  key: `${KEY_PREFIX}figures:${cik}@1`,
  schema: storedFiguresSchema,
  staleAfterMs: STALE_COMPANY_COPY_MS,
  fetchRows: async (_env, _now, previous) => {
    const kept = previous?.[0];

    if (
      kept &&
      kept.annualAccession === annualAccession &&
      kept.data.missing.length === 0
    )
      return [kept];

    return [{ annualAccession, data: await requestFigures(cik) }];
  },
});

type Resolution =
  | { status: "resolved"; submissions: Submissions; retrievedAt: number }
  | { status: "unresolved"; retrievedAt: number };

/** The company's submissions copy, `unresolved` when they do not list its ticker. Rejects when there is no copy and the request fails. */
async function resolveIssuer(
  env: SnapshotEnv,
  issuer: Issuer,
): Promise<Resolution> {
  const { rows, fetchedAt } = await loadSnapshot(
    filingsSource(issuer.cik),
    env,
  );

  const retrievedAt = Date.parse(fetchedAt);

  if (!listsTicker(rows[0].tickers, issuer.ticker))
    return { status: "unresolved", retrievedAt };

  return { status: "resolved", submissions: rows[0], retrievedAt };
}

function freshnessAt(retrievedAt: number): EquityFreshness {
  return {
    status: "current",
    fetchedAt: new Date(retrievedAt).toISOString(),
    fetchedAtLabel: argentineDateTime(new Date(retrievedAt)),
  };
}

const UNAVAILABLE = {
  status: "unavailable",
  data: null,
  freshness: null,
} as const;

/**
 * Every issuer with its latest annual report, from one submissions copy per issuer.
 * Each issuer resolves on its own. Unavailable only when every issuer's copy is missing and its request failed. Never rejects.
 */
export async function getIssuerList(
  env: SnapshotEnv,
): Promise<EquityPanel<IssuerListData>> {
  const resolutions = await Promise.allSettled(
    ISSUERS.map((issuer) => resolveIssuer(env, issuer)),
  );

  const rows = ISSUERS.map((issuer, index): IssuerRow => {
    const result = resolutions[index];

    if (result.status === "rejected") return { issuer, status: "unavailable" };
    if (result.value.status === "unresolved")
      return { issuer, status: "unresolved" };

    return {
      issuer,
      status: "available",
      cik: issuer.cik,
      secName: result.value.submissions.name,
      latestAnnual: result.value.submissions.latestAnnual,
    };
  });

  if (rows.every((row) => row.status === "unavailable")) return UNAVAILABLE;

  const retrievedAt = Math.min(
    ...resolutions.flatMap((result) =>
      result.status === "fulfilled" ? [result.value.retrievedAt] : [],
    ),
  );

  return {
    status: "available",
    data: { rows },
    freshness: freshnessAt(retrievedAt),
  };
}

/** One issuer's recent filings and latest annual report, from its submissions copy. Never rejects. */
export async function getCompanyFilings(
  env: SnapshotEnv,
  ticker: string,
): Promise<CompanyPanel<CompanyFilingsData>> {
  const issuer = findIssuer(ticker);
  if (!issuer) return unresolvedPanel();

  try {
    const resolution = await resolveIssuer(env, issuer);
    if (resolution.status === "unresolved") return unresolvedPanel();

    return {
      status: "available",
      data: {
        issuer,
        cik: issuer.cik,
        secName: resolution.submissions.name,
        filings: resolution.submissions.filings,
        latestAnnual: resolution.submissions.latestAnnual,
      },
      freshness: freshnessAt(resolution.retrievedAt),
    };
  } catch {
    return UNAVAILABLE;
  }
}

/** One issuer's annual figures, from its figures copy (see `requestFigures`). Never rejects. */
export async function getCompanyFigures(
  env: SnapshotEnv,
  ticker: string,
): Promise<CompanyPanel<CompanyFiguresData>> {
  const issuer = findIssuer(ticker);
  if (!issuer) return unresolvedPanel();

  try {
    const resolution = await resolveIssuer(env, issuer);
    if (resolution.status === "unresolved") return unresolvedPanel();

    const { rows, fetchedAt } = await loadSnapshot(
      figuresSource(
        issuer.cik,
        resolution.submissions.latestAnnual?.accessionNumber ?? null,
      ),
      env,
    );

    return {
      status: "available",
      data: rows[0].data,
      freshness: freshnessAt(
        Math.min(resolution.retrievedAt, Date.parse(fetchedAt)),
      ),
    };
  } catch {
    return UNAVAILABLE;
  }
}

/** Companies refreshed on each day of the week (UTC), so the weekly refresh spreads over the days: company `n` on weekday `n mod 7`. */
export const companiesDueOn = (now: Date): readonly Issuer[] =>
  ISSUERS.filter((_, index) => index % 7 === now.getUTCDay());

/**
 * The cron's weekly refresh of one company: its submissions (one request), then its figures, asked again only when a new annual report was filed or a figure was missing.
 * `current` when both copies are already from today.
 */
export async function refreshCompany(
  env: SnapshotEnv,
  now: Date,
  issuer: Issuer,
): Promise<RefreshOutcome> {
  const key = `${KEY_PREFIX}company:${issuer.ticker}`;
  const filings = await refreshSnapshot(filingsSource(issuer.cik), env, now);

  if (filings.status === "failed") return { ...filings, key };

  const stored = env.DB
    ? await readSnapshot(
        env.DB,
        filingsSource(issuer.cik).key,
        storedSubmissionsSchema,
      )
    : null;

  const submissions = stored?.rows[0];

  if (!submissions || !listsTicker(submissions.tickers, issuer.ticker))
    return { ...filings, key };

  const figures = await refreshSnapshot(
    figuresSource(
      issuer.cik,
      submissions.latestAnnual?.accessionNumber ?? null,
    ),
    env,
    now,
  );

  if (figures.status === "failed") return { ...figures, key };

  return filings.status === "current" && figures.status === "current"
    ? { key, status: "current" }
    : { key, status: "refreshed", rows: 2 };
}

/** One row for `/api-status` summarising every SEC copy this process has read; a snapshot, not a real-time availability monitor. A 404 for a concept the company does not report counts as an answer, not a failure. */
export const getCompanyFilingSourceHealth = (): SourceHealth =>
  snapshotHealth(KEY_PREFIX);

/** Loads the issuer list, the same copies the panel reads, so `/api-status` reflects them; then reports health. */
export async function checkCompanyFilingSources(
  env: SnapshotEnv,
): Promise<SourceHealth> {
  await getIssuerList(env);

  return getCompanyFilingSourceHealth();
}
