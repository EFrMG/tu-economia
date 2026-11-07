import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PriceLocation } from "~/lib/prices";

vi.mock("~/lib/price-basket.generated.json", () => ({
  default: {
    archive: "sepa_jueves.zip",
    sourceDate: "2026-10-29",
    searchIndex: "/precios/catalogo-2026-10-29.json",
    defaults: ["huevos"],
    categories: [
      {
        id: "huevos",
        section: "Almacén",
        kind: "group",
        name: "Huevos blancos",
        unit: "docena",
      },
      {
        id: "papa",
        section: "Frescos",
        kind: "fresh",
        name: "Papa",
        unit: "kg",
      },
    ],
  },
}));

vi.mock("~/lib/price-basket-server.generated.json", () => ({
  default: {
    sourceDate: "2026-10-29",
    branches: {
      caba: ["10-1-6", "10-3-189", "9-1-10", "9-2-2", "15-1-454"],
      ushuaia: [],
    },
    groups: {
      huevos: {
        unit: "docena",
        members: [
          { gtin: "7798108347105", per: 2.5, commerces: ["10"] },
          { gtin: "7798064180143", per: 1, commerces: ["15"] },
          { gtin: "7799120006087", per: 1, commerces: ["11"] },
        ],
      },
      azucar: {
        unit: "kg",
        members: [
          { gtin: "7790000000011", per: 1, commerces: ["9"] },
          { gtin: "7790000000012", per: 2, commerces: ["15"] },
        ],
      },
    },
    archive: {
      banners: { caba: ["9-1", "9-2", "15-1"] },
      prices: {
        "7790000000021": {
          "9-1": 6890,
          "9-2": 7150,
          "12-1": 6000,
          "15-1": 6500,
        },
        "7790000000011": { "9-1": 2000, "15-1": 2100 },
        "7790000000012": { "15-1": 3800 },
      },
    },
    fresh: {
      caba: {
        papa: [
          { banner: "10-1", price: 3990 },
          { banner: "10-3", price: 4490 },
          { banner: "15-1", price: 4775 },
        ],
      },
    },
  },
}));

const caba: PriceLocation = {
  id: "caba",
  label: "Buenos Aires (CABA)",
  lat: -34.6037,
  lng: -58.3816,
};

const ushuaia: PriceLocation = {
  id: "ushuaia",
  label: "Ushuaia, Tierra del Fuego",
  lat: -54.8019,
  lng: -68.303,
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const branch = (
  comercioId: string,
  banderaId: string,
  banderaDescripcion: string,
  precioLista: number | string,
) => ({
  comercioId,
  banderaId,
  banderaDescripcion,
  preciosProducto: { precioLista },
});

const missing = (comercioId: string, banderaId: string) => ({
  comercioId,
  banderaId,
  message: "La sucursal no contiene el producto.",
});

/** Prices by GTIN; any other product answers with branches that do not carry it. */
const quotesByGtin: Record<string, unknown[]> = {
  "7790060023684": [
    branch("10", "1", "Hipermercado Carrefour", 7200),
    branch("10", "3", "Express", "6990.00"),
    branch("9", "1", "Vea", 6890),
    branch("9", "2", "Disco", 7150),
    missing("15", "1"),
  ],
  "7798108347105": [branch("10", "1", "Hipermercado Carrefour", 7590)],
  "7798064180143": [branch("15", "1", "Supermercados DIA", 4390)],
};

function priceFetch() {
  return vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = new URL(String(input));
    const gtin = url.searchParams.get("id_producto")!;

    return jsonResponse({
      status: 200,
      sucursales: quotesByGtin[gtin] ?? [missing("10", "1")],
    });
  });
}

const requestedGtins = (fetch: ReturnType<typeof priceFetch>) =>
  fetch.mock.calls.map(([url]) =>
    new URL(String(url)).searchParams.get("id_producto"),
  );

async function loadModule() {
  return import("~/lib/prices.server");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T12:00:00.000Z"));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getItemPrices", () => {
  it("asks for a GTIN at the location's generated branches and returns each chain's cheapest list price", async () => {
    const fetch = priceFetch();
    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    const result = await getItemPrices("7790060023684", caba);

    expect(result).toEqual({
      id: "7790060023684",
      chains: [
        { chain: "Vea", price: 6890, branches: 1 },
        { chain: "Carrefour", price: 6990, branches: 2 },
        { chain: "Disco", price: 7150, branches: 1 },
      ],
      unit: null,
      snapshot: false,
    });

    const [url, init] = fetch.mock.calls[0];
    const params = new URL(String(url)).searchParams;

    expect(params.get("array_sucursales")).toBe(
      "10-1-6,10-3-189,9-1-10,9-2-2,15-1-454",
    );

    expect(params.get("limit")).toBe("5");
    expect(new Headers(init?.headers).get("x-api-key")).toBeTruthy();

    // The API's CDN blocks requests without a User-Agent, as a Worker's fetch sends them.
    expect(new Headers(init?.headers).get("user-agent")).toMatch(
      /^TuEconomia\/1\.0 \(\+https?:\/\/.+\)$/,
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("prices a group per unit, requesting only members sold by a nearby commerce", async () => {
    const fetch = priceFetch();
    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    const result = await getItemPrices("huevos", caba);

    // Changomas (commerce 11) has no branch near CABA in the mocked data, so its member is never requested.
    expect(requestedGtins(fetch).sort()).toEqual([
      "7798064180143",
      "7798108347105",
    ]);

    expect(result).toEqual({
      id: "huevos",
      chains: [
        { chain: "Carrefour", price: 3036, branches: 1 },
        { chain: "DIA", price: 4390, branches: 1 },
      ],
      unit: "docena",
      snapshot: false,
    });
  });

  it("keeps the members that answered when another member fails, and reports a group as unavailable only when all fail", async () => {
    const fetch = priceFetch();

    fetch.mockImplementation(async (input: string | URL) => {
      const gtin = new URL(String(input)).searchParams.get("id_producto")!;
      if (gtin === "7798108347105") throw new Error("temporary outage");

      return jsonResponse({ status: 200, sucursales: quotesByGtin[gtin] });
    });

    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    await expect(getItemPrices("huevos", caba)).resolves.toMatchObject({
      chains: [{ chain: "DIA", price: 4390 }],
    });

    fetch.mockRejectedValue(new Error("down"));
    vi.advanceTimersByTime(30 * 60_000 + 1);

    await expect(getItemPrices("huevos", caba)).resolves.toMatchObject({
      chains: null,
      unit: "docena",
    });
  });

  it("falls back to archive prices for a basket product when the live request fails, using only chains near the location", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const { getItemPrices } = await loadModule();

    await expect(getItemPrices("7790000000021", caba)).resolves.toEqual({
      id: "7790000000021",
      chains: [
        { chain: "DIA", price: 6500, branches: 1 },
        { chain: "Vea", price: 6890, branches: 1 },
        { chain: "Disco", price: 7150, branches: 1 },
      ],
      unit: null,
      snapshot: true,
    });
  });

  it("still rejects a product the archive does not hold, and never mixes archive prices into a live answer", async () => {
    const fetch = priceFetch();
    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    await expect(getItemPrices("7790060023684", caba)).resolves.toMatchObject({
      snapshot: false,
      chains: expect.arrayContaining([
        { chain: "Vea", price: 6890, branches: 1 },
      ]),
    });

    fetch.mockRejectedValue(new Error("down"));
    vi.advanceTimersByTime(30 * 60_000 + 1);

    await expect(getItemPrices("7790060023684", caba)).rejects.toThrow("down");
  });

  it("falls back to each chain's cheapest archive member per unit when every live member fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const { getItemPrices } = await loadModule();

    await expect(getItemPrices("azucar", caba)).resolves.toEqual({
      id: "azucar",
      chains: [
        { chain: "DIA", price: 1900, branches: 2 },
        { chain: "Vea", price: 2000, branches: 1 },
      ],
      unit: "kg",
      snapshot: true,
    });
  });

  it("serves fresh food from the archive snapshot without any upstream call", async () => {
    const fetch = priceFetch();
    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    await expect(getItemPrices("papa", caba)).resolves.toEqual({
      id: "papa",
      chains: [
        { chain: "Carrefour", price: 3990, branches: 2 },
        { chain: "DIA", price: 4775, branches: 1 },
      ],
      unit: "kg",
      snapshot: true,
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns no chains without calling upstream when a location has no nearby branches", async () => {
    const fetch = priceFetch();
    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    await expect(
      getItemPrices("7790060023684", ushuaia),
    ).resolves.toMatchObject({ chains: [] });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares one upstream call per GTIN and location between concurrent requests and groups, until the TTL expires", async () => {
    const fetch = priceFetch();
    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    await Promise.all([
      getItemPrices("7798064180143", caba),
      getItemPrices("7798064180143", caba),
      getItemPrices("huevos", caba),
    ]);

    expect(requestedGtins(fetch).sort()).toEqual([
      "7798064180143",
      "7798108347105",
    ]);

    vi.advanceTimersByTime(30 * 60_000 + 1);
    await getItemPrices("7798064180143", caba);

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("evicts a rejected request so the next load retries it", async () => {
    let attempts = 0;

    const fetch = vi.fn(async () => {
      if (attempts++ === 0) throw new Error("temporary outage");

      return jsonResponse({
        status: 200,
        sucursales: quotesByGtin["7790060023684"],
      });
    });

    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    await expect(getItemPrices("7790060023684", caba)).rejects.toThrow();

    // Inside the failure backoff the same failure is served without another upstream request.
    await expect(getItemPrices("7790060023684", caba)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(getItemPrices("7790060023684", caba)).resolves.toMatchObject({
      chains: [{ chain: "Vea" }, { chain: "Carrefour" }, { chain: "Disco" }],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects payloads that do not match the schema and upstream error envelopes", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ status: 200, sucursales: "none" }),
    );

    vi.stubGlobal("fetch", fetch);
    const { getItemPrices } = await loadModule();

    await expect(getItemPrices("7790060023684", caba)).rejects.toThrow();

    fetch.mockResolvedValue(
      jsonResponse({ status: 500, errorDescription: "Internal Error" }),
    );

    await expect(getItemPrices("7790060023685", caba)).rejects.toThrow();
  });

  it("times out an unresponsive upstream request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    const { getItemPrices } = await loadModule();

    const outcome = expect(
      getItemPrices("7790060023684", caba),
    ).rejects.toThrow("La fuente agotó el tiempo de espera.");

    await vi.advanceTimersByTimeAsync(8_000);
    await outcome;
  });

  it("rejects ids that are neither a GTIN nor a basket group or fresh item", async () => {
    vi.stubGlobal("fetch", priceFetch());
    const { getItemPrices } = await loadModule();

    await expect(getItemPrices("leche-entera", caba)).rejects.toThrow(
      "Producto desconocido.",
    );
  });
});
