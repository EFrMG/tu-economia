/**
 * Client-safe half of the Acciones data layer: the shapes the page consumes, the static instrument table, and the pure calculations over BYMA records.
 * Percent values are percentage points (`1.5` means 1,5%), as `ExchangeRate.changePct` and `TrendIndicator` expect; BYMA sends fractions.
 */

/** Settlement currency of a species: pesos, MEP dollars (`D` suffix) or cable dollars (`C` suffix). */
export type EquityCurrency = "ARS" | "USD" | "EXT";

export const EQUITY_CURRENCIES = ["ARS", "USD", "EXT"] as const;

/** Implied exchange rate basis: `CCL` from the `EXT` species, `MEP` from the `USD` one. */
export type ImpliedRateBasis = "CCL" | "MEP";

export type EquitySector =
  | "Financiero"
  | "Energía"
  | "Servicios públicos"
  | "Materiales"
  | "Telecomunicaciones"
  | "Agropecuario"
  | "Inmobiliario"
  | "Industria"
  | "Holding";

/** The fields of a BYMA security record this module reads, after validation at the server boundary. */
export interface SecurityRecord {
  symbol: string;
  denominationCcy: EquityCurrency;
  /** `0`, `null` or absent when the species has not traded today. */
  trade?: number | null;
  previousClosingPrice?: number | null;
  volume?: number | null;
  volumeAmount?: number | null;
  numberOfOrders?: number | null;
  tradeHour?: string | null;
  bidPrice?: number | null;
  offerPrice?: number | null;
}

/** The fields of a BYMA index record this module reads. */
export interface IndexRecord {
  symbol: string;
  price: number;
  variation?: number | null;
  previousClosingPrice?: number | null;
  highValue?: number | null;
  minValue?: number | null;
  date?: string | null;
}

export interface EquityQuote {
  symbol: string;
  currency: EquityCurrency;
  /** Last traded price; `null` when the species has not traded today (BYMA sends `trade: 0`). */
  last: number | null;
  /** `null` when BYMA sends no positive previous close. */
  previousClose: number | null;
  /** Day change of `last` against `previousClose`, in percentage points; `null` when either is missing. */
  changePct: number | null;
  volume: number;
  /** Traded amount in the species' own currency. */
  tradedAmount: number;
  operations: number;
  /** Time of the last trade as BYMA sends it (`HH:MM` or `HH:MM:SS`, Buenos Aires time); `null` when untraded. */
  tradeTime: string | null;
  bid: number | null;
  ask: number | null;
}

export interface ImpliedRate {
  basis: ImpliedRateBasis;
  /** Pesos per dollar: peso last ÷ dollar-species last. */
  value: number;
}

/** `(1 + pesosPct) = (1 + dollarPct) × (1 + ratePct)`, each in percentage points against its previous close. */
export interface DayDecomposition {
  basis: ImpliedRateBasis;
  /** Change of the peso species. */
  pesosPct: number;
  /** Change of the dollar species, a proxy for the underlying's move (not the NYSE price). */
  dollarPct: number;
  /** Change of the implied exchange rate. */
  ratePct: number;
}

export interface CedearRow {
  /** Base (peso) symbol, e.g. `AAPL`. */
  symbol: string;
  name: string;
  kind: "cedear" | "etf";
  pesos: EquityQuote;
  /** The `D` species in MEP dollars, when it exists. */
  usd: EquityQuote | null;
  /** The `C` species in cable dollars, when it exists. */
  ext: EquityQuote | null;
  /** `null` when the peso species or both dollar species have not traded today. */
  impliedRate: ImpliedRate | null;
  /** `null` when the implied rate is unavailable or a previous close is missing. */
  decomposition: DayDecomposition | null;
  /** Peso traded amount, the ranking key. */
  tradedAmount: number;
}

export interface LeaderRow extends EquityQuote {
  name: string;
  sector: EquitySector | null;
}

export type MarketIndexSymbol = "M" | "G";

export interface MarketIndex {
  symbol: MarketIndexSymbol;
  name: string;
  value: number;
  /** Day change in percentage points; `null` when BYMA sends none. */
  changePct: number | null;
  previousClose: number | null;
  high: number | null;
  low: number | null;
  /** Session date as BYMA sends it (`YYYY-MM-DD`), when supplied. */
  date: string | null;
}

/** When the panel's data was received; `stale` means the last refresh failed and a snapshot of at most 15 minutes is shown. */
export interface EquityFreshness {
  status: "current" | "stale";
  /** ISO time at which this server received the data from BYMA. */
  fetchedAt: string;
  /** `fetchedAt` preformatted in Argentine time, e.g. `16/10/2026, 13:45`. */
  fetchedAtLabel: string;
}

/** Each panel resolves on its own; an unavailable panel carries no data and does not affect the others. */
export type EquityPanel<T> =
  | { status: "available"; data: T; freshness: EquityFreshness }
  | { status: "unavailable"; data: null; freshness: null };

export interface CedearPanelData {
  /** CEDEARs and CEDEAR ETFs, ranked by peso traded amount. */
  rows: CedearRow[];
  /** Latest trade time among the rows (`HH:MM` or `HH:MM:SS`), `null` when nothing traded. */
  latestTradeTime: string | null;
  /** Requests whose list could not be obtained; the rows come from the other one. */
  missingSources: ("cedears" | "etf")[];
}

export interface LeaderPanelData {
  /** S&P Merval leaders, ranked by traded amount. */
  rows: LeaderRow[];
  latestTradeTime: string | null;
}

interface InstrumentInfo {
  name: string;
  sector?: EquitySector;
}

/** S&P Merval leaders panel, plus a few names that rotate in and out of it. */
const LEADERS: Record<string, InstrumentInfo> = {
  ALUA: { name: "Aluar Aluminio Argentino", sector: "Materiales" },
  BBAR: { name: "BBVA Argentina", sector: "Financiero" },
  BMA: { name: "Banco Macro", sector: "Financiero" },
  BYMA: { name: "Bolsas y Mercados Argentinos", sector: "Financiero" },
  CEPU: { name: "Central Puerto", sector: "Servicios públicos" },
  COME: { name: "Sociedad Comercial del Plata", sector: "Holding" },
  CRES: { name: "Cresud", sector: "Agropecuario" },
  EDN: { name: "Edenor", sector: "Servicios públicos" },
  GGAL: { name: "Grupo Financiero Galicia", sector: "Financiero" },
  LOMA: { name: "Loma Negra", sector: "Materiales" },
  METR: { name: "Metrogas", sector: "Servicios públicos" },
  PAMP: { name: "Pampa Energía", sector: "Energía" },
  SUPV: { name: "Grupo Supervielle", sector: "Financiero" },
  TECO2: { name: "Telecom Argentina", sector: "Telecomunicaciones" },
  TGNO4: { name: "Transportadora de Gas del Norte", sector: "Energía" },
  TGSU2: { name: "Transportadora de Gas del Sur", sector: "Energía" },
  TRAN: { name: "Transener", sector: "Servicios públicos" },
  TXAR: { name: "Ternium Argentina", sector: "Materiales" },
  VALO: { name: "Grupo Financiero Valores", sector: "Financiero" },
  YPFD: { name: "YPF", sector: "Energía" },
  CVH: { name: "Cablevisión Holding", sector: "Telecomunicaciones" },
  HARG: { name: "Holcim Argentina", sector: "Materiales" },
  IRSA: { name: "IRSA", sector: "Inmobiliario" },
  MIRG: { name: "Mirgor", sector: "Industria" },
};

/** The most liquid CEDEARs and CEDEAR ETFs; any other symbol falls back to its ticker. */
const CEDEARS: Record<string, InstrumentInfo> = {
  AAL: { name: "American Airlines" },
  AAPL: { name: "Apple" },
  AMD: { name: "Advanced Micro Devices" },
  AMZN: { name: "Amazon" },
  BABA: { name: "Alibaba" },
  BA: { name: "Boeing" },
  BRKB: { name: "Berkshire Hathaway" },
  COIN: { name: "Coinbase" },
  CVX: { name: "Chevron" },
  DIS: { name: "Walt Disney" },
  GLOB: { name: "Globant" },
  GOLD: { name: "Barrick Gold" },
  GOOGL: { name: "Alphabet" },
  INTC: { name: "Intel" },
  JPM: { name: "JPMorgan Chase" },
  KO: { name: "Coca-Cola" },
  MCD: { name: "McDonald's" },
  MELI: { name: "MercadoLibre" },
  META: { name: "Meta Platforms" },
  MSFT: { name: "Microsoft" },
  MSTR: { name: "Strategy" },
  NFLX: { name: "Netflix" },
  NKE: { name: "Nike" },
  NU: { name: "Nu Holdings" },
  NVDA: { name: "NVIDIA" },
  ORCL: { name: "Oracle" },
  PBR: { name: "Petrobras" },
  PFE: { name: "Pfizer" },
  PYPL: { name: "PayPal" },
  SHOP: { name: "Shopify" },
  TSLA: { name: "Tesla" },
  TSM: { name: "Taiwan Semiconductor" },
  UBER: { name: "Uber" },
  V: { name: "Visa" },
  VALE: { name: "Vale" },
  VIST: { name: "Vista Energy" },
  WMT: { name: "Walmart" },
  XOM: { name: "Exxon Mobil" },
  ARKK: { name: "ARK Innovation ETF" },
  DIA: { name: "SPDR Dow Jones Industrial Average ETF" },
  EEM: { name: "iShares MSCI Emerging Markets ETF" },
  EWZ: { name: "iShares MSCI Brazil ETF" },
  GLD: { name: "SPDR Gold Shares" },
  IBIT: { name: "iShares Bitcoin Trust" },
  IWM: { name: "iShares Russell 2000 ETF" },
  QQQ: { name: "Invesco QQQ Trust" },
  SPY: { name: "SPDR S&P 500 ETF" },
  XLE: { name: "Energy Select Sector SPDR" },
  XLF: { name: "Financial Select Sector SPDR" },
};

const INDEX_NAMES: Record<MarketIndexSymbol, string> = {
  M: "S&P Merval",
  G: "S&P BYMA General",
};

/** Display order of the index strip. */
const INDEX_SYMBOLS: readonly MarketIndexSymbol[] = ["M", "G"];

const DOLLAR_SUFFIX: Record<Exclude<EquityCurrency, "ARS">, string> = {
  USD: "D",
  EXT: "C",
};

const TRADE_TIME = /^\d{2}:\d{2}(:\d{2})?$/;

/** Name from the static table; the ticker when the symbol is not listed. */
export function instrumentName(symbol: string): string {
  return LEADERS[symbol]?.name ?? CEDEARS[symbol]?.name ?? symbol;
}

export function leaderSector(symbol: string): EquitySector | null {
  return LEADERS[symbol]?.sector ?? null;
}

function positiveOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** Change of `current` against `previous`, in percentage points; `null` when either is missing. */
export function changeBetween(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null || previous === 0) return null;

  return (current / previous - 1) * 100;
}

/** Normalises a record: `trade: 0` and non-positive prices become `null` rather than a zero price. */
export function toEquityQuote(record: SecurityRecord): EquityQuote {
  const last = positiveOrNull(record.trade);
  const previousClose = positiveOrNull(record.previousClosingPrice);

  const tradeTime =
    last !== null && record.tradeHour && TRADE_TIME.test(record.tradeHour)
      ? record.tradeHour
      : null;

  return {
    symbol: record.symbol,
    currency: record.denominationCcy,
    last,
    previousClose,
    changePct: changeBetween(last, previousClose),
    volume: record.volume ?? 0,
    tradedAmount: record.volumeAmount ?? 0,
    operations: record.numberOfOrders ?? 0,
    tradeTime,
    bid: positiveOrNull(record.bidPrice),
    ask: positiveOrNull(record.offerPrice),
  };
}

export interface CedearSpecies {
  pesos: EquityQuote;
  usd: EquityQuote | null;
  ext: EquityQuote | null;
}

/**
 * Groups the peso, MEP (`D`) and cable (`C`) species of each CEDEAR.
 * A suffixed symbol is paired only when its base exists in `ARS` and its own currency matches the suffix, so a ticker that merely ends in `C` or `D` keeps its own row; dollar species without a peso base are dropped.
 */
export function pairCedearSpecies(quotes: EquityQuote[]): CedearSpecies[] {
  const byKey = new Map<string, EquityQuote>();

  for (const quote of quotes) {
    const key = `${quote.symbol}|${quote.currency}`;
    if (!byKey.has(key)) byKey.set(key, quote);
  }

  const dollar = (base: string, currency: "USD" | "EXT") =>
    byKey.get(`${base}${DOLLAR_SUFFIX[currency]}|${currency}`) ?? null;

  return [...byKey.values()]
    .filter((quote) => quote.currency === "ARS")
    .map((pesos) => ({
      pesos,
      usd: dollar(pesos.symbol, "USD"),
      ext: dollar(pesos.symbol, "EXT"),
    }));
}

/** The dollar species behind the implied rate: `EXT` when it traded today, otherwise `USD`. */
function rateSpecies(species: CedearSpecies) {
  const { ext, usd } = species;

  if (ext && ext.last !== null)
    return {
      basis: "CCL" as const,
      last: ext.last,
      previousClose: ext.previousClose,
    };

  if (usd && usd.last !== null)
    return {
      basis: "MEP" as const,
      last: usd.last,
      previousClose: usd.previousClose,
    };

  return null;
}

/** Peso last ÷ dollar-species last; the conversion ratio cancels out. `null` when either side has not traded. */
export function impliedRate(species: CedearSpecies): ImpliedRate | null {
  const dollar = rateSpecies(species);
  if (!dollar || species.pesos.last === null) return null;

  return { basis: dollar.basis, value: species.pesos.last / dollar.last };
}

/** Splits the peso change into the dollar-species change and the implied-rate change; `null` when any last or previous close is missing. */
export function dayDecomposition(
  species: CedearSpecies,
): DayDecomposition | null {
  const dollar = rateSpecies(species);
  const { last, previousClose } = species.pesos;

  if (!dollar || dollar.previousClose === null) return null;
  if (last === null || previousClose === null) return null;

  const rateToday = last / dollar.last;
  const ratePrevious = previousClose / dollar.previousClose;

  return {
    basis: dollar.basis,
    pesosPct: (last / previousClose - 1) * 100,
    dollarPct: (dollar.last / dollar.previousClose - 1) * 100,
    ratePct: (rateToday / ratePrevious - 1) * 100,
  };
}

/** Highest traded amount first; ties keep alphabetical order so the ranking is stable. */
export function rankByTradedAmount<
  T extends { symbol: string; tradedAmount: number },
>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      right.tradedAmount - left.tradedAmount ||
      left.symbol.localeCompare(right.symbol),
  );
}

/** Latest `HH:MM[:SS]` among the quotes; `null` when none traded. Times compare as strings because they share a day and a zero-padded format. */
export function latestTradeTime(quotes: EquityQuote[]): string | null {
  const times = quotes
    .map((quote) => quote.tradeTime)
    .filter((time): time is string => time !== null);

  return times.length
    ? times.reduce((latest, time) =>
        time.padEnd(8, ":00") > latest.padEnd(8, ":00") ? time : latest,
      )
    : null;
}

/** CEDEAR rows from the `cedears` and `etf` lists, deduplicated (the CEDEAR list wins), paired and ranked. */
export function buildCedearRows(
  cedears: SecurityRecord[],
  etfs: SecurityRecord[],
): CedearRow[] {
  const etfSymbols = new Set(etfs.map((record) => record.symbol));
  const cedearSymbols = new Set(cedears.map((record) => record.symbol));

  const species = pairCedearSpecies(
    [...cedears, ...etfs].map((record) => toEquityQuote(record)),
  );

  return rankByTradedAmount(
    species.map((group) => ({
      symbol: group.pesos.symbol,
      name: instrumentName(group.pesos.symbol),
      kind:
        etfSymbols.has(group.pesos.symbol) &&
        !cedearSymbols.has(group.pesos.symbol)
          ? ("etf" as const)
          : ("cedear" as const),
      pesos: group.pesos,
      usd: group.usd,
      ext: group.ext,
      impliedRate: impliedRate(group),
      decomposition: dayDecomposition(group),
      tradedAmount: group.pesos.tradedAmount,
    })),
  );
}

/** Leader rows in pesos, with name and sector, ranked by traded amount. */
export function buildLeaderRows(records: SecurityRecord[]): LeaderRow[] {
  const bySymbol = new Map<string, SecurityRecord>();

  for (const record of records) {
    if (record.denominationCcy === "ARS" && !bySymbol.has(record.symbol))
      bySymbol.set(record.symbol, record);
  }

  const rows = [...bySymbol.values()].map((record) => ({
    ...toEquityQuote(record),
    name: instrumentName(record.symbol),
    sector: leaderSector(record.symbol),
  }));

  return rankByTradedAmount(rows);
}

/** The S&P Merval and S&P BYMA General, in that order, from the full index list; other indices are ignored. */
export function buildIndexStrip(records: IndexRecord[]): MarketIndex[] {
  return INDEX_SYMBOLS.flatMap((symbol) => {
    const record = records.find((item) => item.symbol === symbol);
    const value = positiveOrNull(record?.price);
    if (!record || value === null) return [];

    return [
      {
        symbol,
        name: INDEX_NAMES[symbol],
        value,
        changePct:
          typeof record.variation === "number" ? record.variation * 100 : null,
        previousClose: positiveOrNull(record.previousClosingPrice),
        high: positiveOrNull(record.highValue),
        low: positiveOrNull(record.minValue),
        date: record.date ?? null,
      },
    ];
  });
}

const price = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const whole = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const CURRENCY_SYMBOL: Record<EquityCurrency, string> = {
  ARS: "$",
  USD: "US$",
  EXT: "US$",
};

/** Price with its currency symbol, e.g. `$ 9.875,00` or `US$ 6,47`; `s/d` when missing. */
export function formatEquityPrice(
  value: number | null,
  currency: EquityCurrency,
): string {
  if (value === null) return "s/d";

  return `${CURRENCY_SYMBOL[currency]} ${price.format(value)}`;
}

/** Traded amount in Spanish short scale, e.g. `$ 38,7 M` or `$ 1,2 mil M`. */
export function formatTradedAmount(
  value: number,
  currency: EquityCurrency = "ARS",
): string {
  const symbol = CURRENCY_SYMBOL[currency];

  if (value >= 1e9) return `${symbol} ${compact.format(value / 1e9)} mil M`;
  if (value >= 1e6) return `${symbol} ${compact.format(value / 1e6)} M`;
  if (value >= 1e3) return `${symbol} ${compact.format(value / 1e3)} mil`;

  return `${symbol} ${whole.format(value)}`;
}

/** Trade time trimmed to minutes, e.g. `13:41`; `s/d` when missing. */
export function formatTradeTime(time: string | null): string {
  return time === null ? "s/d" : time.slice(0, 5);
}
