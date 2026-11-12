import { describe, expect, it } from "vitest";

import { INDICATOR_SEARCH_RESULTS } from "./indicator-search";
import { searchEntities } from "./search-entities";

const titles = (query: string) =>
  searchEntities(query, INDICATOR_SEARCH_RESULTS).map((result) => result.title);

describe("indicator search", () => {
  it("finds the INDEC tables by their common names, with or without accents", () => {
    expect(titles("Canasta básica")).toEqual(["Canasta básica"]);
    expect(titles("linea de pobreza")).toEqual(["Canasta básica"]);
    expect(titles("sueldos")).toEqual(["Salarios"]);
    expect(titles("inflación núcleo")).toEqual([
      "Inflación por rubro y región",
    ]);
  });

  it("lists the headline cards before the breakdown table for a broad term", () => {
    expect(titles("inflacion")).toEqual([
      "Inflación mensual",
      "Inflación interanual",
      "Inflación esperada a 12 meses",
      "Inflación por rubro y región",
    ]);
  });

  it("opens /indicadores at the matching element, with one id per entry", () => {
    const ids = INDICATOR_SEARCH_RESULTS.map((result) => result.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const result of INDICATOR_SEARCH_RESULTS)
      expect(result.target).toEqual({
        pathname: "/indicadores",
        hash: result.id,
        focusId: result.id,
      });
  });
});
