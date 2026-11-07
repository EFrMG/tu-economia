const decimal = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Currency amount without symbol, e.g. `1.250,00`. */
export function formatAmount(value: number) {
  return decimal.format(value);
}

/** Magnitude of a variation, e.g. `0,05%`. Direction is conveyed by an icon. */
export function formatChange(value: number) {
  return `${decimal.format(Math.abs(value))}%`;
}

/** Signed variation, e.g. `+1,23%`. */
export function formatSignedChange(value: number) {
  return `${value >= 0 ? "+" : "-"}${decimal.format(Math.abs(value))}%`;
}

/** Gap between two rates, e.g. `36,3%`. */
export function formatGap(value: number) {
  return `${percent.format(value)}%`;
}

export type Trend = "up" | "down" | "flat";

export function trendOf(value: number | null): Trend {
  if (value === null || value === 0) return "flat";

  return value > 0 ? "up" : "down";
}
