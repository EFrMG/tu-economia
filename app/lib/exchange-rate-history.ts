export const CHART_PERIODS = [7, 30, 90] as const;

export type ChartPeriod = (typeof CHART_PERIODS)[number];

export interface HistoricalRatePoint {
  fecha: string;
  venta: number;
}

export interface HistoricalChartPoint {
  fecha: string;
  blue: number | null;
  oficial: number | null;
}

export interface HistoricalGapPoint {
  fecha: string;
  gap: number | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Drops malformed dates, resolves duplicate dates, and puts the upstream series in chronological order. */
export function normalizeHistory(points: HistoricalRatePoint[]) {
  const byDate = new Map<string, HistoricalRatePoint>();
  for (const point of points) {
    if (isCalendarDate(point.fecha)) byDate.set(point.fecha, point);
  }

  return [...byDate.values()].sort((left, right) =>
    left.fecha.localeCompare(right.fecha),
  );
}

/** Includes the selected Argentine calendar day and the preceding `days - 1` calendar days. */
export function historyForCalendarDays<T extends { fecha: string }>(
  points: T[],
  days: number,
  today: string,
) {
  const cutoff = new Date(`${today}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return points.filter(
    (point) => point.fecha >= cutoffDate && point.fecha <= today,
  );
}

export function argentinaCalendarDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);
}

/** Merges the two series by calendar date, preserving missing observations as null. */
export function mergeHistoricalSeries(
  blue: HistoricalRatePoint[],
  oficial: HistoricalRatePoint[],
): HistoricalChartPoint[] {
  const dates = new Set([
    ...blue.map((point) => point.fecha),
    ...oficial.map((point) => point.fecha),
  ]);

  const blueByDate = new Map(blue.map((point) => [point.fecha, point.venta]));

  const oficialByDate = new Map(
    oficial.map((point) => [point.fecha, point.venta]),
  );

  return [...dates].sort().map((fecha) => ({
    fecha,
    blue: blueByDate.get(fecha) ?? null,
    oficial: oficialByDate.get(fecha) ?? null,
  }));
}

/** Compare only closes published for the same date; never carry a quote forward. */
export function historicalGap(
  points: HistoricalChartPoint[],
): HistoricalGapPoint[] {
  return points.map(({ fecha, blue, oficial }) => ({
    fecha,
    gap:
      blue !== null && oficial !== null && oficial > 0
        ? ((blue - oficial) / oficial) * 100
        : null,
  }));
}

export function gapPeriodChange(points: HistoricalGapPoint[]) {
  const available = points.filter(
    (point): point is HistoricalGapPoint & { gap: number } =>
      point.gap !== null,
  );

  const first = available[0];
  const last = available.at(-1);
  return first && last
    ? {
        first,
        last,
        change: available.length > 1 ? last.gap - first.gap : null,
      }
    : null;
}

export type HistoricalChartView = "quotes" | "gap";

/** `?view=` on `/dolar`; anything but `gap` shows the quotes. */
export const chartViewFromSearchParam = (
  value: string | null,
): HistoricalChartView => (value === "gap" ? "gap" : "quotes");

export function chartPeriodFromSearchParam(value: string | null): ChartPeriod {
  const parsed = Number(value);
  return CHART_PERIODS.includes(parsed as ChartPeriod)
    ? (parsed as ChartPeriod)
    : 30;
}
