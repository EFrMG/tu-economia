import { describe, expect, it } from "vitest";

import {
  rateCardId,
  searchableRateCasa,
  searchExchangeRates,
} from "./exchange-rate-search";

describe("exchange-rate search", () => {
  it("matches quotation titles and common aliases without accents", () => {
    expect(searchExchangeRates("dolar").map(({ id }) => id)).toEqual([
      "blue",
      "oficial",
      "bolsa",
      "contadoconliqui",
      "cripto",
    ]);

    expect(searchExchangeRates("ccl").map(({ id }) => id)).toEqual([
      "contadoconliqui",
    ]);

    expect(searchExchangeRates("MEP").map(({ id }) => id)).toEqual(["bolsa"]);
  });

  it("keeps URL selections constrained to rates displayed by the dashboard", () => {
    expect(searchableRateCasa("blue")).toBe("blue");
    expect(searchableRateCasa("indicadores")).toBeNull();
    expect(rateCardId("cripto")).toBe("exchange-rate-cripto");
  });
});
