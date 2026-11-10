/**
 * The CEDEAR theoretical-price calculator: parsing, URL normalisation and arithmetic.
 * The visitor supplies the underlying's price, the conversion ratio and, optionally, the CEDEAR's market price; the application supplies only the CCL and MEP sale prices it already shows on the dashboard.
 * Every function answers `null` for incomplete or invalid input; nothing is filled in.
 */

/** The reference rates the calculator offers, with the Dólar API `casa` each one reads. */
export const REFERENCE_RATES = [
  { id: "ccl", casa: "contadoconliqui", label: "CCL" },
  { id: "mep", casa: "bolsa", label: "MEP" },
] as const;

export type ReferenceRateId = (typeof REFERENCE_RATES)[number]["id"];

export const DEFAULT_REFERENCE_RATE: ReferenceRateId = "ccl";

/** The calculator's own search parameters; no other Acciones panel accepts them. */
export const CALCULATOR_PARAMS = [
  "precio",
  "ratio",
  "referencia",
  "tc",
  "mercado",
] as const;

export type CalculatorParam = (typeof CALCULATOR_PARAMS)[number];

/** Upper bounds well above any plausible value, so a typo of several digits reads as invalid instead of producing a figure. */
export const CALCULATOR_LIMITS = {
  /** Underlying price, US$ per share. */
  precio: 1_000_000,
  /** Exchange rate, pesos per US$. */
  tc: 1_000_000,
  /** CEDEAR market price, pesos per CEDEAR. */
  mercado: 1_000_000_000,
  /** Each side of the ratio. */
  ratio: 100_000,
} as const;

const MAX_INTEGER_DIGITS = 10;
const MAX_FRACTION_DIGITS = 6;

const positive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * Reads a number as a visitor in Argentina types it: `1234,5`, `1.234,5`, `1.234.567` or `150.25`.
 * A comma is always the decimal separator. A single dot followed by exactly three digits (`1.500`) could be a thousands separator or a decimal point, so it is rejected as ambiguous unless the integer part is `0`.
 * Returns `null` for anything else, for zero and for negative values.
 */
export function parseDecimal(text: string): number | null {
  const value = text.trim();

  let integer: string;
  let fraction = "";

  if (/^\d+$/.test(value)) {
    integer = value;
  } else if (/^\d+,\d+$/.test(value)) {
    [integer, fraction] = value.split(",");
  } else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(value)) {
    const [whole, decimals] = value.split(",");
    integer = whole.replaceAll(".", "");
    fraction = decimals;
  } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(value)) {
    integer = value.replaceAll(".", "");
  } else if (/^\d+\.\d+$/.test(value)) {
    [integer, fraction] = value.split(".");

    if (fraction.length === 3 && Number(integer) !== 0) return null;
  } else {
    return null;
  }

  return fromDigits(integer, fraction);
}

/** A search-parameter number: the canonical dot-decimal form first, then the forms a visitor might type into the URL by hand. */
export function parseParamNumber(raw: string): number | null {
  const value = raw.trim();

  if (/^\d+(\.\d+)?$/.test(value)) {
    const [integer, fraction = ""] = value.split(".");

    return fromDigits(integer, fraction);
  }

  return parseDecimal(value);
}

function fromDigits(integer: string, fraction: string): number | null {
  const significant = integer.replace(/^0+(?=\d)/, "");

  if (
    significant.length > MAX_INTEGER_DIGITS ||
    fraction.length > MAX_FRACTION_DIGITS
  )
    return null;

  const number = Number(fraction ? `${integer}.${fraction}` : integer);

  return positive(number) ? number : null;
}

/** The URL form of a number: dot decimal, no grouping. Values parsed above have at most six decimals and ten integer digits, so no exponent appears. */
export function formatParamNumber(value: number): string {
  return String(value);
}

/** The field form of a number: decimal comma, no grouping, so it parses back to the same value. */
export function formatInputNumber(value: number): string {
  return String(value).replace(".", ",");
}

export interface ConversionRatio {
  /** CEDEARs on the left of `20:1`. */
  cedears: number;
  /** Underlying shares on the right of `20:1`; 1 when the visitor types a single number. */
  shares: number;
  /** CEDEARs per underlying share: `cedears ÷ shares`. */
  value: number;
}

/** `20`, `20:1` and `1:2` (one CEDEAR per two shares), with either side in the field or URL number forms. */
function parseRatioWith(
  text: string,
  parse: (part: string) => number | null,
): ConversionRatio | null {
  const parts = text.trim().split(":");
  if (parts.length > 2) return null;

  const cedears = parse(parts[0]);
  const shares = parts.length === 2 ? parse(parts[1]) : 1;

  if (cedears === null || shares === null) return null;

  if (cedears > CALCULATOR_LIMITS.ratio || shares > CALCULATOR_LIMITS.ratio)
    return null;

  const value = cedears / shares;

  return positive(value) ? { cedears, shares, value } : null;
}

/** The ratio as the visitor types it. */
export const parseRatio = (text: string) => parseRatioWith(text, parseDecimal);

/** The ratio as the URL carries it. */
export const parseRatioParam = (raw: string) =>
  parseRatioWith(raw, parseParamNumber);

/** `20` for 20:1, `1:2` otherwise; the URL form. */
export function formatRatioParam({ cedears, shares }: ConversionRatio) {
  return shares === 1
    ? formatParamNumber(cedears)
    : `${formatParamNumber(cedears)}:${formatParamNumber(shares)}`;
}

/** `20` for 20:1, `1:2` otherwise, with a decimal comma; the field form. */
export function formatRatioInput({ cedears, shares }: ConversionRatio) {
  return shares === 1
    ? formatInputNumber(cedears)
    : `${formatInputNumber(cedears)}:${formatInputNumber(shares)}`;
}

type AmountParam = Exclude<CalculatorParam, "ratio" | "referencia">;

/** A field amount within its bound, or `null`. */
export function parseAmount(param: AmountParam, text: string): number | null {
  const value = parseDecimal(text);

  return value !== null && value <= CALCULATOR_LIMITS[param] ? value : null;
}

/** The canonical URL value for what a field holds, or `null` when it is empty or invalid (the parameter is then removed). */
export function fieldParamValue(
  param: Exclude<CalculatorParam, "referencia">,
  text: string,
): string | null {
  if (param === "ratio") {
    const ratio = parseRatio(text);

    return ratio ? formatRatioParam(ratio) : null;
  }

  const value = parseAmount(param, text);

  return value === null ? null : formatParamNumber(value);
}

/** The field text for a canonical URL value; empty when the parameter is absent. */
export function fieldTextFromParam(
  param: Exclude<CalculatorParam, "referencia">,
  raw: string | null,
): string {
  if (raw === null) return "";

  if (param === "ratio") {
    const ratio = parseRatioParam(raw);

    return ratio ? formatRatioInput(ratio) : "";
  }

  const value = parseParamNumber(raw);

  return value !== null && value <= CALCULATOR_LIMITS[param]
    ? formatInputNumber(value)
    : "";
}

export function isReferenceRateId(
  value: string | null,
): value is ReferenceRateId {
  return REFERENCE_RATES.some((rate) => rate.id === value);
}

/** The reference rate a URL asks for; `ccl` when it is missing or unknown. */
export function referenceRateFromParam(raw: string | null): ReferenceRateId {
  const value = raw?.trim().toLowerCase() ?? null;

  return isReferenceRateId(value) ? value : DEFAULT_REFERENCE_RATE;
}

/** The canonical value of one calculator parameter, or `null` to remove it. The default reference (`ccl`) is omitted. */
export function canonicalCalculatorParam(
  param: CalculatorParam,
  raw: string,
): string | null {
  if (param === "referencia") {
    const reference = referenceRateFromParam(raw);

    return reference === DEFAULT_REFERENCE_RATE ? null : reference;
  }

  if (param === "ratio") {
    const ratio = parseRatioParam(raw);

    return ratio ? formatRatioParam(ratio) : null;
  }

  const value = parseParamNumber(raw);

  return value !== null && value <= CALCULATOR_LIMITS[param]
    ? formatParamNumber(value)
    : null;
}

/**
 * The search parameters with the calculator's own normalised: invalid or out-of-range values and the default reference are removed, numbers take their canonical form, and repeated parameters collapse to the first.
 * Returns `null` when nothing changes, so the loader redirects only when it must.
 */
export function normaliseCalculatorParams(
  params: URLSearchParams,
): URLSearchParams | null {
  const next = new URLSearchParams(params);
  let changed = false;

  for (const param of CALCULATOR_PARAMS) {
    const values = params.getAll(param);
    if (!values.length) continue;

    const canonical = canonicalCalculatorParam(param, values[0]);

    if (canonical === null) next.delete(param);
    else next.set(param, canonical);

    if (values.length > 1 || canonical !== values[0]) changed = true;
  }

  return changed ? next : null;
}

/** Whether any calculator parameter is present; other panels redirect without them. */
export const hasCalculatorParams = (params: URLSearchParams) =>
  CALCULATOR_PARAMS.some((param) => params.has(param));

export interface CedearInputs {
  /** Underlying price in US$ per share. */
  underlying: number | null;
  /** CEDEARs per underlying share. */
  ratio: number | null;
  /** Pesos per US$. */
  rate: number | null;
  /** CEDEAR market price in pesos, when the visitor typed one. */
  market: number | null;
}

export interface CedearCalculation {
  /** Pesos per CEDEAR: underlying × rate ÷ ratio. */
  theoretical: number | null;
  /** Pesos per US$ implied by the market price: market × ratio ÷ underlying. */
  impliedRate: number | null;
  /** Implied rate against the reference rate, in percent. */
  rateGapPct: number | null;
  /** Market price minus theoretical price, in pesos; positive is a premium. */
  premium: number | null;
  /** Market price against the theoretical price, in percent. By construction it equals `rateGapPct`. */
  premiumPct: number | null;
}

const valid = (value: number | null): value is number =>
  value !== null && positive(value);

const finiteOrNull = (value: number) => (Number.isFinite(value) ? value : null);

/** theoretical = underlying × rate ÷ ratio; with a market price, the implied rate and the market price's premium or discount. */
export function calculateCedear({
  underlying,
  ratio,
  rate,
  market,
}: CedearInputs): CedearCalculation {
  const theoretical =
    valid(underlying) && valid(rate) && valid(ratio)
      ? finiteOrNull((underlying * rate) / ratio)
      : null;

  const impliedRate =
    valid(underlying) && valid(ratio) && valid(market)
      ? finiteOrNull((market * ratio) / underlying)
      : null;

  const rateGapPct =
    impliedRate !== null && valid(rate)
      ? finiteOrNull((impliedRate / rate - 1) * 100)
      : null;

  const premium =
    theoretical !== null && valid(market)
      ? finiteOrNull(market - theoretical)
      : null;

  const premiumPct =
    theoretical !== null && valid(market) && theoretical > 0
      ? finiteOrNull((market / theoretical - 1) * 100)
      : null;

  return { theoretical, impliedRate, rateGapPct, premium, premiumPct };
}

export interface ReferenceQuote {
  id: ReferenceRateId;
  /** Dólar API sale price, pesos per US$. */
  venta: number;
  /** The provider's quote time in Argentine time, when it sent one. */
  updatedAt: string | null;
}

/** The reference rates the loader streams: the live CCL and MEP sale prices, or nothing. */
export type ReferenceRates =
  | {
      status: "available";
      quotes: ReferenceQuote[];
      /** The live request failed and a recent snapshot is shown. */
      stale: boolean;
      /** When this server last received the rates, in Argentine time. */
      fetchedAtLabel: string;
    }
  | { status: "unavailable" };

export const UNAVAILABLE_REFERENCE_RATES: ReferenceRates = {
  status: "unavailable",
};

interface LiveRatesInput {
  rates: { casa: string; venta: number; updatedAt: string | null }[];
  freshness: {
    status: "current" | "stale";
    lastSuccessfulFetchAtLabel: string;
  };
}

/** Picks the CCL and MEP sale prices from the live rates; a missing or unusable one is left out, never replaced. */
export function referenceRatesFrom(live: LiveRatesInput): ReferenceRates {
  const quotes = REFERENCE_RATES.flatMap(({ id, casa }) => {
    const quote = live.rates.find((rate) => rate.casa === casa);

    return quote && positive(quote.venta) && quote.venta <= CALCULATOR_LIMITS.tc
      ? [{ id, venta: quote.venta, updatedAt: quote.updatedAt }]
      : [];
  });

  return quotes.length
    ? {
        status: "available",
        quotes,
        stale: live.freshness.status === "stale",
        fetchedAtLabel: live.freshness.lastSuccessfulFetchAtLabel,
      }
    : UNAVAILABLE_REFERENCE_RATES;
}

export function referenceQuote(
  rates: ReferenceRates | null,
  id: ReferenceRateId,
): ReferenceQuote | null {
  return rates?.status === "available"
    ? (rates.quotes.find((quote) => quote.id === id) ?? null)
    : null;
}

/** Whether the page should retry in the background: the rates are unavailable, stale or missing one of the two. */
export function referenceRatesNeedRetry(rates: ReferenceRates): boolean {
  if (rates.status === "unavailable") return true;

  return rates.stale || rates.quotes.length < REFERENCE_RATES.length;
}

export const referenceRateLabel = (id: ReferenceRateId) =>
  REFERENCE_RATES.find((rate) => rate.id === id)!.label;
