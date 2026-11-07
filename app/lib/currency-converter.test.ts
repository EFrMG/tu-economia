import { describe, expect, it } from "vitest";

import { convertCurrency } from "~/lib/currency-converter";

const quote = { compra: 1_180, venta: 1_220 };

describe("currency converter", () => {
  it("divides pesos by the selected selling rate to estimate US dollars", () => {
    expect(convertCurrency(12_200, quote, "ars-to-usd")).toBe(10);
  });

  it("multiplies US dollars by the selected buying rate to estimate pesos", () => {
    expect(convertCurrency(10, quote, "usd-to-ars")).toBe(11_800);
  });

  it("withholds a result for invalid amounts and unavailable quotation sides", () => {
    expect(convertCurrency(Number.NaN, quote, "ars-to-usd")).toBeNull();
    expect(convertCurrency(-1, quote, "usd-to-ars")).toBeNull();

    expect(
      convertCurrency(100, { compra: 0, venta: 1_220 }, "usd-to-ars"),
    ).toBeNull();

    expect(
      convertCurrency(100, { compra: 1_180, venta: 0 }, "ars-to-usd"),
    ).toBeNull();

    expect(convertCurrency(100, undefined, "ars-to-usd")).toBeNull();
  });
});
