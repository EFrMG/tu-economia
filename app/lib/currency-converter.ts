export type ConversionDirection = "ars-to-usd" | "usd-to-ars";

export interface ConversionQuote {
  compra: number;
  venta: number;
}

/** ARS→USD uses the provider's selling price (`venta`); USD→ARS uses its buying price (`compra`). Invalid inputs return `null`. */
export function convertCurrency(
  amount: number,
  quote: ConversionQuote | undefined,
  direction: ConversionDirection,
) {
  if (!Number.isFinite(amount) || amount < 0 || !quote) return null;

  const rate = direction === "ars-to-usd" ? quote.venta : quote.compra;
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const result = direction === "ars-to-usd" ? amount / rate : amount * rate;
  return Number.isFinite(result) ? result : null;
}
