import { z } from "zod";
import { createPromiseCache } from "~/lib/promise-cache.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import type { SourceHealth } from "~/lib/exchange-rates.server";
import {
  INDICATOR_DEFINITIONS,
  type IndicatorId,
  type IndicatorPoint,
  type IndicatorResult,
} from "~/lib/indicators";

const API_BASE = "https://api.argentinadatos.com/v1/finanzas";
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30 * 60_000;

const paths: Record<IndicatorId, string> = {
  "inflation-monthly": "/indices/inflacion",
  "inflation-yearly": "/indices/inflacionInteranual",
  "deposits-30-days": "/tasas/depositos30Dias",
  uva: "/indices/uva",
  "country-risk": "/indices/riesgo-pais/ultimo",
};

const pointSchema = z.object({
  fecha: z
    .union([z.iso.date(), z.iso.datetime({ offset: true })])
    .transform((value) => value.slice(0, 10)),
  valor: z.number().finite(),
});

const seriesSchema = z.array(pointSchema);

const cache = createPromiseCache();

interface IndicatorHealthStats {
  successes: number;
  failures: number;
  lastSuccess: string | null;
  lastFailure: string | null;
}

const indicatorHealthStats: IndicatorHealthStats = {
  successes: 0,
  failures: 0,
  lastSuccess: null,
  lastFailure: null,
};

function recordIndicatorSuccess() {
  const now = new Date().toISOString();
  indicatorHealthStats.successes += 1;
  indicatorHealthStats.lastSuccess = now;
}

function recordIndicatorFailure() {
  const now = new Date().toISOString();
  indicatorHealthStats.failures += 1;
  indicatorHealthStats.lastFailure = now;
}

export function getIndicatorSourceHealth(): SourceHealth {
  const { successes, failures, lastSuccess, lastFailure } =
    indicatorHealthStats;
  const status =
    successes === 0 && failures === 0
      ? "not-checked"
      : failures === 0
        ? "fetched"
        : successes === 0
          ? "failed"
          : "partial";

  return {
    status,
    lastSuccessfulFetchAt: lastSuccess,
    lastFailureAt: lastFailure,
  };
}

async function fetchSeries(id: IndicatorId) {
  try {
    const result = await withUpstreamTimeout(
      REQUEST_TIMEOUT_MS,
      async (signal) => {
        const response = await fetch(`${API_BASE}${paths[id]}`, {
          headers: { accept: "application/json" },
          signal,
        });

        if (!response.ok)
          throw new Error(`La serie ${id} respondió con ${response.status}.`);

        const payload: unknown = await response.json();

        const series =
          id === "country-risk"
            ? [pointSchema.parse(payload)]
            : seriesSchema.parse(payload);

        if (!series.length)
          throw new Error(`La serie ${id} no incluyó valores.`);

        const byDate = new Map(
          series.map((point) => [
            point.fecha,
            { date: point.fecha, value: point.valor },
          ]),
        );

        return [...byDate.values()].sort((left, right) =>
          left.date.localeCompare(right.date),
        );
      },
    );
    recordIndicatorSuccess();
    return result;
  } catch (error) {
    recordIndicatorFailure();
    throw error;
  }
}
function loadSeries(id: IndicatorId) {
  return cache.get(id, CACHE_TTL_MS, () => fetchSeries(id));
}

/** Shares the validated inflation response used by the latest-value card. */
export function getMonthlyInflationHistory(): Promise<IndicatorPoint[]> {
  return loadSeries("inflation-monthly");
}

export function getDepositRateHistory(): Promise<IndicatorPoint[]> {
  return loadSeries("deposits-30-days");
}

/** Independent series checks let a valid indicator render when another source fails. */
export async function getIndicators(): Promise<IndicatorResult[]> {
  return Promise.all(
    INDICATOR_DEFINITIONS.map(async ({ id }): Promise<IndicatorResult> => {
      try {
        return { id, point: (await loadSeries(id)).at(-1) ?? null };
      } catch {
        return { id, point: null };
      }
    }),
  );
}
