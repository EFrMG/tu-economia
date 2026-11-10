import { describe, expect, it } from "vitest";

import { isEquityPanel } from "./acciones-panels";
import { EXCHANGE_RATE_SEARCH_RESULTS } from "./exchange-rate-search";
import { searchEntities } from "./search-entities";
import {
  EQUITY_PANEL_SEARCH_RESULTS,
  equityPanelSearchResults,
  searchEquityPanels,
} from "./equity-search";

describe("equity panel search", () => {
  it("indexes only the Empresas panel and the calculator while BYMA is off", () => {
    expect(equityPanelSearchResults(false).map(({ id }) => id)).toEqual([
      "empresas",
      "calculadora",
    ]);

    expect(searchEquityPanels("CEDEAR", false).map(({ id }) => id)).toEqual([
      "calculadora",
    ]);

    expect(searchEquityPanels("merval", false)).toEqual([]);
  });

  it("indexes every panel while BYMA is on", () => {
    expect(equityPanelSearchResults(true).map(({ id }) => id)).toEqual([
      "acciones",
      "empresas",
      "calculadora",
    ]);
  });

  it("matches panel names and common aliases without accents", () => {
    expect(searchEquityPanels("CEDEAR", true).map(({ id }) => id)).toEqual([
      "acciones",
      "calculadora",
    ]);

    expect(searchEquityPanels("merval", true).map(({ id }) => id)).toEqual([
      "acciones",
    ]);

    expect(searchEquityPanels("lider", true).map(({ id }) => id)).toEqual([
      "acciones",
    ]);

    expect(searchEquityPanels("acciones", true).map(({ id }) => id)).toEqual([
      "acciones",
      "empresas",
    ]);

    expect(searchEquityPanels("acciones", false).map(({ id }) => id)).toEqual([
      "empresas",
    ]);

    for (const term of ["empresas", "SEC", "edgar", "balances", "20-F"])
      expect(searchEquityPanels(term, false).map(({ id }) => id)).toEqual([
        "empresas",
      ]);
  });

  it("finds the calculator by its common names in both flag states", () => {
    for (const bymaEnabled of [false, true])
      for (const term of [
        "calculadora",
        "calculadora cedear",
        "precio teórico",
        "precio teorico",
        "Ratio",
        "ratio de conversión",
      ])
        expect(
          searchEquityPanels(term, bymaEnabled).map(({ id }) => id),
        ).toEqual(["calculadora"]);
  });

  it("targets a panel the Acciones page accepts in the same flag state", () => {
    for (const bymaEnabled of [false, true])
      for (const result of equityPanelSearchResults(bymaEnabled)) {
        expect(result.target.pathname).toBe("/acciones");

        expect(
          isEquityPanel(result.target.searchParams?.panel ?? null, bymaEnabled),
        ).toBe(true);
      }
  });

  it("does not answer the quotation terms the exchange-rate index owns", () => {
    const index = [
      ...EXCHANGE_RATE_SEARCH_RESULTS,
      ...EQUITY_PANEL_SEARCH_RESULTS,
    ];

    for (const term of ["dolar", "mep", "ccl", "blue"])
      expect(
        searchEntities(term, index).every(
          (result) => result.kind === "exchange-rate",
        ),
      ).toBe(true);
  });
});
