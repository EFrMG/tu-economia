import { z } from "zod";
import { createPromiseCache } from "~/lib/promise-cache.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import type { SourceHealth } from "~/lib/exchange-rates.server";

import {
  EQUITY_CURRENCIES,
  buildCedearRows,
  buildIndexStrip,
  buildLeaderRows,
  latestTradeTime,
  type CedearPanelData,
  type EquityFreshness,
  type EquityPanel,
  type IndexRecord,
  type LeaderPanelData,
  type MarketIndex,
  type SecurityRecord,
} from "~/lib/equities";

const SITE_URL = "https://open.bymadata.com.ar";
const API_BASE = `${SITE_URL}/vanoms-be-core/rest/api/bymadata/free`;

const CACHE_TTL_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

/** A failed refresh may show the last usable list for at most 15 minutes after it was fetched. */
const MAX_STALE_MS = 15 * 60_000;

/** T+1 (24 hs) prices, which is what BYMA's own site shows. */
const SECURITIES_BODY = JSON.stringify({
  excludeZeroPxAndQty: false,
  T2: false,
  T1: true,
  T0: false,
  "Content-Type": "application/json",
});

const PLAIN_BODY = JSON.stringify({ "Content-Type": "application/json" });

/** Settlement code of the 24 hs term requested above. */
const SETTLEMENT_24HS = "2";

const securitySchema = z.object({
  symbol: z.string().min(1),
  denominationCcy: z.string(),
  settlementType: z.string().nullish(),
  // A single record without a last price must not take the whole list down; it reads as untraded.
  trade: z.number().finite().nullish(),
  previousClosingPrice: z.number().finite().nullish(),
  volume: z.number().finite().nullish(),
  volumeAmount: z.number().finite().nullish(),
  numberOfOrders: z.number().finite().nullish(),
  tradeHour: z.string().nullish(),
  bidPrice: z.number().finite().nullish(),
  offerPrice: z.number().finite().nullish(),
});

const indexSchema = z.object({
  symbol: z.string().min(1),
  price: z.number().finite(),
  variation: z.number().finite().nullish(),
  previousClosingPrice: z.number().finite().nullish(),
  highValue: z.number().finite().nullish(),
  minValue: z.number().finite().nullish(),
  date: z.string().nullish(),
});

/** BYMA answers some lists bare and others wrapped in `{ content, data }`. */
function listResponse<T extends z.ZodType>(item: T) {
  return z.union([
    z.array(item),
    z.object({ data: z.array(item) }).transform((payload) => payload.data),
  ]);
}

const securitiesSchema = listResponse(securitySchema);
const indicesSchema = listResponse(indexSchema);
const marketOpenSchema = z.boolean();

type EndpointId =
  "cedears" | "etf" | "leading-equity" | "index-price" | "market-open";

interface Endpoint<T> {
  id: EndpointId;
  method: "GET" | "POST";
  body?: string;
  /** Section header BYMA expects; without it the API may answer 400. */
  options: "renta-variable" | "dashboard";
  parse: (payload: unknown) => T;
  /** How long after its fetch a snapshot may stand in for a failed refresh. */
  maxStaleMs: number;
}

/** Keeps 24 hs records in the three known currencies; other terms and currencies are not shown. */
function parseSecurities(id: EndpointId, payload: unknown): SecurityRecord[] {
  const records = securitiesSchema
    .parse(payload)
    .filter(
      (record) =>
        record.settlementType == null ||
        record.settlementType === SETTLEMENT_24HS,
    )
    .flatMap((record) => {
      const currency = EQUITY_CURRENCIES.find(
        (item) => item === record.denominationCcy,
      );

      return currency ? [{ ...record, denominationCcy: currency }] : [];
    });

  if (!records.length) throw new Error(`BYMA no incluyó especies en ${id}.`);

  return records;
}

function parseIndices(payload: unknown): IndexRecord[] {
  const records = indicesSchema.parse(payload);

  if (!buildIndexStrip(records).length)
    throw new Error("BYMA no incluyó el S&P Merval ni el S&P BYMA General.");

  return records;
}

const ENDPOINTS = {
  cedears: {
    id: "cedears",
    method: "POST",
    body: SECURITIES_BODY,
    options: "renta-variable",
    parse: (payload) => parseSecurities("cedears", payload),
    maxStaleMs: MAX_STALE_MS,
  },
  etf: {
    id: "etf",
    method: "POST",
    body: SECURITIES_BODY,
    options: "renta-variable",
    parse: (payload) => parseSecurities("etf", payload),
    maxStaleMs: MAX_STALE_MS,
  },
  leaders: {
    id: "leading-equity",
    method: "POST",
    body: SECURITIES_BODY,
    options: "renta-variable",
    parse: (payload) => parseSecurities("leading-equity", payload),
    maxStaleMs: MAX_STALE_MS,
  },
  indices: {
    id: "index-price",
    method: "POST",
    body: PLAIN_BODY,
    options: "renta-variable",
    parse: parseIndices,
    maxStaleMs: MAX_STALE_MS,
  },
  // An old open/closed flag would contradict the clock, so a failed check is reported as unavailable instead.
  marketOpen: {
    id: "market-open",
    method: "GET",
    options: "dashboard",
    parse: (payload) => marketOpenSchema.parse(payload),
    maxStaleMs: 0,
  },
} satisfies {
  cedears: Endpoint<SecurityRecord[]>;
  etf: Endpoint<SecurityRecord[]>;
  leaders: Endpoint<SecurityRecord[]>;
  indices: Endpoint<IndexRecord[]>;
  marketOpen: Endpoint<boolean>;
};

const ENDPOINT_IDS: EndpointId[] = [
  "cedears",
  "etf",
  "leading-equity",
  "index-price",
  "market-open",
];

const cache = createPromiseCache();

interface Snapshot<T> {
  value: T;
  retrievedAt: number;
}

interface Loaded<T> extends Snapshot<T> {
  status: "current" | "stale";
}

const snapshots = new Map<EndpointId, Snapshot<unknown>>();

const endpointHealth = new Map<EndpointId, SourceHealth>(
  ENDPOINT_IDS.map((id) => [
    id,
    { status: "not-checked", lastSuccessfulFetchAt: null, lastFailureAt: null },
  ]),
);

/** Endpoints with a request in progress; `/api-status` counts them as not yet answered. */
const inFlight = new Set<EndpointId>();

function updateHealth(id: EndpointId, update: Partial<SourceHealth>) {
  endpointHealth.set(id, { ...endpointHealth.get(id)!, ...update });
}

/** `16/10/2026, 13:45` in Buenos Aires time; shared with the SEC EDGAR module, which labels its fetch times the same way. */
export function argentineDateTime(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

class BymaStatusError extends Error {
  constructor(
    readonly path: EndpointId,
    readonly status: number,
  ) {
    super(`BYMA ${path} respondió con ${status}.`);
  }
}

/** One request with the browser-like headers BYMA's site sends; a 400, which BYMA returns at random under load, is retried once. */
async function requestByma(endpoint: Endpoint<unknown>): Promise<unknown> {
  return withUpstreamTimeout(REQUEST_TIMEOUT_MS, async (signal) => {
    const attempt = async () => {
      const response = await fetch(`${API_BASE}/${endpoint.id}`, {
        method: endpoint.method,
        body: endpoint.body,
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/plain, */*",
          origin: SITE_URL,
          referer: `${SITE_URL}/`,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          options: endpoint.options,
        },
        signal,
      });

      if (!response.ok) throw new BymaStatusError(endpoint.id, response.status);

      return response.json() as Promise<unknown>;
    };

    try {
      return await attempt();
    } catch (error) {
      if (error instanceof BymaStatusError && error.status === 400)
        return attempt();

      throw error;
    }
  });
}

/** Cached, validated list for one endpoint, or its recent snapshot when the refresh fails; rejects when neither is available. */
async function loadEndpoint<T>(endpoint: Endpoint<T>): Promise<Loaded<T>> {
  const { id } = endpoint;
  const cached = cache.isFresh(id);

  inFlight.add(id);

  try {
    const value = await cache.get(id, CACHE_TTL_MS, async () => {
      const parsed = endpoint.parse(await requestByma(endpoint));
      const retrievedAt = Date.now();

      snapshots.set(id, { value: parsed, retrievedAt });

      updateHealth(id, {
        lastSuccessfulFetchAt: new Date(retrievedAt).toISOString(),
      });

      return parsed;
    });

    updateHealth(id, { status: cached ? "cached" : "fetched" });

    return {
      value,
      retrievedAt: snapshots.get(id)?.retrievedAt ?? Date.now(),
      status: "current",
    };
  } catch (error) {
    const snapshot = snapshots.get(id) as Snapshot<T> | undefined;
    const lastFailureAt = new Date().toISOString();

    if (snapshot && Date.now() - snapshot.retrievedAt <= endpoint.maxStaleMs) {
      updateHealth(id, { status: "stale", lastFailureAt });

      return { ...snapshot, status: "stale" };
    }

    updateHealth(id, { status: "failed", lastFailureAt });

    throw error;
  } finally {
    inFlight.delete(id);
  }
}

/** The oldest of the sources a panel was built from decides its freshness. */
function freshnessOf(loaded: Loaded<unknown>[]): EquityFreshness {
  const retrievedAt = Math.min(...loaded.map((item) => item.retrievedAt));

  return {
    status: loaded.some((item) => item.status === "stale")
      ? "stale"
      : "current",
    fetchedAt: new Date(retrievedAt).toISOString(),
    fetchedAtLabel: argentineDateTime(new Date(retrievedAt)),
  };
}

const UNAVAILABLE = {
  status: "unavailable",
  data: null,
  freshness: null,
} as const;

async function panelFrom<T, R>(
  endpoint: Endpoint<T>,
  build: (value: T) => R,
): Promise<EquityPanel<R>> {
  try {
    const loaded = await loadEndpoint(endpoint);

    return {
      status: "available",
      data: build(loaded.value),
      freshness: freshnessOf([loaded]),
    };
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * CEDEARs and CEDEAR ETFs ranked by peso traded amount, with the implied rate and the day decomposition per row.
 * Available while at least one of the two BYMA lists can be obtained; `missingSources` names the one that could not. Never rejects.
 */
export async function getCedearPanel(): Promise<EquityPanel<CedearPanelData>> {
  const [cedears, etfs] = await Promise.allSettled([
    loadEndpoint(ENDPOINTS.cedears),
    loadEndpoint(ENDPOINTS.etf),
  ]);

  const loaded = [cedears, etfs].flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (!loaded.length) return UNAVAILABLE;

  const rows = buildCedearRows(
    cedears.status === "fulfilled" ? cedears.value.value : [],
    etfs.status === "fulfilled" ? etfs.value.value : [],
  );

  const missingSources = (["cedears", "etf"] as const).filter(
    (_, index) => [cedears, etfs][index].status === "rejected",
  );

  return {
    status: "available",
    data: {
      rows,
      latestTradeTime: latestTradeTime(rows.map((row) => row.pesos)),
      missingSources,
    },
    freshness: freshnessOf(loaded),
  };
}

/** The S&P Merval leaders in pesos, with name and sector, ranked by traded amount. Never rejects. */
export function getLeaderPanel(): Promise<EquityPanel<LeaderPanelData>> {
  return panelFrom(ENDPOINTS.leaders, (records) => {
    const rows = buildLeaderRows(records);

    return { rows, latestTradeTime: latestTradeTime(rows) };
  });
}

/** S&P Merval then S&P BYMA General; either may be absent from `data` when BYMA omits it. Never rejects. */
export function getIndexStrip(): Promise<EquityPanel<MarketIndex[]>> {
  return panelFrom(ENDPOINTS.indices, buildIndexStrip);
}

/** Whether BYMA is trading right now; unavailable (never stale) when the check fails. Never rejects. */
export function getMarketOpen(): Promise<EquityPanel<boolean>> {
  return panelFrom(ENDPOINTS.marketOpen, (open) => open);
}

export interface EquitiesOverview {
  indices: EquityPanel<MarketIndex[]>;
  cedears: EquityPanel<CedearPanelData>;
  leaders: EquityPanel<LeaderPanelData>;
  marketOpen: EquityPanel<boolean>;
}

/** All four panels in parallel; each one is independently available or unavailable. */
export async function getEquitiesOverview(): Promise<EquitiesOverview> {
  const [indices, cedears, leaders, marketOpen] = await Promise.all([
    getIndexStrip(),
    getCedearPanel(),
    getLeaderPanel(),
    getMarketOpen(),
  ]);

  return { indices, cedears, leaders, marketOpen };
}

/**
 * One row for `/api-status` summarising the five BYMA requests made by this process; a snapshot, not a real-time availability monitor.
 * `partial` when some requests fail or are still unanswered (never checked, or in progress when `/api-status` stops waiting) and others succeed, `stale` when a failed refresh was covered by a recent snapshot.
 */
export function getEquitySourceHealth(): SourceHealth {
  const all = ENDPOINT_IDS.map((id) => endpointHealth.get(id)!);

  const checked = ENDPOINT_IDS.filter(
    (id) =>
      !inFlight.has(id) && endpointHealth.get(id)!.status !== "not-checked",
  ).map((id) => endpointHealth.get(id)!);

  const unanswered = ENDPOINT_IDS.length - checked.length;

  const latest = (values: (string | null)[]) =>
    values.reduce<string | null>(
      (max, value) =>
        value !== null && (max === null || value > max) ? value : max,
      null,
    );

  const lastSuccessfulFetchAt = latest(
    all.map((health) => health.lastSuccessfulFetchAt),
  );

  const lastFailureAt = latest(all.map((health) => health.lastFailureAt));

  const failed = checked.filter((health) => health.status === "failed").length;

  const status: SourceHealth["status"] = !checked.length
    ? "not-checked"
    : failed === checked.length
      ? "failed"
      : failed > 0 || unanswered > 0
        ? "partial"
        : checked.some((health) => health.status === "stale")
          ? "stale"
          : checked.every((health) => health.status === "cached")
            ? "cached"
            : "fetched";

  return { status, lastSuccessfulFetchAt, lastFailureAt };
}

/** Runs every panel so `/api-status` reflects the same requests the page makes, then reports health. */
export async function checkEquitySources(): Promise<SourceHealth> {
  await getEquitiesOverview();

  return getEquitySourceHealth();
}
