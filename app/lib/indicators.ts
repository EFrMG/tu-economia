const BCRA_SERIES_URL = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";
const BUSINESS_DAYS = "Diaria, en días con publicación";

export const INDICATOR_GROUPS = [
  { id: "prices", title: "Precios" },
  { id: "rates", title: "Tasas de interés" },
  { id: "external", title: "Dólar y sector externo" },
  { id: "money", title: "Dinero" },
  { id: "units", title: "Unidades de actualización" },
] as const;

export type IndicatorGroupId = (typeof INDICATOR_GROUPS)[number]["id"];

interface IndicatorDefinitionShape {
  id: string;
  group: IndicatorGroupId;
  bcraVariable: number | null;
  title: string;
  description: string;
  cadence: string;
  period: "month" | "day";
  unit: string;
  sourceName: string;
  sourceUrl: string;
}

/**
 * `bcraVariable` is the series' `idVariable` in BCRA Estadísticas Monetarias v4.0; series without one are read elsewhere.
 * Units follow the series' own `unidadExpresion`; values are never rescaled.
 */
export const INDICATOR_DEFINITIONS = [
  {
    id: "inflation-monthly",
    group: "prices",
    bcraVariable: 27,
    title: "Inflación mensual",
    description:
      "Variación del índice de precios al consumidor respecto del mes anterior.",
    cadence: "Mensual",
    period: "month",
    unit: "percent",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/27`,
  },
  {
    id: "inflation-yearly",
    group: "prices",
    bcraVariable: 28,
    title: "Inflación interanual",
    description:
      "Variación del índice de precios al consumidor frente al mismo mes del año anterior.",
    cadence: "Mensual",
    period: "month",
    unit: "percent",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/28`,
  },
  {
    id: "inflation-expected",
    group: "prices",
    bcraVariable: 29,
    title: "Inflación esperada a 12 meses",
    description:
      "Mediana de la inflación interanual esperada para los próximos 12 meses según el Relevamiento de Expectativas de Mercado (REM). El período es el mes del relevamiento.",
    cadence: "Mensual",
    period: "month",
    unit: "percent",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/29`,
  },
  {
    id: "deposits-30-days",
    group: "rates",
    bcraVariable: 12,
    title: "Depósitos a 30 días",
    description:
      "Tasa nominal anual de depósitos a 30 días. No representa una tasa de política monetaria.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "percent",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/12`,
  },
  {
    id: "badlar",
    group: "rates",
    bcraVariable: 7,
    title: "BADLAR de bancos privados",
    description:
      "Tasa nominal anual de depósitos a plazo fijo de grandes montos, de 30 a 35 días, en bancos privados.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "percent",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/7`,
  },
  {
    id: "tamar",
    group: "rates",
    bcraVariable: 44,
    title: "TAMAR de bancos privados",
    description:
      "Tasa nominal anual de depósitos a plazo fijo mayoristas, de 30 a 35 días, en bancos privados.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "percent",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/44`,
  },
  {
    id: "personal-loans",
    group: "rates",
    bcraVariable: 14,
    title: "Préstamos personales",
    description:
      "Tasa nominal anual promedio de los préstamos personales otorgados por las entidades financieras.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "percent",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/14`,
  },
  {
    id: "reserves",
    group: "external",
    bcraVariable: 1,
    title: "Reservas internacionales",
    description:
      "Saldo de las reservas internacionales brutas del BCRA, en millones de dólares.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "usd-millions",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/1`,
  },
  {
    id: "dollar-retail",
    group: "external",
    bcraVariable: 4,
    title: "Dólar minorista",
    description:
      "Promedio del tipo de cambio minorista vendedor, en pesos por dólar.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "ars",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/4`,
  },
  {
    id: "dollar-wholesale",
    group: "external",
    bcraVariable: 5,
    title: "Dólar mayorista de referencia",
    description:
      "Tipo de cambio mayorista de referencia de la Comunicación A 3500, en pesos por dólar.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "ars",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/5`,
  },
  {
    id: "country-risk",
    group: "external",
    bcraVariable: null,
    title: "Riesgo país",
    description:
      "EMBI+ Argentina: diferencial de rendimiento de bonos soberanos expresado en puntos básicos.",
    cadence: "Diaria, en ruedas de mercado",
    period: "day",
    unit: "basis-points",
    sourceName: "Ámbito vía ArgentinaDatos",
    sourceUrl:
      "https://argentinadatos.com/docs/operations/get-finanzas-indices-riesgo-pais-ultimo",
  },
  {
    id: "monetary-base",
    group: "money",
    bcraVariable: 15,
    title: "Base monetaria",
    description:
      "Circulación monetaria más los depósitos de las entidades financieras en cuenta corriente en el BCRA, en millones de pesos.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "ars-millions",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/15`,
  },
  {
    id: "private-m2-yearly",
    group: "money",
    bcraVariable: 25,
    title: "M2 privado, variación interanual",
    description:
      "Variación interanual del promedio móvil de 30 días del agregado monetario M2 privado.",
    cadence: BUSINESS_DAYS,
    period: "day",
    unit: "percent",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/25`,
  },
  {
    id: "uva",
    group: "units",
    bcraVariable: 31,
    title: "Valor UVA",
    description:
      "Valor en pesos de una Unidad de Valor Adquisitivo, actualizada según el CER.",
    cadence: "Diaria",
    period: "day",
    unit: "ars",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/31`,
  },
  {
    id: "uvi",
    group: "units",
    bcraVariable: 32,
    title: "Valor UVI",
    description:
      "Valor en pesos de una Unidad de Vivienda, actualizada según el índice del costo de la construcción.",
    cadence: "Diaria",
    period: "day",
    unit: "ars",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/32`,
  },
  {
    id: "cer",
    group: "units",
    bcraVariable: 30,
    title: "CER",
    description:
      "Coeficiente de Estabilización de Referencia (base 2/2/2002 = 1), que se actualiza según la inflación.",
    cadence: "Diaria",
    period: "day",
    unit: "index",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/30`,
  },
  {
    id: "icl",
    group: "units",
    bcraVariable: 40,
    title: "Índice para Contratos de Locación",
    description:
      "Índice (base 30/6/2020 = 1) para actualizar los alquileres de contratos celebrados bajo la Ley 27.551.",
    cadence: "Diaria",
    period: "day",
    unit: "index",
    sourceName: "BCRA",
    sourceUrl: `${BCRA_SERIES_URL}/40`,
  },
] as const satisfies readonly IndicatorDefinitionShape[];

export type IndicatorId = (typeof INDICATOR_DEFINITIONS)[number]["id"];
export type IndicatorUnit = (typeof INDICATOR_DEFINITIONS)[number]["unit"];
export type IndicatorDefinition = (typeof INDICATOR_DEFINITIONS)[number];

const decimal = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const pesos = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const points = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

const millions = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const index = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const month = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const day = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export function formatIndicatorValue(
  value: number,
  unit: IndicatorUnit,
): string {
  if (unit === "ars") return `$ ${pesos.format(value)}`;
  if (unit === "basis-points") return `${points.format(value)} pb`;
  if (unit === "usd-millions") return `US$ ${millions.format(value)} M`;
  if (unit === "ars-millions") return `$ ${millions.format(value)} M`;
  if (unit === "index") return index.format(value);

  return `${decimal.format(value)}%`;
}

export interface IndicatorPoint {
  date: string;
  /** Numeric value in the definition's unit, as reported by the upstream series. */
  value: number;
}

export function formatIndicatorPeriod(
  date: string,
  period: IndicatorDefinition["period"],
): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  return period === "month" ? month.format(value) : day.format(value);
}

export function formatIndicatorCardText(
  definition: IndicatorDefinition,
  point: IndicatorPoint,
): string {
  return [
    definition.title,
    `Valor: ${formatIndicatorValue(point.value, definition.unit)}`,
    `Período: ${formatIndicatorPeriod(point.date, definition.period)}`,
    `Fuente: ${definition.sourceName}`,
  ].join("\n");
}

export interface IndicatorResult {
  id: IndicatorId;
  point: IndicatorPoint | null;
}
