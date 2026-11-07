export const INDICATOR_DEFINITIONS = [
  {
    id: "inflation-monthly",
    title: "Inflación mensual",
    description:
      "Variación del índice de precios al consumidor respecto del mes anterior.",
    cadence: "Mensual",
    period: "month",
    unit: "percent",
    sourceName: "BCRA vía ArgentinaDatos",
    sourceUrl:
      "https://argentinadatos.com/docs/operations/get-finanzas-indices-inflacion",
  },
  {
    id: "inflation-yearly",
    title: "Inflación interanual",
    description:
      "Variación del índice de precios al consumidor frente al mismo mes del año anterior.",
    cadence: "Mensual",
    period: "month",
    unit: "percent",
    sourceName: "BCRA vía ArgentinaDatos",
    sourceUrl:
      "https://argentinadatos.com/docs/operations/get-finanzas-indices-inflacion-interanual",
  },
  {
    id: "deposits-30-days",
    title: "Depósitos a 30 días",
    description:
      "Tasa nominal anual de depósitos a 30 días. No representa una tasa de política monetaria.",
    cadence: "Diaria, en días con publicación",
    period: "day",
    unit: "percent",
    sourceName: "BCRA vía ArgentinaDatos",
    sourceUrl:
      "https://argentinadatos.com/docs/operations/get-finanzas-tasas-depositos-30-dias",
  },
  {
    id: "uva",
    title: "Valor UVA",
    description:
      "Valor en pesos de una Unidad de Valor Adquisitivo, actualizada según el CER.",
    cadence: "Diaria",
    period: "day",
    unit: "ars",
    sourceName: "BCRA vía ArgentinaDatos",
    sourceUrl:
      "https://argentinadatos.com/docs/operations/get-finanzas-indices-uva",
  },
  {
    id: "country-risk",
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
] as const;

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
