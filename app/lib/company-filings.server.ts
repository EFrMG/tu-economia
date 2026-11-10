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
import { createPromiseCache } from "~/lib/promise-cache.server";
import { SUPPORT_EMAIL } from "~/lib/support";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const DATA_BASE = "https://data.sec.gov";

/** The ticker file changes when companies list or delist; filings and reported figures change a few times a year. */
const TICKERS_TTL_MS = 24 * 60 * 60_000;
const SUBMISSIONS_TTL_MS = 6 * 60 * 60_000;
const CONCEPT_TTL_MS = 6 * 60 * 60_000;

const REQUEST_TIMEOUT_MS = 8_000;

/** At most eight request starts per second from this process, under the SEC's limit of ten. */
const REQUEST_INTERVAL_MS = 125;

/**
 * The SEC's fair-access policy refuses requests that do not name the application and a contact address.
 * No URL: on 2026-11-10 the SEC answered 403 ("Request Rate Threshold Exceeded") to the same header with the repository URL in it, and 200 without it.
 */
export const SEC_USER_AGENT = `TuEconomia/1.0 (${SUPPORT_EMAIL})`;

const tickerEntrySchema = z.object({
  cik_str: z.coerce.number().int().positive(),
  ticker: z.string().min(1),
  title: z.string(),
});

/** An object keyed `"0"`, `"1"`, …; entries are checked one by one so a malformed one cannot hide the rest. */
const tickerFileSchema = z.record(z.string(), z.unknown());

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

interface TickerEntry {
  cik: number;
  title: string;
}

interface Submissions {
  name: string;
  tickers: string[];
  /** Listed forms only, newest first, at most `RECENT_FILINGS_LIMIT`. */
  filings: FilingRef[];
  latestAnnual: FilingRef | null;
}

type ConceptUnits = Record<string, ConceptFact[]>;

const ISSUER_TICKERS = new Set(ISSUERS.map((issuer) => issuer.ticker));

/** Keeps only the issuer table's tickers, so the large file is not held in memory. */
function parseTickerFile(payload: unknown): Map<string, TickerEntry> {
  const entries = new Map<string, TickerEntry>();

  for (const raw of Object.values(tickerFileSchema.parse(payload))) {
    const parsed = tickerEntrySchema.safeParse(raw);
    if (!parsed.success) continue;

    const ticker = parsed.data.ticker.trim().toUpperCase();

    if (ISSUER_TICKERS.has(ticker) && !entries.has(ticker))
      entries.set(ticker, {
        cik: parsed.data.cik_str,
        title: parsed.data.title,
      });
  }

  if (!entries.size)
    throw new Error("El archivo de tickers de la SEC no incluyó emisores.");

  return entries;
}

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

const cache = createPromiseCache();

interface Loaded<T> {
  value: T;
  retrievedAt: number;
}

/** Health per request key: the ticker file, each company's submissions and each concept. The keys are bounded by the issuer table. */
const requestHealth = new Map<string, SourceHealth>();

/** Keys with a request in progress; `/api-status` counts them as not yet answered. */
const inFlight = new Set<string>();

function updateHealth(key: string, update: Partial<SourceHealth>) {
  requestHealth.set(key, {
    status: "not-checked",
    lastSuccessfulFetchAt: null,
    lastFailureAt: null,
    ...requestHealth.get(key),
    ...update,
  });
}

/** Cached, validated value for one request; rejects when the request or its validation fails. */
async function load<T>(
  key: string,
  ttlMs: number,
  fetchAndParse: () => Promise<T>,
): Promise<Loaded<T>> {
  const cached = cache.isFresh(key);

  inFlight.add(key);

  try {
    const loaded = await cache.get(key, ttlMs, async () => {
      const value = await fetchAndParse();
      const retrievedAt = Date.now();

      updateHealth(key, {
        lastSuccessfulFetchAt: new Date(retrievedAt).toISOString(),
      });

      return { value, retrievedAt };
    });

    updateHealth(key, { status: cached ? "cached" : "fetched" });

    return loaded;
  } catch (error) {
    updateHealth(key, {
      status: "failed",
      lastFailureAt: new Date().toISOString(),
    });

    throw error;
  } finally {
    inFlight.delete(key);
  }
}

function loadTickers() {
  return load("tickers", TICKERS_TTL_MS, async () =>
    parseTickerFile(await requestSec(TICKERS_URL)),
  );
}

function loadSubmissions(cik: number) {
  return load(`submissions:${cik}`, SUBMISSIONS_TTL_MS, async () =>
    parseSubmissions(
      cik,
      await requestSec(`${DATA_BASE}/submissions/CIK${paddedCik(cik)}.json`),
    ),
  );
}

/** `null` when the company does not report the tag (404). */
function loadConcept(cik: number, taxonomy: Taxonomy, tag: string) {
  return load(`concept:${cik}:${taxonomy}:${tag}`, CONCEPT_TTL_MS, async () => {
    const payload = await requestSec(
      `${DATA_BASE}/api/xbrl/companyconcept/CIK${paddedCik(cik)}/${taxonomy}/${tag}.json`,
      true,
    );

    return payload === null ? null : parseConcept(payload);
  });
}

type Resolution =
  | {
      status: "resolved";
      cik: number;
      submissions: Submissions;
      retrievedAt: number;
    }
  | { status: "unresolved" };

/**
 * Ticker → CIK through the SEC's ticker file, then the company's submissions. A ticker missing from the file, or a CIK whose submissions do not list the ticker, is `unresolved`.
 * Rejects when a request fails.
 */
async function resolveIssuer(issuer: Issuer): Promise<Resolution> {
  const tickers = await loadTickers();
  const entry = tickers.value.get(issuer.ticker);
  if (!entry) return { status: "unresolved" };

  const submissions = await loadSubmissions(entry.cik);

  if (!listsTicker(submissions.value.tickers, issuer.ticker))
    return { status: "unresolved" };

  return {
    status: "resolved",
    cik: entry.cik,
    submissions: submissions.value,
    retrievedAt: Math.min(tickers.retrievedAt, submissions.retrievedAt),
  };
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
 * Every issuer with its latest annual report: one ticker-file request plus one submissions request per issuer, at most.
 * Each issuer resolves on its own. Unavailable only when the ticker file cannot be read or every issuer's request failed. Never rejects.
 */
export async function getIssuerList(): Promise<EquityPanel<IssuerListData>> {
  let tickersRetrievedAt: number;

  try {
    tickersRetrievedAt = (await loadTickers()).retrievedAt;
  } catch {
    return UNAVAILABLE;
  }

  const resolutions = await Promise.allSettled(ISSUERS.map(resolveIssuer));

  const rows = ISSUERS.map((issuer, index): IssuerRow => {
    const result = resolutions[index];

    if (result.status === "rejected") return { issuer, status: "unavailable" };
    if (result.value.status === "unresolved")
      return { issuer, status: "unresolved" };

    return {
      issuer,
      status: "available",
      cik: result.value.cik,
      secName: result.value.submissions.name,
      latestAnnual: result.value.submissions.latestAnnual,
    };
  });

  if (rows.every((row) => row.status === "unavailable")) return UNAVAILABLE;

  const retrievedAt = Math.min(
    tickersRetrievedAt,
    ...resolutions.flatMap((result) =>
      result.status === "fulfilled" && result.value.status === "resolved"
        ? [result.value.retrievedAt]
        : [],
    ),
  );

  return {
    status: "available",
    data: { rows },
    freshness: freshnessAt(retrievedAt),
  };
}

/** One issuer's recent filings and latest annual report: the ticker file and its submissions. Never rejects. */
export async function getCompanyFilings(
  ticker: string,
): Promise<CompanyPanel<CompanyFilingsData>> {
  const issuer = findIssuer(ticker);
  if (!issuer) return unresolvedPanel();

  try {
    const resolution = await resolveIssuer(issuer);
    if (resolution.status === "unresolved") return unresolvedPanel();

    return {
      status: "available",
      data: {
        issuer,
        cik: resolution.cik,
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

type ConceptResult = PromiseSettledResult<Loaded<ConceptUnits | null>>;

function loadTaxonomy(cik: number, taxonomy: Taxonomy) {
  return Promise.allSettled(
    FIGURES.map((figure) => loadConcept(cik, taxonomy, figure.tags[taxonomy])),
  );
}

/**
 * The latest annual revenue, profit, total assets and equity as the company reported them, each with its unit, period and form.
 * Asks the four `ifrs-full` tags first; only when all four answer 404 does it ask the `us-gaap` ones, so a company costs four concept requests, or eight for a US-GAAP filer.
 * A tag the company does not report reads as `null`; a failed request also reads as `null` and is named in `missing`. Never rejects.
 */
export async function getCompanyFigures(
  ticker: string,
): Promise<CompanyPanel<CompanyFiguresData>> {
  const issuer = findIssuer(ticker);
  if (!issuer) return unresolvedPanel();

  let resolution: Resolution;

  try {
    resolution = await resolveIssuer(issuer);
  } catch {
    return UNAVAILABLE;
  }

  if (resolution.status === "unresolved") return unresolvedPanel();

  const { cik } = resolution;

  let taxonomy: Taxonomy = TAXONOMIES[0];
  let results: ConceptResult[] = await loadTaxonomy(cik, taxonomy);

  const nothingReported = (settled: ConceptResult[]) =>
    settled.every(
      (result) => result.status === "fulfilled" && result.value.value === null,
    );

  if (nothingReported(results)) {
    taxonomy = TAXONOMIES[1];
    results = await loadTaxonomy(cik, taxonomy);
  }

  if (results.every((result) => result.status === "rejected"))
    return UNAVAILABLE;

  const figures = {} as Record<FigureId, ReportedFigure | null>;
  const missing: FigureId[] = [];

  FIGURES.forEach((figure, index) => {
    const result = results[index];

    if (result.status === "rejected") {
      figures[figure.id] = null;
      missing.push(figure.id);

      return;
    }

    const units = result.value.value;
    const latest = units && latestAnnualFact(units, figure.kind);

    figures[figure.id] = latest
      ? toReportedFigure(taxonomy, figure.tags[taxonomy], latest)
      : null;
  });

  const retrievedAt = Math.min(
    resolution.retrievedAt,
    ...results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value.retrievedAt] : [],
    ),
  );

  return {
    status: "available",
    data: {
      taxonomy: nothingReported(results) ? null : taxonomy,
      figures: alignToOneReport(figures),
      missing,
    },
    freshness: freshnessAt(retrievedAt),
  };
}

/**
 * One row for `/api-status` summarising every SEC request this process has made; a snapshot, not a real-time availability monitor.
 * A 404 for a concept the company does not report counts as an answer, not a failure.
 */
export function getCompanyFilingSourceHealth(): SourceHealth {
  const keys = [...requestHealth.keys()];
  const all = keys.map((key) => requestHealth.get(key)!);

  const checked = keys
    .filter(
      (key) =>
        !inFlight.has(key) && requestHealth.get(key)!.status !== "not-checked",
    )
    .map((key) => requestHealth.get(key)!);

  const unanswered = keys.length - checked.length;

  const latest = (values: (string | null)[]) =>
    values.reduce<string | null>(
      (max, value) =>
        value !== null && (max === null || value > max) ? value : max,
      null,
    );

  const failed = checked.filter((health) => health.status === "failed").length;

  const status: SourceHealth["status"] = !checked.length
    ? "not-checked"
    : failed === checked.length
      ? "failed"
      : failed > 0 || unanswered > 0
        ? "partial"
        : checked.every((health) => health.status === "cached")
          ? "cached"
          : "fetched";

  return {
    status,
    lastSuccessfulFetchAt: latest(
      all.map((health) => health.lastSuccessfulFetchAt),
    ),
    lastFailureAt: latest(all.map((health) => health.lastFailureAt)),
  };
}

/** Loads the issuer list, the same requests the panel makes, so `/api-status` reflects them; then reports health. */
export async function checkCompanyFilingSources(): Promise<SourceHealth> {
  await getIssuerList();

  return getCompanyFilingSourceHealth();
}
