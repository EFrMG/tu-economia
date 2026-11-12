import { describe, expect, it } from "vitest";

import {
  searchDestination,
  searchEntities,
  searchEntityKey,
  type SearchEntity,
} from "./search-entities";

describe("search entity model", () => {
  const entities: SearchEntity[] = [
    {
      kind: "indicator",
      id: "inflation",
      title: "Inflación",
      aliases: ["ipc"],
      target: {
        pathname: "/indicadores",
        searchParams: { indicator: "inflation" },
      },
    },
    {
      kind: "news",
      id: "inflation",
      title: "Informe sobre precios",
      aliases: ["inflacion"],
      target: { pathname: "/noticias", searchParams: { story: "inflation" } },
    },
  ];

  it("matches accents and aliases across entity kinds", () => {
    expect(searchEntities("INFLACION", entities).map(searchEntityKey)).toEqual([
      "indicator:inflation",
      "news:inflation",
    ]);

    expect(searchEntities("IPC", entities).map(searchEntityKey)).toEqual([
      "indicator:inflation",
    ]);

    expect(searchEntities(" ", entities)).toEqual([]);
  });

  describe("destination", () => {
    const here = { pathname: "/dolar", search: "?period=90", hash: "" };

    it("opens another page with only the result's query and element", () => {
      expect(
        searchDestination(
          { pathname: "/precios", hash: "canasta-basica" },
          here,
        ),
      ).toEqual({
        pathname: "/precios",
        search: "",
        hash: "#canasta-basica",
        replace: false,
      });
    });

    it("keeps the current query on the same page and adds the result's", () => {
      expect(
        searchDestination(
          {
            pathname: "/dolar",
            searchParams: { view: "gap" },
            hash: "historical-chart-title",
          },
          here,
        ),
      ).toEqual({
        pathname: "/dolar",
        search: "?period=90&view=gap",
        hash: "#historical-chart-title",
        replace: false,
      });
    });

    it("updates the hash on the same page so the destination highlights", () => {
      expect(
        searchDestination(
          { pathname: "/dolar", hash: "exchange-rate-blue" },
          here,
        ),
      ).toMatchObject({ search: "?period=90", hash: "#exchange-rate-blue" });
    });

    it("replaces the entry when the URL is already the destination", () => {
      expect(
        searchDestination(
          { pathname: "/dolar", hash: "exchange-rate-blue" },
          { ...here, hash: "#exchange-rate-blue" },
        ).replace,
      ).toBe(true);
    });
  });
});
