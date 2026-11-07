import { describe, expect, it } from "vitest";

import {
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
});
