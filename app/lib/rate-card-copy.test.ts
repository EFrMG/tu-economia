import { describe, expect, it } from "vitest";

import {
  formatExchangeRateCardText,
  formatHighlightRateCardText,
} from "~/lib/rate-card-copy";

describe("rate card copy", () => {
  it("formats the grid card's current quotation, change, and gap for a message", () => {
    expect(
      formatExchangeRateCardText(
        "Dólar MEP",
        { compra: 1234.5, venta: 1300, changePct: -1.25 },
        "Brecha: 8,2%",
      ),
    ).toBe(
      "Dólar MEP\nCompra: ARS 1.234,50\nVenta: ARS 1.300,00\nVariación diaria: -1,25%\nBrecha: 8,2%",
    );
  });

  it("copies only the values shown by the highlighted card and handles unavailable variation", () => {
    expect(
      formatHighlightRateCardText("USD Blue", { venta: 1555, changePct: null }),
    ).toBe("USD Blue\nVenta: ARS 1.555,00\nVariación diaria: s/d");

    expect(
      formatHighlightRateCardText("USD Blue", { venta: 1555, changePct: 0.75 }),
    ).toContain("Variación diaria: +0,75%");
  });
});
