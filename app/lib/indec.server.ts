import { z } from "zod";
import { createPromiseCache } from "~/lib/promise-cache.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import type { SourceHealth } from "~/lib/exchange-rates.server";
import {
  BASKETS,
  BASKETS_SERVICE,
  INDEC_DATA_URL,
  PRICE_CATEGORY_CODES,
  PRICE_REGIONS,
  PRICES_SERVICE,
  WAGE_SECTORS,
  WAGES_SERVICE,
  realChange,
  type BasketsData,
  type ConsumerPricesData,
  type IndecData,
  type PriceRow,
  type WagesData,
} from "~/lib/indec";

const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60 * 60_000;

/** The API never answers more rows than this; a response that reaches it may be truncated, so it fails instead. */
const PAGE_LIMIT = 1_000;

/**
 * Months read back from the current one. Wages are published two to three months after the reference month, and the IPC of the wage month must be in the window for the real change.
 * Each month adds about 48 IPC rows, the largest response, so the window stays short.
 */
const WINDOW_MONTHS = 4;

const rowSchema = z.object({
  codigo: z.string(),
  descripcion: z.string().optional(),
  clasificador: z.string().optional(),
  nivel: z.string().optional(),
  region: z.string().nullable().optional(),
  tipo_de_indicador: z.string(),
  periodo: z.string().regex(/^\d{6}$/),
  /** `null` when the value carries a conventional sign instead (`valor_null`), such as `///`. */
  valor: z.number().finite().nullable(),
});

export type IndecRow = z.infer<typeof rowSchema>;

const cache = createPromiseCache();

const healthStats = {
  successes: 0,
  failures: 0,
  lastSuccess: null as string | null,
  lastFailure: null as string | null,
};

export function getIndecSourceHealth(): SourceHealth {
  const { successes, failures, lastSuccess, lastFailure } = healthStats;

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

/** `YYYYMM` of the month `months` before `now`, in UTC. */
export function periodBefore(now: Date, months: number): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1),
  );

  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const toIsoMonth = (period: string) =>
  `${period.slice(0, 4)}-${period.slice(4, 6)}-01`;

/** A malformed row is dropped on its own, so it only blanks the figure it would have filled. */
async function fetchRows(
  service: string,
  params: Record<string, string>,
  token: string | undefined,
): Promise<IndecRow[]> {
  try {
    if (!token) throw new Error("Falta el token del INDEC (INDEC_API_TOKEN).");

    const query = new URLSearchParams({
      ...params,
      periodo: `gte.${periodBefore(new Date(), WINDOW_MONTHS)}`,
      limit: String(PAGE_LIMIT),
    });

    const rows = await withUpstreamTimeout(
      REQUEST_TIMEOUT_MS,
      async (signal) => {
        const response = await fetch(`${INDEC_DATA_URL}${service}?${query}`, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
          },
          signal,
        });

        if (!response.ok)
          throw new Error(
            `El servicio ${service} del INDEC respondió con ${response.status}.`,
          );

        return z.array(z.unknown()).parse(await response.json());
      },
    );

    if (rows.length >= PAGE_LIMIT)
      throw new Error(
        `El servicio ${service} del INDEC alcanzó el límite de ${PAGE_LIMIT} filas.`,
      );

    const parsed = rows.flatMap((row) => {
      const result = rowSchema.safeParse(row);

      return result.success ? [result.data] : [];
    });

    if (!parsed.length)
      throw new Error(`El servicio ${service} del INDEC no incluyó valores.`);

    healthStats.successes += 1;
    healthStats.lastSuccess = new Date().toISOString();

    return parsed;
  } catch (error) {
    healthStats.failures += 1;
    healthStats.lastFailure = new Date().toISOString();
    throw error;
  }
}

const valueOf = (
  rows: IndecRow[],
  period: string,
  match: (row: IndecRow) => boolean,
) => rows.find((row) => row.periodo === period && match(row))?.valor ?? null;

/** The latest month that has `match`ing value, so a month published partway does not replace a complete one. */
const latestPeriod = (rows: IndecRow[], match: (row: IndecRow) => boolean) =>
  rows
    .filter((row) => row.valor !== null && match(row))
    .reduce<string | null>(
      (latest, row) =>
        latest === null || row.periodo > latest ? row.periodo : latest,
      null,
    );

export function buildBaskets(rows: IndecRow[]): BasketsData | null {
  const isAdultValue = (row: IndecRow) =>
    row.codigo === "CBT" && row.tipo_de_indicador === "CBT";

  const period = latestPeriod(rows, isAdultValue);
  if (period === null) return null;

  return {
    period: toIsoMonth(period),
    rows: BASKETS.map(({ id }) => ({
      id,
      perAdult: valueOf(
        rows,
        period,
        (row) => row.codigo === id && row.tipo_de_indicador === id,
      ),
      household: valueOf(rows, period, (row) => row.codigo === `${id} H2`),
      monthly: valueOf(
        rows,
        period,
        (row) => row.codigo === id && row.tipo_de_indicador === "v_m",
      ),
      yearly: valueOf(
        rows,
        period,
        (row) => row.codigo === id && row.tipo_de_indicador === "v_ia",
      ),
    })),
  };
}

const isNationalGeneral = (row: IndecRow) =>
  row.region === "Nacional" && row.nivel === "Nivel General";

/** The national IPC's yearly change for `period` (`YYYYMM`), read from the IPC rows. */
const yearlyInflation = (priceRows: IndecRow[], period: string) =>
  valueOf(
    priceRows,
    period,
    (row) => isNationalGeneral(row) && row.tipo_de_indicador === "v_ia",
  );

export function buildWages(
  rows: IndecRow[],
  priceRows: IndecRow[],
): WagesData | null {
  const period = latestPeriod(
    rows,
    (row) => row.codigo === "0" && row.tipo_de_indicador === "v_m",
  );

  if (period === null) return null;

  const inflationYearly = yearlyInflation(priceRows, period);

  return {
    period: toIsoMonth(period),
    inflationYearly,
    rows: WAGE_SECTORS.map(({ code, label }) => {
      const yearly = valueOf(
        rows,
        period,
        (row) => row.codigo === code && row.tipo_de_indicador === "v_ia",
      );

      return {
        code,
        label,
        monthly: valueOf(
          rows,
          period,
          (row) => row.codigo === code && row.tipo_de_indicador === "v_m",
        ),
        yearly,
        realYearly:
          yearly === null || inflationYearly === null
            ? null
            : realChange(yearly, inflationYearly),
      };
    }),
  };
}

export function buildPrices(rows: IndecRow[]): ConsumerPricesData | null {
  const period = latestPeriod(
    rows,
    (row) => isNationalGeneral(row) && row.tipo_de_indicador === "v_m",
  );

  if (period === null) return null;

  const current = rows.filter((row) => row.periodo === period);

  const priceRow = (
    code: string,
    label: string,
    match: (row: IndecRow) => boolean,
  ): PriceRow => ({
    code,
    label,
    monthly: valueOf(
      current,
      period,
      (row) => match(row) && row.tipo_de_indicador === "v_m",
    ),
    yearly: valueOf(
      current,
      period,
      (row) => match(row) && row.tipo_de_indicador === "v_ia",
    ),
  });

  const national = current.filter((row) => row.region === "Nacional");

  const labelOf = (nivel: string, code: string) =>
    national.find((row) => row.nivel === nivel && row.codigo === code)
      ?.descripcion ?? code;

  const divisionCodes = [
    ...new Set(
      national
        .filter((row) => row.nivel === "División")
        .map((row) => row.codigo),
    ),
  ].sort();

  return {
    period: toIsoMonth(period),
    general: priceRow("0", "Nivel general", isNationalGeneral),
    divisions: divisionCodes.map((code) =>
      priceRow(
        code,
        labelOf("División", code),
        (row) =>
          row.region === "Nacional" &&
          row.nivel === "División" &&
          row.codigo === code,
      ),
    ),
    categories: PRICE_CATEGORY_CODES.filter((code) =>
      national.some((row) => row.nivel === "Categoría" && row.codigo === code),
    ).map((code) =>
      priceRow(
        code,
        labelOf("Categoría", code),
        (row) =>
          row.region === "Nacional" &&
          row.nivel === "Categoría" &&
          row.codigo === code,
      ),
    ),
    regions: PRICE_REGIONS.map(({ id, label }) =>
      priceRow(
        id,
        label,
        (row) => row.region === id && row.nivel === "Nivel General",
      ),
    ),
  };
}

const loadBasketRows = (token: string | undefined) =>
  cache.get(`indec:${BASKETS_SERVICE}`, CACHE_TTL_MS, () =>
    fetchRows(
      BASKETS_SERVICE,
      { select: "codigo,tipo_de_indicador,periodo,valor" },
      token,
    ),
  );

const loadWageRows = (token: string | undefined) =>
  cache.get(`indec:${WAGES_SERVICE}`, CACHE_TTL_MS, () =>
    fetchRows(
      WAGES_SERVICE,
      {
        select: "codigo,tipo_de_indicador,periodo,valor",
        codigo: `in.(${WAGE_SECTORS.map(({ code }) => code).join(",")})`,
        tipo_de_indicador: "in.(v_m,v_ia)",
      },
      token,
    ),
  );

/** National divisions and categories, and the general level of every region. */
const loadPriceRows = (token: string | undefined) =>
  cache.get(`indec:${PRICES_SERVICE}`, CACHE_TTL_MS, () =>
    fetchRows(
      PRICES_SERVICE,
      {
        select:
          "nivel,codigo,descripcion,region,tipo_de_indicador,periodo,valor",
        tipo_de_indicador: "in.(v_m,v_ia)",
        or: "(region.eq.Nacional,nivel.eq.Nivel General)",
      },
      token,
    ),
  );

/** The three services fail independently; wages lose only their real change when the IPC cannot be read. */
export async function getIndecData(
  token: string | undefined,
): Promise<IndecData> {
  const [basketRows, wageRows, priceRows] = await Promise.all([
    loadBasketRows(token).catch(() => null),
    loadWageRows(token).catch(() => null),
    loadPriceRows(token).catch(() => null),
  ]);

  return {
    baskets: basketRows && buildBaskets(basketRows),
    wages: wageRows && buildWages(wageRows, priceRows ?? []),
    prices: priceRows && buildPrices(priceRows),
  };
}
