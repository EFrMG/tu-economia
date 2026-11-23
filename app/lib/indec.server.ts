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
import {
  POVERTY_AREA,
  POVERTY_SERVICE,
  type PovertyData,
  type PovertyPoint,
} from "~/lib/poverty";

const REQUEST_TIMEOUT_MS = 8_000;

/** Bump when a service's `select` or schema changes, so an old copy is never read with the new shape. */
const SNAPSHOT_VERSION = 1;

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

const KEY_PREFIX = "indec:";

/** One row for the four services, from their saved copies. */
export const getIndecSourceHealth = (): SourceHealth =>
  snapshotHealth(KEY_PREFIX);

/** `YYYYMM` of the month `months` before `now`, in UTC. */
export function periodBefore(now: Date, months: number): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1),
  );

  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const toIsoMonth = (period: string) =>
  `${period.slice(0, 4)}-${period.slice(4, 6)}-01`;

/** One request to a service. A malformed row is dropped on its own, so it only blanks the figure it would have filled. */
async function fetchServiceRows<Row>(
  service: string,
  schema: z.ZodType<Row>,
  params: Record<string, string>,
  token: string | undefined,
): Promise<Row[]> {
  if (!token) throw new Error("Falta el token del INDEC (INDEC_API_TOKEN).");

  const query = new URLSearchParams({ ...params, limit: String(PAGE_LIMIT) });

  const rows = await withUpstreamTimeout(REQUEST_TIMEOUT_MS, async (signal) => {
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
  });

  if (rows.length >= PAGE_LIMIT)
    throw new Error(
      `El servicio ${service} del INDEC alcanzó el límite de ${PAGE_LIMIT} filas.`,
    );

  const parsed = rows.flatMap((row) => {
    const result = schema.safeParse(row);

    return result.success ? [result.data] : [];
  });

  if (!parsed.length)
    throw new Error(`El servicio ${service} del INDEC no incluyó valores.`);

  return parsed;
}

/** One saved copy per service, refreshed by the daily cron; see `SCHEDULED_SOURCES`. */
const indecSource = <Row>(
  service: string,
  schema: z.ZodType<Row>,
  params: (now: Date) => Record<string, string>,
): SnapshotSource<Row> => ({
  key: `${KEY_PREFIX}${service}@${SNAPSHOT_VERSION}`,
  schema,
  fetchRows: (env, now) =>
    fetchServiceRows(service, schema, params(now), env.INDEC_API_TOKEN),
});

/** The monthly services, read from `WINDOW_MONTHS` back. */
const monthlySource = (service: string, params: Record<string, string>) =>
  indecSource(service, rowSchema, (now) => ({
    ...params,
    periodo: `gte.${periodBefore(now, WINDOW_MONTHS)}`,
  }));

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

const BASKETS_SOURCE = monthlySource(BASKETS_SERVICE, {
  select: "codigo,tipo_de_indicador,periodo,valor",
});

const WAGES_SOURCE = monthlySource(WAGES_SERVICE, {
  select: "codigo,tipo_de_indicador,periodo,valor",
  codigo: `in.(${WAGE_SECTORS.map(({ code }) => code).join(",")})`,
  tipo_de_indicador: "in.(v_m,v_ia)",
});

/** National divisions and categories, and the general level of every region. */
const PRICES_SOURCE = monthlySource(PRICES_SERVICE, {
  select: "nivel,codigo,descripcion,region,tipo_de_indicador,periodo,valor",
  tipo_de_indicador: "in.(v_m,v_ia)",
  or: "(region.eq.Nacional,nivel.eq.Nivel General)",
});

/** A percentage, or `null` when INDEC replaced it with a conventional sign. */
const povertyRate = z.number().finite().min(0).max(100).nullable();

const povertyRowSchema = z.object({
  /** `YYYY1S` or `YYYY2S`. */
  periodo: z.string().regex(/^\d{4}[12]S$/),
  tasa_pobreza_personas: povertyRate,
  tasa_pobreza_hogares: povertyRate,
  tasa_indigencia_personas: povertyRate,
  tasa_indigencia_hogares: povertyRate,
  observaciones: z.string().nullable().optional(),
});

export type PovertyRow = z.infer<typeof povertyRowSchema>;

const PROVISIONAL_NOTE = /^dato provisorio\.?$/i;

/** One point per semester, oldest first; a repeated semester keeps its first row. */
export function buildPoverty(rows: PovertyRow[]): PovertyData | null {
  const bySemester = new Map<string, PovertyRow>();

  for (const row of rows)
    if (!bySemester.has(row.periodo)) bySemester.set(row.periodo, row);

  const points = [...bySemester.values()]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((row): PovertyPoint => {
      const note = row.observaciones?.trim() || null;
      const provisional = note !== null && PROVISIONAL_NOTE.test(note);

      return {
        period: `${row.periodo.slice(0, 4)}-S${row.periodo.slice(4, 5)}`,
        personas: {
          poverty: row.tasa_pobreza_personas,
          indigence: row.tasa_indigencia_personas,
        },
        hogares: {
          poverty: row.tasa_pobreza_hogares,
          indigence: row.tasa_indigencia_hogares,
        },
        note: provisional ? null : note,
        provisional,
      };
    });

  return points.length ? { points } : null;
}

/** The whole series: about two rows a year since the second semester of 2016, far from the page limit. */
const POVERTY_SOURCE = indecSource(POVERTY_SERVICE, povertyRowSchema, () => ({
  select:
    "periodo,tasa_pobreza_personas,tasa_pobreza_hogares,tasa_indigencia_personas,tasa_indigencia_hogares,observaciones",
  area_geografica_nom: `eq.${POVERTY_AREA}`,
  order: "periodo.asc",
}));

/** The four services, for the cron's refresh. */
export const INDEC_SOURCES: readonly SnapshotSource<unknown>[] = [
  BASKETS_SOURCE,
  WAGES_SOURCE,
  PRICES_SOURCE,
  POVERTY_SOURCE,
];

/** `null` when the service cannot be read; only `/precios` asks for it, so it stays out of `getIndecData`. */
export const getPovertyData = (env: SnapshotEnv, now = new Date()) =>
  loadRows(POVERTY_SOURCE, env, now).then(buildPoverty, () => null);

/** The three services fail independently; wages lose only their real change when the IPC cannot be read. */
export async function getIndecData(
  env: SnapshotEnv,
  now = new Date(),
): Promise<IndecData> {
  const [basketRows, wageRows, priceRows] = await Promise.all([
    loadRows(BASKETS_SOURCE, env, now).catch(() => null),
    loadRows(WAGES_SOURCE, env, now).catch(() => null),
    loadRows(PRICES_SOURCE, env, now).catch(() => null),
  ]);

  return {
    baskets: basketRows && buildBaskets(basketRows),
    wages: wageRows && buildWages(wageRows, priceRows ?? []),
    prices: priceRows && buildPrices(priceRows),
  };
}
