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

  it("lists the headline cards before the breakdown table and the calculators for a broad term", () => {
    expect(titles("inflacion")).toEqual([
      "Inflación mensual",
      "Inflación interanual",
      "Inflación esperada a 12 meses",
      "Inflación por rubro y región",
      "Poder adquisitivo",
      "Depósitos frente a la inflación",
    ]);
  });

  it("opens each entry's page at its element, with one key per entry", () => {
    const ids = INDICATOR_SEARCH_RESULTS.map((result) => result.id);

    expect(new Set(ids).size).toBe(ids.length);

    const target = (title: string) =>
      INDICATOR_SEARCH_RESULTS.find((result) => result.title === title)?.target;

    expect(target("Canasta básica")).toMatchObject({
      pathname: "/precios",
      hash: "canasta-basica",
    });
    expect(target("BADLAR de bancos privados")).toMatchObject({
      pathname: "/tasas",
      hash: "indicador-badlar",
    });
    expect(target("Valor UVA")).toMatchObject({ pathname: "/tasas" });
    expect(target("Reservas internacionales")).toMatchObject({
      pathname: "/dolar",
    });
    expect(target("Base monetaria")).toMatchObject({ pathname: "/actividad" });
    expect(target("Brecha histórica")).toMatchObject({
      pathname: "/dolar",
      searchParams: { view: "gap" },
      hash: "historical-chart-title",
    });
    expect(target("Depósitos frente a la inflación")).toMatchObject({
      pathname: "/tasas",
      hash: "depositos-e-inflacion",
    });
  });
});
