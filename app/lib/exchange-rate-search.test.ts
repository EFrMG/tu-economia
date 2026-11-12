import { describe, expect, it } from "vitest";

import {
  EXCHANGE_RATE_SEARCH_RESULTS,
  rateCardId,
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

  it("names each card's element id", () => {
    expect(rateCardId("cripto")).toBe("exchange-rate-cripto");
  });

  it("opens the Dólar page at the rate card", () => {
    expect(
      EXCHANGE_RATE_SEARCH_RESULTS.find(({ id }) => id === "bolsa")?.target,
    ).toEqual({ pathname: "/dolar", hash: "exchange-rate-bolsa" });
  });
});
