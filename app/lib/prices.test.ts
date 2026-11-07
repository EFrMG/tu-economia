import { describe, expect, it } from "vitest";

import {
  chainLabel,
  isPriceItemId,
  prepareCatalog,
  searchCatalog,
  summarizeChains,
  type PriceCatalog,
} from "./prices";

const catalog: PriceCatalog = {
  sourceDate: "2026-10-29",
  products: [
    [
      "7793704000928",
      "Yerba mate Playadito, 1 kg",
      "PLAYADITO",
      "1 kg",
      "DESPALADA",
    ],
    [
      "7790060023684",
      "ACEITE GIRASOL COCINERO BOT 1,5 LTR",
      "COCINERO",
      "1.5 l",
      "",
    ],
    [
      "7793890258769",
      "PAN DE MESA BLANCO LACTAL PAQ 315 GRM",
      "LACTAL",
      "315 g",
      "BLANCO PAN",
    ],
    [
      "7791290792814",
      "JABÓN LIQ.BIO ENZIMAS SKIP DOY 800 ML",
      "SKIP",
      "800 ml",
      "LIQUIDO ROPA",
    ],
  ],
};

const products = prepareCatalog(catalog);

const ids = (query: string, limit?: number) =>
  searchCatalog(products, query, limit).map((product) => product.id);

describe("searchCatalog", () => {
  it("requires every word to start a word of the name, brand or another chain's description", () => {
    expect(ids("pan lactal")).toEqual(["7793890258769"]);
    expect(ids("lact")).toEqual(["7793890258769"]);
    expect(ids("actal")).toEqual([]);
    expect(ids("aceite cocinero")).toEqual(["7790060023684"]);
    expect(ids("aceite oliva")).toEqual([]);
  });

  it("ignores case, accents and punctuation, and matches aliases from other chains", () => {
    expect(ids("JABON liquido")).toEqual(["7791290792814"]);
    expect(ids("liq.")).toEqual(["7791290792814"]);
    expect(ids("despalada")).toEqual(["7793704000928"]);
  });

  it("keeps the index order and stops at the limit", () => {
    expect(ids("1")).toEqual(["7793704000928", "7790060023684"]);
    expect(ids("1", 1)).toEqual(["7793704000928"]);
    expect(ids("  ")).toEqual([]);
  });
});

describe("chainLabel", () => {
  it("merges formats of one brand and keeps separately known stores apart", () => {
    expect(chainLabel("10-3", "Express")).toBe("Carrefour");
    expect(chainLabel("10-1")).toBe("Carrefour");
    expect(chainLabel("9-1", "Vea")).toBe("Vea");
    expect(chainLabel("9-2", "Disco")).toBe("Disco");
    expect(chainLabel("2002-1", "Fravega")).toBe("Fravega");
    expect(chainLabel("2002-1")).toBe("2002-1");
  });
});

describe("isPriceItemId", () => {
  it("accepts GTINs and basket groups or fresh items, not single-product category ids", () => {
    expect(isPriceItemId("7790742348302")).toBe(true);
    expect(isPriceItemId("40084107")).toBe(true);
    expect(isPriceItemId("huevos")).toBe(true);
    expect(isPriceItemId("papa")).toBe(true);
    expect(isPriceItemId("leche-entera")).toBe(false);
    expect(isPriceItemId("1234567")).toBe(false);
    expect(isPriceItemId("../etc")).toBe(false);
  });
});

describe("summarizeChains", () => {
  it("keeps each chain's cheapest quote, counts its branches and sorts cheapest first", () => {
    expect(
      summarizeChains([
        { chain: "DIA", price: 4390 },
        { chain: "Coto", price: 3490 },
        { chain: "DIA", price: 4290 },
      ]),
    ).toEqual([
      { chain: "Coto", price: 3490, branches: 1 },
      { chain: "DIA", price: 4290, branches: 2 },
    ]);
  });
});
