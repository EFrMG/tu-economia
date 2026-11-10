import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RATES_URL = "https://dolarapi.com/v1/dolares";
const casas = ["blue", "oficial", "bolsa", "contadoconliqui", "cripto"];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function liveRates() {
  return casas.map((casa, index) => ({
    casa,
    nombre: casa.toUpperCase(),
    compra: 100 + index,
    venta: 110 + index * 10,
    fechaActualizacion: "2026-01-15T15:30:00.000Z",
  }));
}

function historyFor(casa: string) {
  const venta = liveRates().find((rate) => rate.casa === casa)!.venta;
  return [
    { fecha: "2026-01-13", venta: venta - 20 },
    { fecha: "2026-01-14", venta: venta - 10 },
    { fecha: "2026-01-15", venta },
  ];
}

function successfulFetch() {
  return vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url === RATES_URL) return jsonResponse(liveRates());

    const casa = url.slice(url.lastIndexOf("/") + 1);
    return jsonResponse(historyFor(casa));
  });
}

async function loadModule() {
  return import("~/lib/exchange-rates.server");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T16:00:00.000Z"));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getDashboardRates", () => {
  it("loads historical series without requesting live rates", async () => {
    const fetch = successfulFetch();
    vi.stubGlobal("fetch", fetch);
    const { getDashboardHistory } = await loadModule();

    const history = await getDashboardHistory();

    expect(history.historicalChart).toHaveLength(3);
    expect(history.historicalFailedSeries).toEqual([]);

    expect(fetch.mock.calls.map(([url]) => String(url))).not.toContain(
      RATES_URL,
    );
  });

  it("validates, normalizes, and derives histories, variation, and gaps", async () => {
    const fetch = successfulFetch();
    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    const result = await getDashboardRates();

    expect(result.highlight).toMatchObject({
      casa: "blue",
      compra: 100,
      venta: 110,
      history: [90, 100, 110],
      changePct: 10,
    });

    expect(result.grid.map((rate) => rate.casa)).toEqual([
      "oficial",
      "bolsa",
      "contadoconliqui",
      "cripto",
    ]);

    expect(result.brecha).toMatchObject({
      oficial: 0,
      blue: -8.333333333333332,
      bolsa: 8.333333333333332,
    });

    expect(result.updatedAt).toBe("15/01/2026, 12:30");

    expect(result.freshness).toEqual({
      status: "current",
      lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      lastSuccessfulFetchAtLabel: "15/01/2026, 13:00",
    });
  });

  it("records actual fetch times separately from cached source data", async () => {
    vi.stubGlobal("fetch", successfulFetch());

    const { getDashboardRates, getExchangeRateSourceHealth } =
      await loadModule();

    await getDashboardRates();

    expect(getExchangeRateSourceHealth()).toEqual({
      live: {
        status: "fetched",
        lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
        lastFailureAt: null,
      },
      history: {
        status: "fetched",
        lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
        lastFailureAt: null,
      },
    });

    await getDashboardRates();

    expect(getExchangeRateSourceHealth()).toMatchObject({
      live: {
        status: "cached",
        lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      },
      history: {
        status: "cached",
        lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      },
    });
  });

  it("returns a gateway response when live data does not match the schema", async () => {
    const fetch = vi.fn(async () => jsonResponse([{ casa: "blue" }]));
    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    await expect(getDashboardRates()).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("starts live and historical requests together so one slow source does not delay the other", async () => {
    let finishLive!: (value: Response) => void;

    const fetch = vi.fn((input: string | URL) => {
      if (String(input) === RATES_URL)
        return new Promise<Response>((resolve) => {
          finishLive = resolve;
        });

      return Promise.resolve(
        jsonResponse(historyFor(String(input).split("/").at(-1)!)),
      );
    });

    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    const pending = getDashboardRates();
    expect(fetch).toHaveBeenCalledTimes(6);
    finishLive(jsonResponse(liveRates()));

    await expect(pending).resolves.toMatchObject({
      highlight: { casa: "blue" },
    });
  });

  it("checks historical sources even when live quotations are unavailable", async () => {
    const fetch = successfulFetch();

    fetch.mockImplementation(async (input: string | URL) => {
      if (String(input) === RATES_URL) return jsonResponse([{ casa: "blue" }]);

      return jsonResponse(historyFor(String(input).split("/").at(-1)!));
    });

    vi.stubGlobal("fetch", fetch);
    const { checkExchangeRateSources } = await loadModule();

    const health = await checkExchangeRateSources();

    expect(health.live.status).toBe("failed");

    expect(health.history).toMatchObject({
      status: "fetched",
      lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
    });

    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("keeps live data when a history response is invalid", async () => {
    const fetch = successfulFetch();

    fetch.mockImplementation(async (input: string | URL) => {
      if (String(input).endsWith("/blue")) return jsonResponse([{ fecha: 1 }]);
      if (String(input) === RATES_URL) return jsonResponse(liveRates());

      return jsonResponse(historyFor(String(input).split("/").at(-1)!));
    });

    vi.stubGlobal("fetch", fetch);

    const { getDashboardRates, getExchangeRateSourceHealth } =
      await loadModule();

    const result = await getDashboardRates();

    expect(result.highlight.history).toEqual([]);
    expect(result.highlight.changePct).toBeNull();

    expect(getExchangeRateSourceHealth().history).toMatchObject({
      status: "partial",
      lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      lastFailureAt: "2026-01-15T16:00:00.000Z",
    });
  });

  it("drops missing closes and limits the sparkline to 30 values", async () => {
    const fetch = successfulFetch();

    fetch.mockImplementation(async (input: string | URL) => {
      if (String(input).endsWith("/blue")) {
        const points = Array.from({ length: 32 }, (_, index) => ({
          fecha: new Date(Date.UTC(2025, 11, 15 + index))
            .toISOString()
            .slice(0, 10),
          venta: index === 0 ? null : 100 + index,
        }));

        return jsonResponse(points);
      }

      if (String(input) === RATES_URL) return jsonResponse(liveRates());

      return jsonResponse(historyFor(String(input).split("/").at(-1)!));
    });

    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    const result = await getDashboardRates();

    expect(result.highlight.history).toHaveLength(30);
    expect(result.highlight.history[0]).toBe(102);
    expect(result.highlight.history.at(-1)).toBe(131);
  });

  it("returns chronologically merged Blue and Oficial chart data with missing closes as null", async () => {
    const fetch = successfulFetch();

    fetch.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url === RATES_URL) return jsonResponse(liveRates());

      if (url.endsWith("/blue")) {
        return jsonResponse([
          { fecha: "2026-01-15", venta: 140 },
          { fecha: "2026-01-13", venta: 120 },
        ]);
      }

      if (url.endsWith("/oficial")) {
        return jsonResponse([
          { fecha: "2026-01-14", venta: 111 },
          { fecha: "2026-01-15", venta: 115 },
        ]);
      }

      return jsonResponse(historyFor(url.split("/").at(-1)!));
    });

    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    const result = await getDashboardRates();

    expect(result.historicalChart).toEqual([
      { fecha: "2026-01-13", blue: 120, oficial: null },
      { fecha: "2026-01-14", blue: null, oficial: 111 },
      { fecha: "2026-01-15", blue: 140, oficial: 115 },
    ]);
  });

  it("uses the Argentine date when UTC has already moved to the next day", async () => {
    vi.setSystemTime(new Date("2026-01-16T01:00:00.000Z"));
    vi.stubGlobal("fetch", successfulFetch());
    const { getDashboardRates } = await loadModule();

    const result = await getDashboardRates();

    expect(result.highlight.changePct).toBe(10);
  });

  it("shares concurrent live and history requests until their TTLs expire", async () => {
    const fetch = successfulFetch();
    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    await Promise.all([getDashboardRates(), getDashboardRates()]);
    expect(fetch).toHaveBeenCalledTimes(6);

    expect(
      fetch.mock.calls.filter(([url]) => String(url) === RATES_URL),
    ).toHaveLength(1);

    vi.advanceTimersByTime(60_001);
    await getDashboardRates();
    expect(fetch).toHaveBeenCalledTimes(7);

    expect(
      fetch.mock.calls.filter(([url]) => String(url) === RATES_URL),
    ).toHaveLength(2);
  });

  it("refreshes an incomplete live response after five seconds", async () => {
    const fetch = successfulFetch();
    let liveAttempts = 0;

    fetch.mockImplementation(async (input: string | URL) => {
      if (String(input) === RATES_URL)
        return jsonResponse(
          liveAttempts++ === 0 ? liveRates().slice(0, -1) : liveRates(),
        );

      return jsonResponse(historyFor(String(input).split("/").at(-1)!));
    });

    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    expect(
      (await getDashboardRates()).grid.map((rate) => rate.casa),
    ).not.toContain("cripto");

    vi.advanceTimersByTime(5_001);

    expect((await getDashboardRates()).grid.map((rate) => rate.casa)).toContain(
      "cripto",
    );

    expect(
      fetch.mock.calls.filter(([url]) => String(url) === RATES_URL),
    ).toHaveLength(2);
  });

  it("evicts a rejected live request so a later request can retry", async () => {
    let liveAttempts = 0;

    const fetch = vi.fn(async (input: string | URL) => {
      if (String(input) === RATES_URL) {
        if (liveAttempts++ === 0) throw new Error("temporary outage");

        return jsonResponse(liveRates());
      }

      return jsonResponse(historyFor(String(input).split("/").at(-1)!));
    });

    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    await expect(getDashboardRates()).rejects.toMatchObject({ status: 502 });

    // Inside the failure backoff the same failure is served without another upstream request.
    await expect(getDashboardRates()).rejects.toMatchObject({ status: 502 });
    expect(liveAttempts).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(getDashboardRates()).resolves.toMatchObject({
      highlight: { casa: "blue" },
    });

    expect(
      fetch.mock.calls.filter(([url]) => String(url) === RATES_URL),
    ).toHaveLength(2);
  });

  it("times out an unresponsive live request and retries it on the next load", async () => {
    let liveAttempts = 0;

    const fetch = vi.fn((input: string | URL) => {
      if (String(input) === RATES_URL && liveAttempts++ === 0)
        return new Promise<Response>(() => undefined);

      if (String(input) === RATES_URL)
        return Promise.resolve(jsonResponse(liveRates()));

      return Promise.resolve(
        jsonResponse(historyFor(String(input).split("/").at(-1)!)),
      );
    });

    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    const outcome = expect(getDashboardRates()).rejects.toMatchObject({
      status: 502,
    });

    await vi.advanceTimersByTimeAsync(8_000);
    await outcome;

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(getDashboardRates()).resolves.toMatchObject({
      highlight: { casa: "blue" },
    });

    expect(liveAttempts).toBe(2);
  });

  it("serves a last-known-good live snapshot for no more than 15 minutes", async () => {
    const fetch = successfulFetch();
    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    const initial = await getDashboardRates();

    fetch.mockImplementation(async (input: string | URL) => {
      if (String(input) === RATES_URL) throw new Error("temporary outage");

      return jsonResponse(historyFor(String(input).split("/").at(-1)!));
    });

    vi.advanceTimersByTime(60_001);
    const firstFallback = await getDashboardRates();
    expect(firstFallback.highlight.venta).toBe(initial.highlight.venta);

    expect(firstFallback.freshness).toEqual({
      status: "stale",
      lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      lastSuccessfulFetchAtLabel: "15/01/2026, 13:00",
    });

    expect(
      (await loadModule()).getExchangeRateSourceHealth().live,
    ).toMatchObject({
      status: "stale",
      lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      lastFailureAt: "2026-01-15T16:01:00.001Z",
    });

    vi.advanceTimersByTime(839_998);

    await expect(getDashboardRates()).resolves.toMatchObject({
      freshness: {
        status: "stale",
        lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      },
    });

    vi.advanceTimersByTime(2);
    await expect(getDashboardRates()).rejects.toMatchObject({ status: 502 });
  });

  it("does not replace a usable snapshot when a valid payload omits Blue, then recovers", async () => {
    const fetch = successfulFetch();
    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    const initial = await getDashboardRates();

    fetch.mockImplementation(async (input: string | URL) => {
      if (String(input) === RATES_URL) {
        return jsonResponse(liveRates().filter((rate) => rate.casa !== "blue"));
      }

      return jsonResponse(historyFor(String(input).split("/").at(-1)!));
    });

    vi.advanceTimersByTime(60_001);

    await expect(getDashboardRates()).resolves.toMatchObject({
      highlight: { venta: initial.highlight.venta },
      freshness: {
        status: "stale",
        lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      },
    });

    const recovered = liveRates().map((rate) =>
      rate.casa === "blue" ? { ...rate, venta: 999 } : rate,
    );

    fetch.mockImplementation(async (input: string | URL) => {
      if (String(input) === RATES_URL) return jsonResponse(recovered);

      return jsonResponse(historyFor(String(input).split("/").at(-1)!));
    });

    await vi.advanceTimersByTimeAsync(5_000);

    const result = await getDashboardRates();

    expect(result).toMatchObject({
      highlight: { venta: 999 },
      freshness: {
        status: "current",
        lastSuccessfulFetchAt: "2026-01-15T16:01:05.001Z",
      },
    });
  });

  it("passes abort signals to every upstream request and clears completed deadlines", async () => {
    const fetch = successfulFetch();
    vi.stubGlobal("fetch", fetch);
    const { getDashboardRates } = await loadModule();

    await getDashboardRates();

    expect(fetch).toHaveBeenCalledTimes(6);
    expect(vi.getTimerCount()).toBe(0);

    for (const [, init] of fetch.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

describe("getLiveRates", () => {
  it("returns the live quotations with their times and requests no history", async () => {
    const fetch = successfulFetch();
    vi.stubGlobal("fetch", fetch);
    const { getLiveRates } = await loadModule();

    const result = await getLiveRates();

    expect(
      result.rates.find((rate) => rate.casa === "contadoconliqui"),
    ).toEqual({
      casa: "contadoconliqui",
      nombre: "CONTADOCONLIQUI",
      compra: 103,
      venta: 140,
      updatedAt: "15/01/2026, 12:30",
    });

    expect(result.freshness).toEqual({
      status: "current",
      lastSuccessfulFetchAt: "2026-01-15T16:00:00.000Z",
      lastSuccessfulFetchAtLabel: "15/01/2026, 13:00",
    });

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([RATES_URL]);
  });

  it("shares the dashboard's stale fallback and then rejects with a gateway response", async () => {
    const fetch = successfulFetch();
    vi.stubGlobal("fetch", fetch);
    const { getLiveRates } = await loadModule();

    await getLiveRates();

    fetch.mockImplementation(async () => {
      throw new Error("temporary outage");
    });

    vi.advanceTimersByTime(60_001);

    await expect(getLiveRates()).resolves.toMatchObject({
      freshness: {
        status: "stale",
        lastSuccessfulFetchAtLabel: "15/01/2026, 13:00",
      },
    });

    vi.advanceTimersByTime(15 * 60_000);
    await expect(getLiveRates()).rejects.toMatchObject({ status: 502 });
  });
});
