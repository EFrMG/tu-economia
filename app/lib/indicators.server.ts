import { z } from "zod";
import {
  loadRows,
  snapshotHealth,
  type SnapshotEnv,
  type SnapshotSource,
} from "~/lib/source-snapshots.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import type { SourceHealth } from "~/lib/exchange-rates.server";
import {
  INDICATOR_DEFINITIONS,
  type IndicatorPoint,
  type IndicatorResult,
} from "~/lib/indicators";

const BCRA_BASE = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";

const COUNTRY_RISK_URL =
  "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo";

/** The catalogue category that holds every BCRA series the cards show; filtering by it keeps the latest values to one request. */
const BCRA_CATEGORY = "Principales Variables";

const REQUEST_TIMEOUT_MS = 8_000;

/** The largest page the BCRA serves; a larger `limit` answers 400. */
const BCRA_PAGE_SIZE = 3_000;

/** Bounds a history's subrequests: the deposit rate since 2000 needs three pages. */
const BCRA_MAX_PAGES = 4;

const INFLATION_VARIABLE = 27;
const DEPOSITS_VARIABLE = 12;

/** The deposit-vs-inflation comparison covers the months since 2000; the BCRA series starts in 1985. */
const DEPOSIT_HISTORY_FROM = "2000-01-01";

const isoDate = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => value.slice(0, 10));

const pointSchema = z.object({ fecha: isoDate, valor: z.number().finite() });

const catalogueSchema = z.object({ results: z.array(z.unknown()) });

const catalogueRowSchema = z.object({
  idVariable: z.number().int(),
  ultFechaInformada: isoDate,
  ultValorInformado: z.number().finite(),
});

/** A catalogue row: the latest value the BCRA reported for one series. */
interface LatestValue extends IndicatorPoint {
  variable: number;
}

const seriesPageSchema = z.object({
  metadata: z.object({
    resultset: z.object({ count: z.number().int().nonnegative() }),
  }),
  results: z.array(
    z.object({ idVariable: z.number().int(), detalle: z.array(pointSchema) }),
  ),
});

export function getIndicatorSourceHealth(): {
  bcra: SourceHealth;
  countryRisk: SourceHealth;
} {
  return {
    bcra: snapshotHealth("bcra:"),
    countryRisk: snapshotHealth("country-risk@"),
  };
}

/** One GET whose payload `parse` validates. */
function fetchParsed<T>(
  url: string,
  label: string,
  parse: (payload: unknown) => T,
): Promise<T> {
  return withUpstreamTimeout(REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });

    if (!response.ok)
      throw new Error(`${label} respondió con ${response.status}.`);

    return parse(await response.json());
  });
}

/** Repeated dates collapse to one point and the series is returned oldest first. */
function normalizePoints(
  points: { fecha: string; valor: number }[],
): IndicatorPoint[] {
  const byDate = new Map(
    points.map((point) => [
      point.fecha,
      { date: point.fecha, value: point.valor },
    ]),
  );

  return [...byDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

/**
 * Reads the catalogue's latest value per series. A malformed row only drops its own series,
 * so one invalid series leaves the other cards visible.
 */
async function fetchLatestValues(): Promise<LatestValue[]> {
  const params = new URLSearchParams({
    categoria: BCRA_CATEGORY,
    limit: String(BCRA_PAGE_SIZE),
  });

  const label = "El catálogo del BCRA";

  return fetchParsed(`${BCRA_BASE}?${params}`, label, (payload) => {
    const latest = new Map<number, LatestValue>();

    for (const row of catalogueSchema.parse(payload).results) {
      const parsed = catalogueRowSchema.safeParse(row);
      if (!parsed.success) continue;

      latest.set(parsed.data.idVariable, {
        variable: parsed.data.idVariable,
        date: parsed.data.ultFechaInformada,
        value: parsed.data.ultValorInformado,
      });
    }

    if (!latest.size) throw new Error(`${label} no incluyó valores.`);

    return [...latest.values()];
  });
}

async function fetchSeriesPage(
  variable: number,
  offset: number,
  from?: string,
) {
  const params = new URLSearchParams({
    limit: String(BCRA_PAGE_SIZE),
    offset: String(offset),
  });

  if (from) params.set("desde", from);

  const label = `La serie ${variable} del BCRA`;

  return fetchParsed(`${BCRA_BASE}/${variable}?${params}`, label, (payload) => {
    const page = seriesPageSchema.parse(payload);

    const series = page.results.find(
      (result) => result.idVariable === variable,
    );

    if (!series) throw new Error(`${label} no incluyó la variable pedida.`);

    return { count: page.metadata.resultset.count, points: series.detalle };
  });
}

/** Reads the first page, then the remaining pages in parallel; a series longer than the page budget fails rather than truncating. */
async function fetchSeriesHistory(
  variable: number,
  from?: string,
): Promise<IndicatorPoint[]> {
  const first = await fetchSeriesPage(variable, 0, from);
  const pages = Math.ceil(first.count / BCRA_PAGE_SIZE);

  if (pages > BCRA_MAX_PAGES)
    throw new Error(
      `La serie ${variable} del BCRA requiere ${pages} páginas; el máximo es ${BCRA_MAX_PAGES}.`,
    );

  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      fetchSeriesPage(variable, (index + 1) * BCRA_PAGE_SIZE, from),
    ),
  );

  const points = normalizePoints(
    [first, ...rest].flatMap((page) => page.points),
  );

  if (!points.length)
    throw new Error(`La serie ${variable} del BCRA no incluyó valores.`);

  return points;
}

async function fetchCountryRisk(): Promise<IndicatorPoint> {
  return fetchParsed(COUNTRY_RISK_URL, "El riesgo país", (payload) => {
    const point = pointSchema.parse(payload);

    return { date: point.fecha, value: point.valor };
  });
}

const storedPointSchema = z.object({
  date: z.iso.date(),
  value: z.number().finite(),
});

/** The BCRA catalogue's latest value per series, refreshed by the daily cron like every source here; see `SCHEDULED_SOURCES`. */
export const BCRA_LATEST_SOURCE: SnapshotSource<LatestValue> = {
  key: "bcra:latest@1",
  schema: storedPointSchema.extend({ variable: z.number().int() }),
  fetchRows: fetchLatestValues,
};

export const INFLATION_HISTORY_SOURCE: SnapshotSource<IndicatorPoint> = {
  key: `bcra:history:${INFLATION_VARIABLE}@1`,
  schema: storedPointSchema,
  fetchRows: () => fetchSeriesHistory(INFLATION_VARIABLE),
};

export const DEPOSIT_HISTORY_SOURCE: SnapshotSource<IndicatorPoint> = {
  key: `bcra:history:${DEPOSITS_VARIABLE}@1`,
  schema: storedPointSchema,
  fetchRows: () => fetchSeriesHistory(DEPOSITS_VARIABLE, DEPOSIT_HISTORY_FROM),
};

export const COUNTRY_RISK_SOURCE: SnapshotSource<IndicatorPoint> = {
  key: "country-risk@1",
  schema: storedPointSchema,
  fetchRows: async () => [await fetchCountryRisk()],
};

/** Shares the validated inflation history between the purchasing-power and deposit calculators and the inflation resource. */
export const getMonthlyInflationHistory = (env: SnapshotEnv) =>
  loadRows(INFLATION_HISTORY_SOURCE, env);

export const getDepositRateHistory = (env: SnapshotEnv) =>
  loadRows(DEPOSIT_HISTORY_SOURCE, env);

/** The BCRA catalogue and the country-risk series fail independently, and a missing BCRA row only blanks its own card. */
export async function getIndicators(
  env: SnapshotEnv,
): Promise<IndicatorResult[]> {
  const [latest, countryRisk] = await Promise.all([
    loadRows(BCRA_LATEST_SOURCE, env).catch(() => []),
    loadRows(COUNTRY_RISK_SOURCE, env).catch(() => []),
  ]);

  const point = (variable: number | null): IndicatorPoint | null => {
    if (variable === null) return countryRisk[0] ?? null;

    const row = latest.find((value) => value.variable === variable);

    return row ? { date: row.date, value: row.value } : null;
  };

  return INDICATOR_DEFINITIONS.map(({ id, bcraVariable }) => ({
    id,
    point: point(bcraVariable),
  }));
}
