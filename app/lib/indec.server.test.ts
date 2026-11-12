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

    const data = await getIndecData("token");
    await getIndecData("token");

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

    const data = await getIndecData("token");

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

    expect(await getIndecData(undefined)).toEqual({
      baskets: null,
      wages: null,
      prices: null,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(getIndecSourceHealth().status).toBe("failed");
  });
});
