import { z } from "zod";
import { createPromiseCache } from "~/lib/promise-cache.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

import {
  historyForCalendarDays,
  mergeHistoricalSeries,
  normalizeHistory,
  argentinaCalendarDate,
  type HistoricalChartPoint,
  type HistoricalRatePoint,
} from "~/lib/exchange-rate-history";

const RATES_URL = "https://dolarapi.com/v1/dolares";
const HISTORY_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares";

/** Rate shown as the hero metric of the dashboard. */
export const HIGHLIGHT_CASA = "blue";

/** Rates shown in the exchange grid, in display order. */
export const GRID_CASAS = [
  "oficial",
  "bolsa",
  "contadoconliqui",
  "cripto",
] as const;

export type Casa = (typeof GRID_CASAS)[number] | typeof HIGHLIGHT_CASA;

const liveRateSchema = z.object({
  casa: z.string(),
  nombre: z.string(),
  compra: z.number(),
  venta: z.number(),
  fechaActualizacion: z.string(),
});

const historyPointSchema = z.object({
  fecha: z.string(),
  venta: z.number().nullable(),
});

const liveRatesSchema = z.array(liveRateSchema);
const historySchema = z.array(historyPointSchema);
type LiveRate = z.infer<typeof liveRateSchema>;

export interface ExchangeRate {
  casa: Casa;
  nombre: string;
  compra: number;
  venta: number;
  /** Daily change of `venta` against the previous close, in percent. */
  changePct: number | null;
  /** Closing `venta` values, oldest first. Empty when history is unavailable. */
  history: number[];
}

export interface DashboardRates {
  highlight: ExchangeRate;
  grid: ExchangeRate[];
  /** Gap of each rate against the official one, in percent, keyed by casa. */
  brecha: Record<string, number>;
  /** Preformatted provider quote date and time in Argentine time, when supplied. */
  updatedAt: string | null;
  /** Whether live rates could not be refreshed and a recent snapshot is shown. */
  freshness: {
    status: "current" | "stale";
    /** ISO timestamp for the last successful fetch made by this service. */
    lastSuccessfulFetchAt: string;
    /** Preformatted successful-fetch time in Argentine time. */
    lastSuccessfulFetchAtLabel: string;
  };
  /** Blue and official selling closes merged by date for the historical chart. */
  historicalChart: HistoricalChartPoint[];
  /** Argentine calendar date used for historical period boundaries. */
  historicalAsOf: string;
  historicalFailedSeries: ("blue" | "oficial")[];
}

export type DashboardHistory = Pick<
  DashboardRates,
  "historicalChart" | "historicalAsOf" | "historicalFailedSeries"
>;

export type SourceHealthStatus =
  "not-checked" | "fetched" | "cached" | "partial" | "stale" | "failed";

export interface SourceHealth {
  status: SourceHealthStatus;
  /** Time at which this server last received a valid response from the source. */
  lastSuccessfulFetchAt: string | null;
  /** Time at which this server last failed to refresh the source. */
  lastFailureAt: string | null;
}

interface ExchangeRateSourceHealth {
  live: SourceHealth;
  history: SourceHealth;
}

/** Points kept for the sparkline. Roughly a trading month. */
const HISTORY_WINDOW = 30;
const HISTORY_RETENTION_DAYS = 90;

const LIVE_TTL_MS = 60_000;
const HISTORY_TTL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

/** A failed live request may show the last usable response for at most 15 minutes. */
const MAX_LIVE_STALE_MS = 15 * 60_000;

const cache = createPromiseCache();

interface LastKnownLiveRates {
  rates: LiveRate[];
  retrievedAt: number;
}

let lastKnownLiveRates: LastKnownLiveRates | undefined;

const sourceHealth: ExchangeRateSourceHealth = {
  live: {
    status: "not-checked",
    lastSuccessfulFetchAt: null,
    lastFailureAt: null,
  },
  history: {
    status: "not-checked",
    lastSuccessfulFetchAt: null,
    lastFailureAt: null,
  },
};

function recordSuccess(
  source: keyof ExchangeRateSourceHealth,
  status: "fetched" | "cached",
) {
  sourceHealth[source] = {
    ...sourceHealth[source],
    status,
    lastSuccessfulFetchAt:
      status === "fetched"
        ? new Date().toISOString()
        : sourceHealth[source].lastSuccessfulFetchAt,
  };
}

function recordFailure(
  source: keyof ExchangeRateSourceHealth,
  status: "failed" | "partial" | "stale" = "failed",
) {
  sourceHealth[source] = {
    ...sourceHealth[source],
    status,
    lastFailureAt: new Date().toISOString(),
  };
}

/** A snapshot of this process's source activity, not a real-time availability monitor. */
export function getExchangeRateSourceHealth(): ExchangeRateSourceHealth {
  return {
    live: { ...sourceHealth.live },
    history: { ...sourceHealth.history },
  };
}

async function fetchJson(url: string): Promise<unknown> {
  return withUpstreamTimeout(REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error(`${url} responded with ${response.status}`);
    }

    return response.json();
  });
}

function fetchLiveRates() {
  const cachedResult = cache.isFresh("live");

  const value = cache.get("live", LIVE_TTL_MS, async () => {
    const rates = liveRatesSchema.parse(await fetchJson(RATES_URL));
    if (!rates.some((rate) => rate.casa === HIGHLIGHT_CASA)) {
      throw new Error("La API no devolvió la cotización principal.");
    }

    lastKnownLiveRates = { rates, retrievedAt: Date.now() };

    return rates;
  });

  return value.then((rates) => {
    if (GRID_CASAS.some((casa) => !rates.some((rate) => rate.casa === casa))) {
      cache.shorten("live", value, 5_000);
    }

    return { rates, cached: cachedResult };
  });
}

/** Closing values for a casa, oldest first, retained for the 90-calendar-day chart window. */
function fetchHistory(casa: Casa, today: string) {
  const key = `history:${casa}`;
  const cachedResult = cache.isFresh(key);

  return cache
    .get(key, HISTORY_TTL_MS, async () => {
      const points = historySchema.parse(
        await fetchJson(`${HISTORY_URL}/${casa}`),
      );

      const validPoints: HistoricalRatePoint[] = points
        .filter((point) => point.venta !== null)
        .map((point) => ({ fecha: point.fecha, venta: point.venta as number }));

      return historyForCalendarDays(
        normalizeHistory(validPoints),
        HISTORY_RETENTION_DAYS,
        today,
      );
    })
    .then((points) => {
      if (!cachedResult) {
        sourceHealth.history.lastSuccessfulFetchAt = new Date().toISOString();
      }

      return { points, cached: cachedResult };
    });
}

async function loadHistories(casas: Casa[], today: string) {
  const attempts = await Promise.allSettled(
    casas.map((casa) => fetchHistory(casa, today)),
  );

  const failed = attempts.some((result) => result.status === "rejected");
  const succeeded = attempts.some((result) => result.status === "fulfilled");

  if (failed) {
    recordFailure("history", succeeded ? "partial" : "failed");
  } else {
    sourceHealth.history.status = attempts.every(
      (result) => result.status === "fulfilled" && result.value.cached,
    )
      ? "cached"
      : "fetched";
  }

  return {
    points: attempts.map((result) =>
      result.status === "fulfilled" ? result.value.points : [],
    ),
    failed: attempts.map((result) => result.status === "rejected"),
  };
}

/** Checks live and historical sources independently without changing the dashboard's loading path. */
export async function checkExchangeRateSources() {
  const casas: Casa[] = [HIGHLIGHT_CASA, ...GRID_CASAS];
  const today = argentineDate(new Date());
  await Promise.allSettled([getUsableLiveRates(), loadHistories(casas, today)]);

  return getExchangeRateSourceHealth();
}

function argentineDate(date: Date) {
  return argentinaCalendarDate(date);
}

function argentineDateTime(date: Date) {
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

async function getUsableLiveRates() {
  try {
    const result = await fetchLiveRates();
    const rates = result.rates;
    const retrievedAt = lastKnownLiveRates?.retrievedAt;
    if (retrievedAt === undefined) {
      throw new Error("No se pudo registrar la cotización principal.");
    }

    recordSuccess("live", result.cached ? "cached" : "fetched");

    return { rates, retrievedAt, status: "current" as const };
  } catch {
    const snapshot = lastKnownLiveRates;
    if (snapshot && Date.now() - snapshot.retrievedAt <= MAX_LIVE_STALE_MS) {
      recordFailure("live", "stale");

      return {
        rates: snapshot.rates,
        retrievedAt: snapshot.retrievedAt,
        status: "stale" as const,
      };
    }

    recordFailure("live");

    throw new Response("No se pudieron obtener cotizaciones de la API.", {
      status: 502,
      statusText: "Bad Gateway",
    });
  }
}

/**
 * Change of the live price against the last close that predates today, so an already-published close for today is not compared against itself.
 */
function changeAgainstPreviousClose(
  venta: number,
  history: { fecha: string; venta: number }[],
  today: string,
) {
  const previous = history.filter((point) => point.fecha < today).at(-1);
  if (!previous || previous.venta === 0) return null;

  return ((venta - previous.venta) / previous.venta) * 100;
}

export async function getDashboardRates(): Promise<DashboardRates> {
  const casas: Casa[] = [HIGHLIGHT_CASA, ...GRID_CASAS];
  const now = new Date();
  const today = argentineDate(now);

  // Begin the independent historical requests while the live feed is still pending.
  const historiesPromise = loadHistories(casas, today);

  const liveResult = await getUsableLiveRates();
  const live = liveResult.rates;

  const historyResult = await historiesPromise;
  const histories = historyResult.points;

  const rates = new Map<Casa, ExchangeRate>();

  casas.forEach((casa, index) => {
    const quote = live.find((rate) => rate.casa === casa);
    if (!quote) return;

    const history = histories[index];

    rates.set(casa, {
      casa,
      nombre: quote.nombre,
      compra: quote.compra,
      venta: quote.venta,
      changePct: changeAgainstPreviousClose(quote.venta, history, today),
      history: history.slice(-HISTORY_WINDOW).map((point) => point.venta),
    });
  });

  const highlight = rates.get(HIGHLIGHT_CASA);
  if (!highlight) {
    throw new Response("La API no devolvió la cotización principal.", {
      status: 502,
      statusText: "Bad Gateway",
    });
  }

  const grid = GRID_CASAS.map((casa) => rates.get(casa)).filter(
    (rate): rate is ExchangeRate => rate !== undefined,
  );

  const oficial = rates.get("oficial");
  const brecha: Record<string, number> = {};
  if (oficial && oficial.venta > 0) {
    for (const rate of rates.values()) {
      brecha[rate.casa] = ((rate.venta - oficial.venta) / oficial.venta) * 100;
    }
  }

  const lastUpdate = live
    .map((rate) => Date.parse(rate.fechaActualizacion))
    .filter((time) => !Number.isNaN(time));

  return {
    highlight,
    grid,
    brecha,
    updatedAt: lastUpdate.length
      ? argentineDateTime(new Date(Math.max(...lastUpdate)))
      : null,
    freshness: {
      status: liveResult.status,
      lastSuccessfulFetchAt: new Date(liveResult.retrievedAt).toISOString(),
      lastSuccessfulFetchAtLabel: argentineDateTime(
        new Date(liveResult.retrievedAt),
      ),
    },
    historicalChart: mergeHistoricalSeries(
      histories[casas.indexOf("blue")],
      histories[casas.indexOf("oficial")],
    ),
    historicalAsOf: today,
    historicalFailedSeries: (["blue", "oficial"] as const).filter(
      (casa) => historyResult.failed[casas.indexOf(casa)],
    ),
  };
}

/** Keeps the historical chart available when the live-rate source fails. */
export async function getDashboardHistory(): Promise<DashboardHistory> {
  const casas = ["blue", "oficial"] as const;
  const today = argentineDate(new Date());
  const result = await loadHistories([...casas], today);
  return {
    historicalChart: mergeHistoricalSeries(result.points[0], result.points[1]),
    historicalAsOf: today,
    historicalFailedSeries: casas.filter((_, index) => result.failed[index]),
  };
}
