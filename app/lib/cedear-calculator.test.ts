import { describe, expect, it } from "vitest";

import {
  CALCULATOR_LIMITS,
  UNAVAILABLE_REFERENCE_RATES,
  calculateCedear,
  canonicalCalculatorParam,
  fieldParamValue,
  fieldTextFromParam,
  hasCalculatorParams,
  normaliseCalculatorParams,
  parseAmount,
  parseDecimal,
  parseParamNumber,
  parseRatio,
  parseRatioParam,
  referenceQuote,
  referenceRateFromParam,
  referenceRatesFrom,
  referenceRatesNeedRetry,
} from "./cedear-calculator";

describe("parseDecimal", () => {
  it("reads integers, decimal commas and grouped thousands", () => {
    expect(parseDecimal("150")).toBe(150);
    expect(parseDecimal(" 150,25 ")).toBe(150.25);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal("1.234.567")).toBe(1234567);
    expect(parseDecimal("1.234.567,89")).toBe(1234567.89);
  });

  it("reads a single dot as a decimal point unless it could be a thousands separator", () => {
    expect(parseDecimal("150.25")).toBe(150.25);
    expect(parseDecimal("1.5")).toBe(1.5);
    expect(parseDecimal("0.125")).toBe(0.125);
    expect(parseDecimal("1.500")).toBeNull();
    expect(parseDecimal("12.345")).toBeNull();
  });

  it("rejects empty, zero, negative, malformed and over-long input", () => {
    for (const text of [
      "",
      " ",
      "0",
      "0,00",
      "-5",
      "1e3",
      "abc",
      "1,2,3",
      "1.23.4",
      "1,234.56",
      "12345678901",
      "1,1234567",
      "Infinity",
    ])
      expect(parseDecimal(text)).toBeNull();
  });
});

describe("parseParamNumber", () => {
  it("prefers the canonical dot-decimal form and falls back to the typed forms", () => {
    expect(parseParamNumber("1.234")).toBe(1.234);
    expect(parseParamNumber("150.25")).toBe(150.25);
    expect(parseParamNumber("150,25")).toBe(150.25);
    expect(parseParamNumber("1.234,5")).toBe(1234.5);
    expect(parseParamNumber("x")).toBeNull();
    expect(parseParamNumber("0")).toBeNull();
  });
});

describe("parseRatio", () => {
  it("accepts a plain number and the issuer's a:b notation", () => {
    expect(parseRatio("20")).toEqual({ cedears: 20, shares: 1, value: 20 });
    expect(parseRatio("20:1")).toEqual({ cedears: 20, shares: 1, value: 20 });
    expect(parseRatio(" 20 : 1 ")).toEqual({
      cedears: 20,
      shares: 1,
      value: 20,
    });
    expect(parseRatio("1:2")).toEqual({ cedears: 1, shares: 2, value: 0.5 });
    expect(parseRatio("2,5")?.value).toBe(2.5);
  });

  it("rejects missing sides, zero, extra colons and values over the bound", () => {
    for (const text of ["", ":", "20:", ":1", "0:1", "20:0", "1:2:3", "x:1"])
      expect(parseRatio(text)).toBeNull();

    expect(parseRatio(String(CALCULATOR_LIMITS.ratio))).not.toBeNull();
    expect(parseRatio(String(CALCULATOR_LIMITS.ratio + 1))).toBeNull();
  });

  it("reads the URL form with dot decimals", () => {
    expect(parseRatioParam("2.125")?.value).toBe(2.125);
    expect(parseRatioParam("1:3")?.value).toBeCloseTo(1 / 3);
  });
});

describe("parseAmount", () => {
  it("applies each field's upper bound", () => {
    expect(parseAmount("precio", "1000000")).toBe(1_000_000);
    expect(parseAmount("precio", "1000001")).toBeNull();
    expect(parseAmount("tc", "1500,5")).toBe(1500.5);
    expect(parseAmount("tc", "1000001")).toBeNull();
    expect(parseAmount("mercado", "1.000.000.000")).toBe(1_000_000_000);
    expect(parseAmount("mercado", "1.000.000.001")).toBeNull();
  });
});

describe("field and URL forms", () => {
  it("writes canonical URL values and removes invalid ones", () => {
    expect(fieldParamValue("precio", "150,25")).toBe("150.25");
    expect(fieldParamValue("precio", "1.234,5")).toBe("1234.5");
    expect(fieldParamValue("precio", "1.500")).toBeNull();
    expect(fieldParamValue("precio", "")).toBeNull();
    expect(fieldParamValue("ratio", "20:1")).toBe("20");
    expect(fieldParamValue("ratio", "1:2")).toBe("1:2");
    expect(fieldParamValue("ratio", "2,5:1")).toBe("2.5");
  });

  it("shows URL values with a decimal comma and round-trips them", () => {
    expect(fieldTextFromParam("precio", "150.25")).toBe("150,25");
    expect(fieldTextFromParam("precio", "2.125")).toBe("2,125");
    expect(fieldTextFromParam("ratio", "1:2")).toBe("1:2");
    expect(fieldTextFromParam("ratio", "2.5")).toBe("2,5");
    expect(fieldTextFromParam("tc", null)).toBe("");
    expect(fieldTextFromParam("tc", "nope")).toBe("");

    for (const raw of ["150.25", "2.125", "0.000001", "9999999.999999"])
      expect(
        fieldParamValue("mercado", fieldTextFromParam("mercado", raw)),
      ).toBe(raw);
  });
});

describe("normaliseCalculatorParams", () => {
  const normalise = (query: string) =>
    normaliseCalculatorParams(new URLSearchParams(query))?.toString() ?? null;

  it("leaves canonical parameters alone", () => {
    expect(
      normalise(
        "panel=calculadora&precio=150.25&ratio=20&referencia=mep&tc=1200&mercado=9000",
      ),
    ).toBeNull();

    expect(normalise("panel=calculadora&ratio=1:2")).toBeNull();
    expect(normalise("panel=calculadora")).toBeNull();
  });

  it("canonicalises typed forms and drops invalid values and the default reference", () => {
    expect(normalise("panel=calculadora&precio=150,25&ratio=20:1")).toBe(
      "panel=calculadora&precio=150.25&ratio=20",
    );

    expect(
      normalise("panel=calculadora&precio=-1&ratio=0&tc=abc&mercado=2e3"),
    ).toBe("panel=calculadora");

    expect(normalise("panel=calculadora&referencia=ccl")).toBe(
      "panel=calculadora",
    );

    expect(normalise("panel=calculadora&referencia=MEP")).toBe(
      "panel=calculadora&referencia=mep",
    );

    expect(normalise("panel=calculadora&referencia=blue")).toBe(
      "panel=calculadora",
    );

    expect(normalise("panel=calculadora&precio=2000000")).toBe(
      "panel=calculadora",
    );
  });

  it("collapses repeated parameters to the first", () => {
    expect(normalise("panel=calculadora&precio=10&precio=20")).toBe(
      "panel=calculadora&precio=10",
    );
  });

  it("keeps unrelated parameters such as the dev preview", () => {
    expect(normalise("panel=calculadora&precio=1,5&preview=unavailable")).toBe(
      "panel=calculadora&precio=1.5&preview=unavailable",
    );
  });

  it("matches canonicalCalculatorParam for each parameter", () => {
    expect(canonicalCalculatorParam("tc", "1.234,56")).toBe("1234.56");
    expect(canonicalCalculatorParam("referencia", " mep ")).toBe("mep");
  });

  it("detects calculator parameters", () => {
    expect(hasCalculatorParams(new URLSearchParams("panel=empresas"))).toBe(
      false,
    );

    expect(
      hasCalculatorParams(new URLSearchParams("panel=empresas&tc=1")),
    ).toBe(true);
  });
});

describe("referenceRateFromParam", () => {
  it("defaults to CCL", () => {
    expect(referenceRateFromParam(null)).toBe("ccl");
    expect(referenceRateFromParam("x")).toBe("ccl");
    expect(referenceRateFromParam("mep")).toBe("mep");
    expect(referenceRateFromParam("CCL")).toBe("ccl");
  });
});

describe("calculateCedear", () => {
  it("computes the theoretical price as underlying × rate ÷ ratio", () => {
    // US$ 100 × ARS 1.000 ÷ 20 = ARS 5.000
    expect(
      calculateCedear({ underlying: 100, ratio: 20, rate: 1000, market: null }),
    ).toEqual({
      theoretical: 5000,
      impliedRate: null,
      rateGapPct: null,
      premium: null,
      premiumPct: null,
    });
  });

  it("derives the implied rate, its gap and the premium from a market price", () => {
    // ARS 5.250 × 20 ÷ US$ 100 = ARS 1.050 per US$, 5 % over the reference; ARS 250 over the theoretical ARS 5.000.
    const result = calculateCedear({
      underlying: 100,
      ratio: 20,
      rate: 1000,
      market: 5250,
    });

    expect(result.theoretical).toBe(5000);
    expect(result.impliedRate).toBe(1050);
    expect(result.rateGapPct).toBeCloseTo(5, 10);
    expect(result.premium).toBe(250);
    expect(result.premiumPct).toBeCloseTo(5, 10);
  });

  it("reports a discount as a negative premium", () => {
    const result = calculateCedear({
      underlying: 100,
      ratio: 20,
      rate: 1000,
      market: 4800,
    });

    expect(result.impliedRate).toBe(960);
    expect(result.rateGapPct).toBeCloseTo(-4, 10);
    expect(result.premium).toBe(-200);
    expect(result.premiumPct).toBeCloseTo(-4, 10);
  });

  it("handles fractional ratios such as 1:2", () => {
    expect(
      calculateCedear({ underlying: 10, ratio: 0.5, rate: 1000, market: null })
        .theoretical,
    ).toBe(20000);
  });

  it("gives the implied rate without a reference rate, and nothing else", () => {
    expect(
      calculateCedear({ underlying: 100, ratio: 20, rate: null, market: 5250 }),
    ).toEqual({
      theoretical: null,
      impliedRate: 1050,
      rateGapPct: null,
      premium: null,
      premiumPct: null,
    });
  });

  it("answers null for missing, zero, negative or non-finite inputs", () => {
    const empty = {
      theoretical: null,
      impliedRate: null,
      rateGapPct: null,
      premium: null,
      premiumPct: null,
    };

    expect(
      calculateCedear({ underlying: null, ratio: 20, rate: 1000, market: 1 }),
    ).toEqual(empty);

    expect(
      calculateCedear({ underlying: 100, ratio: 0, rate: 1000, market: 1 }),
    ).toEqual(empty);

    expect(
      calculateCedear({ underlying: 100, ratio: -20, rate: 1000, market: 1 }),
    ).toEqual(empty);

    expect(
      calculateCedear({
        underlying: Number.NaN,
        ratio: 20,
        rate: Number.POSITIVE_INFINITY,
        market: null,
      }),
    ).toEqual(empty);
  });

  it("keeps the gap and the premium equal, as the formulas imply", () => {
    for (const [underlying, ratio, rate, market] of [
      [187.35, 10, 1432.5, 26_950],
      [0.83, 0.5, 1199.99, 2_100],
      [512, 144, 1500, 5_200.75],
    ]) {
      const result = calculateCedear({ underlying, ratio, rate, market });

      expect(result.premiumPct).toBeCloseTo(result.rateGapPct!, 9);
    }
  });
});

describe("reference rates", () => {
  const freshness = {
    status: "current" as const,
    lastSuccessfulFetchAtLabel: "10/11/2026, 14:05",
  };

  const live = (rates: { casa: string; venta: number }[]) => ({
    rates: rates.map((rate) => ({ ...rate, updatedAt: "10/11/2026, 14:00" })),
    freshness,
  });

  it("picks the CCL and MEP sale prices", () => {
    const rates = referenceRatesFrom(
      live([
        { casa: "blue", venta: 1300 },
        { casa: "bolsa", venta: 1450 },
        { casa: "contadoconliqui", venta: 1480 },
      ]),
    );

    expect(rates).toEqual({
      status: "available",
      quotes: [
        { id: "ccl", venta: 1480, updatedAt: "10/11/2026, 14:00" },
        { id: "mep", venta: 1450, updatedAt: "10/11/2026, 14:00" },
      ],
      stale: false,
      fetchedAtLabel: "10/11/2026, 14:05",
    });

    expect(referenceQuote(rates, "mep")?.venta).toBe(1450);
    expect(referenceRatesNeedRetry(rates)).toBe(false);
  });

  it("leaves out an unusable quote and retries", () => {
    const rates = referenceRatesFrom(
      live([
        { casa: "bolsa", venta: 0 },
        { casa: "contadoconliqui", venta: 1480 },
      ]),
    );

    expect(referenceQuote(rates, "mep")).toBeNull();
    expect(referenceQuote(rates, "ccl")?.venta).toBe(1480);
    expect(referenceRatesNeedRetry(rates)).toBe(true);
  });

  it("is unavailable without either quote", () => {
    expect(referenceRatesFrom(live([{ casa: "blue", venta: 1300 }]))).toEqual(
      UNAVAILABLE_REFERENCE_RATES,
    );

    expect(referenceQuote(UNAVAILABLE_REFERENCE_RATES, "ccl")).toBeNull();
    expect(referenceQuote(null, "ccl")).toBeNull();
    expect(referenceRatesNeedRetry(UNAVAILABLE_REFERENCE_RATES)).toBe(true);
  });

  it("marks a stale snapshot and retries it", () => {
    const rates = referenceRatesFrom({
      ...live([
        { casa: "bolsa", venta: 1450 },
        { casa: "contadoconliqui", venta: 1480 },
      ]),
      freshness: { ...freshness, status: "stale" },
    });

    expect(rates.status === "available" && rates.stale).toBe(true);
    expect(referenceRatesNeedRetry(rates)).toBe(true);
  });
});
