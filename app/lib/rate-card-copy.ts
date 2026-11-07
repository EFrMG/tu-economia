import { formatAmount, formatSignedChange } from "~/lib/format";

interface RateCardValues {
  compra: number;
  venta: number;
  changePct: number | null;
}

const dailyChange = (value: number | null) =>
  value === null ? "s/d" : formatSignedChange(value);

export function formatExchangeRateCardText(
  title: string,
  rate: RateCardValues,
  footnote: string,
) {
  return [
    title,
    `Compra: ARS ${formatAmount(rate.compra)}`,
    `Venta: ARS ${formatAmount(rate.venta)}`,
    `Variación diaria: ${dailyChange(rate.changePct)}`,
    footnote,
  ].join("\n");
}

export function formatHighlightRateCardText(
  title: string,
  rate: Pick<RateCardValues, "venta" | "changePct">,
) {
  return [
    title,
    `Venta: ARS ${formatAmount(rate.venta)}`,
    `Variación diaria: ${dailyChange(rate.changePct)}`,
  ].join("\n");
}
