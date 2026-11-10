import { describe, expect, it } from "vitest";

import {
  buildCedearRows,
  buildIndexStrip,
  buildLeaderRows,
  dayDecomposition,
  formatEquityPrice,
  formatTradedAmount,
  formatTradeTime,
  impliedRate,
  instrumentName,
  latestTradeTime,
  pairCedearSpecies,
  rankByTradedAmount,
  toEquityQuote,
  type SecurityRecord,
} from "./equities";

function record(
  symbol: string,
  denominationCcy: SecurityRecord["denominationCcy"],
  trade: number,
  previousClosingPrice: number | null,
  extra: Partial<SecurityRecord> = {},
): SecurityRecord {
  return {
    symbol,
    denominationCcy,
    trade,
    previousClosingPrice,
    volume: trade ? 100 : 0,
    volumeAmount: trade ? trade * 100 : 0,
    numberOfOrders: trade ? 10 : 0,
    tradeHour: trade ? "13:41:56" : undefined,
    ...extra,
  };
}

const quote = (...args: Parameters<typeof record>) =>
  toEquityQuote(record(...args));

describe("toEquityQuote", () => {
  it("converts the day change to percentage points against the previous close", () => {
    const result = quote("AAL", "ARS", 9875, 9975);

    expect(result.last).toBe(9875);
    expect(result.previousClose).toBe(9975);
    expect(result.changePct).toBeCloseTo(-1.0025, 4);
    expect(result.tradeTime).toBe("13:41:56");
  });

  it("treats an untraded species as having no price, change or trade time", () => {
    const result = quote("AALC", "EXT", 0, 6.14, { tradeHour: "10:00:00" });

    expect(result).toMatchObject({
      last: null,
      previousClose: 6.14,
      changePct: null,
      tradeTime: null,
      tradedAmount: 0,
    });
  });

  it("leaves the change empty when the previous close is missing", () => {
    expect(quote("AAPL", "ARS", 100, null).changePct).toBeNull();
    expect(quote("AAPL", "ARS", 100, 0).changePct).toBeNull();
  });

  it("ignores a malformed trade time", () => {
    expect(
      quote("AAPL", "ARS", 100, 99, { tradeHour: "13h41" }).tradeTime,
    ).toBeNull();
  });
});

describe("pairCedearSpecies", () => {
  it("pairs the D and C species with their peso base", () => {
    const [group] = pairCedearSpecies([
      quote("AAPL", "ARS", 15000, 14800),
      quote("AAPLD", "USD", 10, 9.9),
      quote("AAPLC", "EXT", 9.8, 9.7),
    ]);

    expect(group.pesos.symbol).toBe("AAPL");
    expect(group.usd?.symbol).toBe("AAPLD");
    expect(group.ext?.symbol).toBe("AAPLC");
  });

  it("does not pair a peso ticker that merely ends in C or D", () => {
    const groups = pairCedearSpecies([
      quote("AM", "ARS", 100, 100),
      quote("AMD", "ARS", 200, 200),
      quote("AMC", "ARS", 300, 300),
    ]);

    expect(groups.map((group) => group.pesos.symbol)).toEqual([
      "AM",
      "AMD",
      "AMC",
    ]);
    expect(groups.every((group) => !group.usd && !group.ext)).toBe(true);
  });

  it("does not pair a suffixed species whose currency does not match the suffix", () => {
    const [group] = pairCedearSpecies([
      quote("KO", "ARS", 100, 100),
      quote("KOD", "EXT", 1, 1),
      quote("KOC", "USD", 1, 1),
    ]);

    expect(group.usd).toBeNull();
    expect(group.ext).toBeNull();
  });

  it("drops dollar species without a peso base", () => {
    expect(
      pairCedearSpecies([
        quote("XYZD", "USD", 1, 1),
        quote("XYZC", "EXT", 1, 1),
      ]),
    ).toEqual([]);
  });

  it("keeps the first record of a repeated symbol and currency", () => {
    const groups = pairCedearSpecies([
      quote("SPY", "ARS", 100, 100),
      quote("SPY", "ARS", 999, 999),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].pesos.last).toBe(100);
  });
});

describe("implied rate and day decomposition", () => {
  const pesos = quote("AAPL", "ARS", 15150, 15000);
  const usd = quote("AAPLD", "USD", 10.2, 10);
  const ext = quote("AAPLC", "EXT", 10, 10);

  it("prefers the cable species and labels it CCL", () => {
    expect(impliedRate({ pesos, usd, ext })).toEqual({
      basis: "CCL",
      value: 1515,
    });
  });

  it("falls back to the MEP species when the cable one has not traded", () => {
    const untradedExt = quote("AAPLC", "EXT", 0, 10);

    expect(impliedRate({ pesos, usd, ext: untradedExt })).toEqual({
      basis: "MEP",
      value: 15150 / 10.2,
    });
  });

  it("has no rate when neither dollar species traded or the peso one did not", () => {
    const untradedUsd = quote("AAPLD", "USD", 0, 10);
    const untradedExt = quote("AAPLC", "EXT", 0, 10);

    expect(
      impliedRate({ pesos, usd: untradedUsd, ext: untradedExt }),
    ).toBeNull();
    expect(impliedRate({ pesos, usd: null, ext: null })).toBeNull();
    expect(
      impliedRate({ pesos: quote("AAPL", "ARS", 0, 15000), usd, ext }),
    ).toBeNull();
  });

  it("splits the peso change into the dollar and exchange-rate changes", () => {
    const result = dayDecomposition({ pesos, usd, ext: null })!;

    expect(result.basis).toBe("MEP");
    expect(result.pesosPct).toBeCloseTo(1, 10);
    expect(result.dollarPct).toBeCloseTo(2, 10);

    expect(
      (1 + result.pesosPct / 100) / (1 + result.dollarPct / 100) - 1,
    ).toBeCloseTo(result.ratePct / 100, 12);

    expect(result.ratePct).toBeCloseTo((1.01 / 1.02 - 1) * 100, 10);
  });

  it("has no decomposition when a previous close is missing", () => {
    expect(
      dayDecomposition({
        pesos,
        usd: quote("AAPLD", "USD", 10.2, null),
        ext: null,
      }),
    ).toBeNull();

    expect(
      dayDecomposition({ pesos: quote("AAPL", "ARS", 15150, null), usd, ext }),
    ).toBeNull();
  });
});

describe("rows and ranking", () => {
  it("ranks by traded amount with ties in alphabetical order", () => {
    const rows = [
      { symbol: "B", tradedAmount: 5 },
      { symbol: "A", tradedAmount: 5 },
      { symbol: "C", tradedAmount: 9 },
    ];

    expect(rankByTradedAmount(rows).map((row) => row.symbol)).toEqual([
      "C",
      "A",
      "B",
    ]);
    expect(rows.map((row) => row.symbol)).toEqual(["B", "A", "C"]);
  });

  it("builds CEDEAR rows from both lists, marking ETFs and naming from the table", () => {
    const rows = buildCedearRows(
      [
        record("AAL", "ARS", 9875, 9975),
        record("AALD", "USD", 6.47, 6.52),
        record("ZZZ", "ARS", 0, 50),
      ],
      [
        record("ARKK", "ARS", 13300, 13870),
        record("ARKKC", "EXT", 0, 8.5),
        record("AAL", "ARS", 1, 1),
      ],
    );

    expect(rows.map((row) => [row.symbol, row.kind, row.name])).toEqual([
      ["ARKK", "etf", "ARK Innovation ETF"],
      ["AAL", "cedear", "American Airlines"],
      ["ZZZ", "cedear", "ZZZ"],
    ]);

    expect(rows[0].impliedRate).toBeNull();
    expect(rows[0].decomposition).toBeNull();
    expect(rows[1].impliedRate?.basis).toBe("MEP");
    expect(rows[1].pesos.last).toBe(9875);
  });

  it("builds leader rows in pesos with sector, ranked by traded amount", () => {
    const rows = buildLeaderRows([
      record("ALUA", "ARS", 846, 845, { volumeAmount: 277_748_472 }),
      record("BBAR", "ARS", 6940, 6980, { volumeAmount: 232_516_365 }),
      record("NEWCO", "ARS", 10, 10, { volumeAmount: 300_000_000 }),
      record("ALUA", "USD", 1, 1),
    ]);

    expect(rows.map((row) => [row.symbol, row.name, row.sector])).toEqual([
      ["NEWCO", "NEWCO", null],
      ["ALUA", "Aluar Aluminio Argentino", "Materiales"],
      ["BBAR", "BBVA Argentina", "Financiero"],
    ]);
  });

  it("finds the latest trade time across both time formats", () => {
    expect(
      latestTradeTime([
        quote("A", "ARS", 1, 1, { tradeHour: "13:45" }),
        quote("B", "ARS", 1, 1, { tradeHour: "13:44:59" }),
        quote("C", "ARS", 0, 1),
      ]),
    ).toBe("13:45");

    expect(latestTradeTime([quote("C", "ARS", 0, 1)])).toBeNull();
  });
});

describe("buildIndexStrip", () => {
  it("keeps the S&P Merval and the S&P BYMA General, in that order, in percentage points", () => {
    const strip = buildIndexStrip([
      {
        symbol: "G",
        price: 124242712.18,
        variation: 0.0016,
        previousClosingPrice: 124048018.53,
      },
      { symbol: "SPBYCAP", price: 41345.61, variation: 0.0031 },
      { symbol: "M", price: 2850585.58, variation: -0.003, date: "2026-10-16" },
    ]);

    expect(strip.map((index) => [index.symbol, index.name])).toEqual([
      ["M", "S&P Merval"],
      ["G", "S&P BYMA General"],
    ]);

    expect(strip[0].changePct).toBeCloseTo(-0.3, 10);
    expect(strip[0].previousClose).toBeNull();
    expect(strip[0].date).toBe("2026-10-16");
    expect(strip[1].changePct).toBeCloseTo(0.16, 10);
  });

  it("leaves the change empty when BYMA omits it", () => {
    expect(
      buildIndexStrip([{ symbol: "M", price: 1, variation: null }])[0]
        .changePct,
    ).toBeNull();
  });
});

describe("formatting", () => {
  it("formats prices by currency and missing values as s/d", () => {
    expect(formatEquityPrice(9875, "ARS")).toBe("$ 9.875,00");
    expect(formatEquityPrice(6.47, "EXT")).toBe("US$ 6,47");
    expect(formatEquityPrice(null, "USD")).toBe("s/d");
  });

  it("formats traded amounts on the Spanish short scale", () => {
    expect(formatTradedAmount(950)).toBe("$ 950");
    expect(formatTradedAmount(2042.39, "USD")).toBe("US$ 2,0 mil");
    expect(formatTradedAmount(38_712_380)).toBe("$ 38,7 M");
    expect(formatTradedAmount(1_234_000_000)).toBe("$ 1,2 mil M");
  });

  it("trims trade times to minutes", () => {
    expect(formatTradeTime("13:41:56")).toBe("13:41");
    expect(formatTradeTime("13:45")).toBe("13:45");
    expect(formatTradeTime(null)).toBe("s/d");
  });

  it("falls back to the ticker for names", () => {
    expect(instrumentName("GGAL")).toBe("Grupo Financiero Galicia");
    expect(instrumentName("UNKNOWN")).toBe("UNKNOWN");
  });
});
