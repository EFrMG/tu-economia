import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INDICATOR_DEFINITIONS } from "./indicators";

const bcraBase = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";

const catalogueUrl = `${bcraBase}?categoria=Principales+Variables&limit=3000`;

const riskUrl =
  "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo";

const response = (body: unknown, status = 200) =>
  Response.json(body, { status });

const catalogueRow = (idVariable: number, fecha: string, valor: number) => ({
  idVariable,
  descripcion: `Serie ${idVariable}\u00a0`,
  categoria: "Principales Variables",
  tipoSerie: "Saldos",
  periodicidad: "D",
  unidadExpresion: "En porcentaje",
  moneda: "ML",
  primerFechaInformada: "2000-01-03",
  ultFechaInformada: fecha,
  ultValorInformado: valor,
});

/** One row per BCRA variable the cards show, valued at its own id so a mismatch is visible. */
const catalogue = (
  rows = bcraVariables.map((id) => catalogueRow(id, "2026-11-05", id)),
) => ({
  status: 200,
  metadata: { resultset: { count: rows.length, offset: 0, limit: 3000 } },
  results: rows,
});

const bcraVariables = INDICATOR_DEFINITIONS.flatMap(({ bcraVariable }) =>
  bcraVariable === null ? [] : [bcraVariable],
);

const seriesPage = (
  idVariable: number,
  count: number,
  detalle: { fecha: string; valor: number }[],
) => ({
  status: 200,
  metadata: { resultset: { count, offset: 0, limit: 3000 } },
  results: [{ idVariable, detalle }],
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

describe("economic indicators", () => {
  it("reads every BCRA card from one catalogue request and country risk from ArgentinaDatos", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === catalogueUrl) return response(catalogue());
      if (url === riskUrl) return response({ fecha: "2026-11-11", valor: 640 });

      throw new Error(`unexpected source ${url}`);
    });

    vi.stubGlobal("fetch", fetch);

    const { getIndicators, getIndicatorSourceHealth } =
      await import("./indicators.server");

    const results = await getIndicators();

    expect(results.map((result) => result.id)).toEqual(
      INDICATOR_DEFINITIONS.map((definition) => definition.id),
    );

    for (const definition of INDICATOR_DEFINITIONS) {
      const point = results.find(
        (result) => result.id === definition.id,
      )?.point;

      expect(point).toEqual(
        definition.bcraVariable === null
          ? { date: "2026-11-11", value: 640 }
          : { date: "2026-11-05", value: definition.bcraVariable },
      );
    }

    expect(fetch).toHaveBeenCalledTimes(2);

    expect(getIndicatorSourceHealth()).toMatchObject({
      bcra: { status: "fetched" },
      countryRisk: { status: "fetched" },
    });
  });

  it("blanks only the card whose catalogue row is missing or malformed", async () => {
    const rows = bcraVariables
      .filter((id) => id !== 31)
      .map((id) =>
        id === 27
          ? { ...catalogueRow(id, "not-a-date", 1.9) }
          : catalogueRow(id, "2026-11-05", id),
      );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input) === riskUrl
          ? response({ fecha: "2026-11-11", valor: 640 })
          : response(catalogue(rows)),
      ),
    );

    const { getIndicators } = await import("./indicators.server");

    const byId = new Map(
      (await getIndicators()).map((result) => [result.id, result.point]),
    );

    expect(byId.get("inflation-monthly")).toBeNull();
    expect(byId.get("uva")).toBeNull();
    expect(byId.get("inflation-yearly")).toEqual({
      date: "2026-11-05",
      value: 28,
    });
    expect(byId.get("country-risk")).toEqual({
      date: "2026-11-11",
      value: 640,
    });
  });

  it("keeps country risk visible when the BCRA fails, and the reverse", async () => {
    let bcraUp = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === riskUrl)
          return bcraUp
            ? response({}, 503)
            : response({ fecha: "2026-11-11", valor: 640 });

        return bcraUp ? response(catalogue()) : response({}, 503);
      }),
    );

    const { getIndicators, getIndicatorSourceHealth } =
      await import("./indicators.server");

    const first = await getIndicators();
    expect(first.filter((result) => result.point !== null)).toEqual([
      { id: "country-risk", point: { date: "2026-11-11", value: 640 } },
    ]);

    expect(getIndicatorSourceHealth().bcra.status).toBe("failed");

    bcraUp = true;
    await vi.advanceTimersByTimeAsync(30 * 60_000 + 1);

    const second = await getIndicators();
    expect(
      second.find((result) => result.id === "country-risk")?.point,
    ).toBeNull();
    expect(second.find((result) => result.id === "uva")?.point?.value).toBe(31);
  });

  it("shares concurrent work and backs off a failed catalogue before retrying it", async () => {
    let catalogueAttempts = 0;

    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === riskUrl)
        return response({ fecha: "2026-11-11", valor: 640 });

      return catalogueAttempts++ === 0
        ? response({}, 503)
        : response(catalogue());
    });

    vi.stubGlobal("fetch", fetch);
    const { getIndicators } = await import("./indicators.server");

    const [first, concurrent] = await Promise.all([
      getIndicators(),
      getIndicators(),
    ]);

    expect(first[0].point).toBeNull();
    expect(concurrent[0].point).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);

    // Inside the failure backoff the catalogue is not requested again.
    await getIndicators();
    expect(fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);

    const retried = await getIndicators();
    expect(retried[0].point?.value).toBe(27);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("pages a long history in parallel, oldest first, without repeated dates", async () => {
    const urls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        urls.push(url.pathname + url.search);

        const offset = Number(url.searchParams.get("offset"));

        // Newest first, as the BCRA serves it; the second page repeats the first page's last date.
        return response(
          seriesPage(
            12,
            6_577,
            offset === 0
              ? [
                  { fecha: "2026-11-05", valor: 21.62 },
                  { fecha: "2026-11-04", valor: 21.18 },
                ]
              : offset === 3_000
                ? [
                    { fecha: "2026-11-04", valor: 21.18 },
                    { fecha: "2010-01-04", valor: 9.5 },
                  ]
                : [{ fecha: "2000-01-03", valor: 8.15 }],
          ),
        );
      }),
    );

    const { getDepositRateHistory } = await import("./indicators.server");

    expect(await getDepositRateHistory()).toEqual([
      { date: "2000-01-03", value: 8.15 },
      { date: "2010-01-04", value: 9.5 },
      { date: "2026-11-04", value: 21.18 },
      { date: "2026-11-05", value: 21.62 },
    ]);

    expect(urls).toEqual([
      "/estadisticas/v4.0/monetarias/12?limit=3000&offset=0&desde=2000-01-01",
      "/estadisticas/v4.0/monetarias/12?limit=3000&offset=3000&desde=2000-01-01",
      "/estadisticas/v4.0/monetarias/12?limit=3000&offset=6000&desde=2000-01-01",
    ]);
  });

  it("reads the full monthly inflation history in one request", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request) =>
      response(
        seriesPage(27, 2, [
          { fecha: "2026-09-30", valor: 1.9 },
          { fecha: "2026-08-31", valor: 1.7 },
        ]),
      ),
    );

    vi.stubGlobal("fetch", fetch);

    const { getMonthlyInflationHistory } = await import("./indicators.server");

    expect(await getMonthlyInflationHistory()).toEqual([
      { date: "2026-08-31", value: 1.7 },
      { date: "2026-09-30", value: 1.9 },
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      `${bcraBase}/27?limit=3000&offset=0`,
    );
  });

  it("fails rather than truncates a history beyond the page budget, and rejects another variable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes("/27?")
          ? response(seriesPage(28, 2, [{ fecha: "2026-09-30", valor: 33.4 }]))
          : response(
              seriesPage(12, 12_001, [{ fecha: "2026-11-05", valor: 21.62 }]),
            ),
      ),
    );

    const { getDepositRateHistory, getMonthlyInflationHistory } =
      await import("./indicators.server");

    await expect(getDepositRateHistory()).rejects.toThrow("5 páginas");
    await expect(getMonthlyInflationHistory()).rejects.toThrow(
      "variable pedida",
    );
  });
});
