import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IndecRow } from "./indec.server";

const response = (body: unknown, status = 200) =>
  Response.json(body, { status });

const row = (overrides: Partial<IndecRow>): IndecRow => ({
  codigo: "0",
  tipo_de_indicador: "v_m",
  periodo: "202609",
  valor: 1,
  ...overrides,
});

const basketRows = (periodo: string) => [
  row({ codigo: "CBA", tipo_de_indicador: "CBA", periodo, valor: 239058.22 }),
  row({ codigo: "CBA", tipo_de_indicador: "v_m", periodo, valor: 1.7 }),
  row({ codigo: "CBA", tipo_de_indicador: "v_ia", periodo, valor: 40 }),
  row({
    codigo: "CBA H2",
    tipo_de_indicador: "Hogar 2",
    periodo,
    valor: 738689.9,
  }),
  row({ codigo: "CBT", tipo_de_indicador: "CBT", periodo, valor: 528318.67 }),
  row({ codigo: "CBT", tipo_de_indicador: "v_m", periodo, valor: 1.7 }),
  row({ codigo: "CBT", tipo_de_indicador: "v_ia", periodo, valor: 38.7 }),
  row({
    codigo: "CBT H2",
    tipo_de_indicador: "Hogar 2",
    periodo,
    valor: 1632504.69,
  }),
];

const general = (
  periodo: string,
  tipo: string,
  valor: number,
  region = "Nacional",
) =>
  row({
    nivel: "Nivel General",
    codigo: "0",
    descripcion: "Nivel general",
    region,
    tipo_de_indicador: tipo,
    periodo,
    valor,
  });

const national = (
  nivel: string,
  codigo: string,
  descripcion: string,
  tipo: string,
  valor: number,
) =>
  row({
    nivel,
    codigo,
    descripcion,
    region: "Nacional",
    tipo_de_indicador: tipo,
    valor,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("INDEC builders", () => {
  it("reads the period window back from the current month", async () => {
    const { periodBefore } = await import("./indec.server");

    expect(periodBefore(new Date("2026-11-12T12:00:00Z"), 7)).toBe("202604");
    expect(periodBefore(new Date("2026-02-28T12:00:00Z"), 7)).toBe("202507");
  });

  it("takes the baskets of the latest month with a total basket, per adult and for household 2", async () => {
    const { buildBaskets } = await import("./indec.server");

    const data = buildBaskets([
      ...basketRows("202608"),
      ...basketRows("202609"),
      row({
        codigo: "CBA",
        tipo_de_indicador: "CBA",
        periodo: "202610",
        valor: 1,
      }),
    ]);

    expect(data?.period).toBe("2026-09-01");

    expect(data?.rows).toEqual([
      {
        id: "CBA",
        perAdult: 239058.22,
        household: 738689.9,
        monthly: 1.7,
        yearly: 40,
      },
      {
        id: "CBT",
        perAdult: 528318.67,
        household: 1632504.69,
        monthly: 1.7,
        yearly: 38.7,
      },
    ]);

    expect(buildBaskets([])).toBeNull();
  });

  it("discounts the IPC's yearly change of the wage month, and leaves the real change blank without it", async () => {
    const { buildWages } = await import("./indec.server");

    const wages = [
      row({
        codigo: "0",
        tipo_de_indicador: "v_m",
        periodo: "202608",
        valor: 2.73,
      }),
      row({
        codigo: "0",
        tipo_de_indicador: "v_ia",
        periodo: "202608",
        valor: 35.61,
      }),
      row({
        codigo: "110",
        tipo_de_indicador: "v_ia",
        periodo: "202608",
        valor: 30.42,
      }),
    ];

    const data = buildWages(wages, [
      general("202608", "v_ia", 33.5),
      general("202609", "v_ia", 33.4),
    ]);

    expect(data?.period).toBe("2026-08-01");
    expect(data?.inflationYearly).toBe(33.5);
    expect(data?.rows[0].realYearly).toBeCloseTo(1.58, 2);
    expect(data?.rows[1]).toMatchObject({
      code: "110",
      monthly: null,
      yearly: 30.42,
    });
    expect(data?.rows[1].realYearly).toBeCloseTo(-2.31, 2);
    expect(data?.rows[3]).toMatchObject({
      code: "200",
      yearly: null,
      realYearly: null,
    });

    expect(buildWages(wages, [])?.rows[0].realYearly).toBeNull();
  });

  it("groups the IPC into general level, divisions, categories in reading order and regions", async () => {
    const { buildPrices } = await import("./indec.server");

    const data = buildPrices([
      general("202609", "v_m", 1.9),
      general("202609", "v_ia", 33.4),
      general("202609", "v_m", 2, "GBA"),
      general("202609", "v_m", 1.4, "Patagonia"),
      national(
        "División",
        "04",
        "Vivienda, agua, electricidad, gas y otros combustibles",
        "v_m",
        3.1,
      ),
      national(
        "División",
        "01",
        "Alimentos y bebidas no alcohólicas",
        "v_ia",
        35.1,
      ),
      national("Categoría", "S", "Servicios", "v_m", 2.4),
      national("Categoría", "N", "Núcleo", "v_m", 1.7),
      general("202608", "v_m", 2.1),
    ]);

    expect(data?.period).toBe("2026-09-01");
    expect(data?.general).toEqual({
      code: "0",
      label: "Nivel general",
      monthly: 1.9,
      yearly: 33.4,
    });

    expect(data?.divisions).toEqual([
      {
        code: "01",
        label: "Alimentos y bebidas no alcohólicas",
        monthly: null,
        yearly: 35.1,
      },
      {
        code: "04",
        label: "Vivienda, agua, electricidad, gas y otros combustibles",
        monthly: 3.1,
        yearly: null,
      },
    ]);

    expect(data?.categories.map((category) => category.label)).toEqual([
      "Núcleo",
      "Servicios",
    ]);
    expect(data?.regions.find((region) => region.code === "GBA")?.monthly).toBe(
      2,
    );
    expect(
      data?.regions.find((region) => region.code === "Cuyo")?.monthly,
    ).toBeNull();
  });
});

describe("INDEC data", () => {
  it("sends the token, reads the three services once per cache period and records the source as fetched", async () => {
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));

        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer token",
        );
        expect(url.searchParams.get("periodo")).toBe("gte.202607");

        if (url.pathname.endsWith("/valorizacion_canastas_cba_cbt"))
          return response(basketRows("202609"));
        if (url.pathname.endsWith("/indice_salarios"))
          return response([row({ periodo: "202608", valor: 2.73 })]);
        if (url.pathname.endsWith("/ipc_nacional"))
          return response([general("202609", "v_m", 1.9)]);

        throw new Error(`unexpected source ${url}`);
      },
    );

    vi.stubGlobal("fetch", fetch);

    const { getIndecData, getIndecSourceHealth } =
      await import("./indec.server");

    const data = await getIndecData({ INDEC_API_TOKEN: "token" });
    await getIndecData({ INDEC_API_TOKEN: "token" });

    expect(data.baskets?.period).toBe("2026-09-01");
    expect(data.wages?.period).toBe("2026-08-01");
    expect(data.prices?.period).toBe("2026-09-01");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(getIndecSourceHealth().status).toBe("fetched");
  });

  it("blanks only the failing service, and fails a response at the row limit rather than showing a truncated one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.includes("/valorizacion_canastas_cba_cbt"))
          return response({ message: "x" }, 500);
        if (url.includes("/indice_salarios"))
          return response(Array.from({ length: 1000 }, () => row({})));

        return response([general("202609", "v_m", 1.9), { codigo: 1 }]);
      }),
    );

    const { getIndecData, getIndecSourceHealth } =
      await import("./indec.server");

    const data = await getIndecData({ INDEC_API_TOKEN: "token" });

    expect(data.baskets).toBeNull();
    expect(data.wages).toBeNull();
    expect(data.prices?.general.monthly).toBe(1.9);
    expect(getIndecSourceHealth().status).toBe("partial");
  });

  it("calls nothing without a token and reports the source as failed", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const { getIndecData, getIndecSourceHealth } =
      await import("./indec.server");

    expect(await getIndecData({})).toEqual({
      baskets: null,
      wages: null,
      prices: null,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(getIndecSourceHealth().status).toBe("failed");
  });
});

const povertyRow = (
  periodo: string,
  personas: number,
  observaciones: string | null = null,
) => ({
  area_geografica_nom: "T_31_A",
  periodo,
  tasa_pobreza_personas: personas,
  tasa_pobreza_hogares: personas - 8,
  tasa_indigencia_personas: personas / 5,
  tasa_indigencia_hogares: personas / 6,
  observaciones,
});

describe("INDEC poverty", () => {
  it("orders the semesters, separates the provisional mark from INDEC's other observations and keeps the first of a repeated semester", async () => {
    const { buildPoverty } = await import("./indec.server");

    const data = buildPoverty([
      povertyRow("20261S", 32.3, "Dato provisorio"),
      povertyRow("20192S", 35.5, "No incluye el aglomerado Gran Resistencia."),
      povertyRow("20162S", 30.3),
      povertyRow("20162S", 99),
    ]);

    expect(data?.points.map((point) => point.period)).toEqual([
      "2016-S2",
      "2019-S2",
      "2026-S1",
    ]);

    expect(data?.points[0]).toEqual({
      period: "2016-S2",
      personas: { poverty: 30.3, indigence: 30.3 / 5 },
      hogares: { poverty: 30.3 - 8, indigence: 30.3 / 6 },
      note: null,
      provisional: false,
    });

    expect(data?.points[1]).toMatchObject({
      note: "No incluye el aglomerado Gran Resistencia.",
      provisional: false,
    });
    expect(data?.points[2]).toMatchObject({ note: null, provisional: true });
    expect(buildPoverty([])).toBeNull();
  });

  it("reads the whole series of the 31 agglomerations without the monthly window, and drops malformed rows", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));

      expect(url.pathname).toBe("/v1/pobreza_eph");
      expect(url.searchParams.get("area_geografica_nom")).toBe("eq.T_31_A");
      expect(url.searchParams.get("periodo")).toBeNull();

      return response([
        povertyRow("20252S", 28.2),
        povertyRow("20261S", 32.3),
        { ...povertyRow("20262S", 30), tasa_pobreza_personas: 130 },
        { ...povertyRow("2027", 30) },
      ]);
    });

    vi.stubGlobal("fetch", fetch);

    const { getPovertyData, getIndecSourceHealth } =
      await import("./indec.server");

    const data = await getPovertyData({ INDEC_API_TOKEN: "token" });
    await getPovertyData({ INDEC_API_TOKEN: "token" });

    expect(data?.points.map((point) => point.period)).toEqual([
      "2025-S2",
      "2026-S1",
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getIndecSourceHealth().status).toBe("fetched");
  });

  it("is unavailable when the service fails or there is no token", async () => {
    const fetch = vi.fn(async () => response({ message: "x" }, 503));
    vi.stubGlobal("fetch", fetch);

    const { getPovertyData, getIndecSourceHealth } =
      await import("./indec.server");

    expect(await getPovertyData({ INDEC_API_TOKEN: "token" })).toBeNull();
    expect(await getPovertyData({})).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getIndecSourceHealth().status).toBe("failed");
  });
});

describe("INDEC saved copies", () => {
  const copiesAt = async (fetchedAt: string) => {
    const { localD1 } = await import("./local-d1.test-helper");
    const { writeSnapshot } = await import("./source-snapshots.server");
    const { db } = localD1("0010_source_snapshots.sql");

    const copies: [string, unknown[]][] = [
      ["valorizacion_canastas_cba_cbt", basketRows("202609")],
      ["indice_salarios", [row({ periodo: "202608", valor: 2.73 })]],
      ["ipc_nacional", [general("202609", "v_m", 1.9)]],
      ["pobreza_eph", [povertyRow("20261S", 32.3)]],
    ];

    for (const [service, rows] of copies)
      await writeSnapshot(db, `indec:${service}@1`, { rows, fetchedAt });

    return db;
  };

  it("serves the copies without asking INDEC, even half a day later and without a token", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const db = await copiesAt("2026-11-11T20:00:00.000Z");

    const { getIndecData, getPovertyData, getIndecSourceHealth } =
      await import("./indec.server");

    const data = await getIndecData({ DB: db });

    expect(data.baskets?.period).toBe("2026-09-01");
    expect(data.wages?.period).toBe("2026-08-01");
    expect(data.prices?.general.monthly).toBe(1.9);
    expect((await getPovertyData({ DB: db }))?.points).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();

    expect(getIndecSourceHealth()).toMatchObject({
      status: "cached",
      lastSuccessfulFetchAt: "2026-11-11T20:00:00.000Z",
    });
  });

  it("reports copies that missed the daily refresh as stale, so an expired token shows in the health instead of blanking the page", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const db = await copiesAt("2026-11-10T06:05:00.000Z");

    const { getIndecData, getIndecSourceHealth } =
      await import("./indec.server");

    const data = await getIndecData({ INDEC_API_TOKEN: "expired", DB: db });

    expect(data.baskets?.period).toBe("2026-09-01");
    expect(fetch).not.toHaveBeenCalled();

    expect(getIndecSourceHealth()).toMatchObject({
      status: "stale",
      lastSuccessfulFetchAt: "2026-11-10T06:05:00.000Z",
    });
  });
});
