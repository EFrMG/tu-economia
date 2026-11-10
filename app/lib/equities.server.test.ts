import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import recorded from "./equities.server.fixtures.json";

const BASE =
  "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free";

type Path =
  "cedears" | "etf" | "leading-equity" | "index-price" | "market-open";

function security(
  symbol: string,
  denominationCcy: string,
  trade: number,
  previousClosingPrice: number,
  volumeAmount = trade * 100,
) {
  return {
    tradeVolume: 100,
    symbol,
    imbalance: previousClosingPrice ? trade / previousClosingPrice - 1 : 0,
    description: "",
    numberOfOrders: trade ? 10 : 0,
    previousClosingPrice,
    settlementType: "2",
    denominationCcy,
    bidPrice: trade,
    offerPrice: trade,
    market: "BYMA",
    volumeAmount: trade ? volumeAmount : 0,
    volume: trade ? 100 : 0,
    trade,
    ...(trade ? { tradeHour: "13:41:56" } : {}),
    securityType: "CD",
    closingPrice: 0,
  };
}

/** Recorded shape: `cedears` and `etf` arrive bare, `leading-equity` and `index-price` in the `{ content, data }` envelope. */
const fixtures: Record<Path, unknown> = {
  cedears: [
    security("AAL", "ARS", 9875, 9975),
    security("AALC", "EXT", 0, 6.14),
    security("AALD", "USD", 6.47, 6.52),
    { ...security("AAL", "ARS", 9800, 9975), settlementType: "1" },
  ],
  etf: [
    security("ARKK", "ARS", 13300, 13870),
    security("ARKKC", "EXT", 8.2, 8.5),
  ],
  "leading-equity": {
    content: {
      page_number: 1,
      page_count: 1,
      page_size: 189,
      total_elements_count: 2,
    },
    data: [
      {
        ...security("ALUA", "ARS", 846, 845, 277748472),
        tradeHour: "13:45",
        securityType: "CS",
      },
      { ...security("BBAR", "ARS", 6940, 6980, 232516365), securityType: "CS" },
    ],
  },
  "index-price": {
    content: {
      page_number: 1,
      page_count: 1,
      page_size: 50,
      total_elements_count: 3,
    },
    data: [
      {
        date: "2026-10-16",
        symbol: "G",
        country: "Argentina",
        isRate: false,
        minValue: 123855846.04,
        highValue: 125223356.85,
        price: 124242712.18,
        description: "S&P BYMA Indice General",
        previousClosingPrice: 124048018.53,
        variation: 0.0016,
      },
      {
        date: "2026-10-16",
        symbol: "M",
        country: "Argentina",
        isRate: false,
        minValue: 2847942.33,
        highValue: 2880639.69,
        price: 2850585.58,
        description: "S&P MERVAL",
        previousClosingPrice: 2859051.19,
        variation: -0.003,
      },
    ],
    empty: false,
    upgrade: false,
  },
  "market-open": true,
};

function pathOf(input: string | URL | Request) {
  return String(input).slice(BASE.length + 1) as Path;
}

function bymaFetch(
  override: Partial<Record<Path, () => Response | Promise<Response>>> = {},
) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const path = pathOf(input);

    return override[path]?.() ?? Response.json(fixtures[path]);
  });
}

async function loadModule() {
  return import("~/lib/equities.server");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T16:50:00.000Z"));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("BYMA requests", () => {
  it("sends the documented method, body and section header to each endpoint", async () => {
    const fetch = bymaFetch();
    vi.stubGlobal("fetch", fetch);
    const { getEquitiesOverview } = await loadModule();

    await getEquitiesOverview();

    const calls = new Map(
      fetch.mock.calls.map(([input, init]) => [pathOf(input), init!]),
    );

    expect([...calls.keys()].sort()).toEqual([
      "cedears",
      "etf",
      "index-price",
      "leading-equity",
      "market-open",
    ]);

    expect(calls.get("cedears")).toMatchObject({
      method: "POST",
      body: '{"excludeZeroPxAndQty":false,"T2":false,"T1":true,"T0":false,"Content-Type":"application/json"}',
      headers: {
        options: "renta-variable",
        origin: "https://open.bymadata.com.ar",
      },
    });

    expect(calls.get("index-price")).toMatchObject({
      method: "POST",
      body: '{"Content-Type":"application/json"}',
    });

    expect(calls.get("market-open")).toMatchObject({
      method: "GET",
      headers: { options: "dashboard" },
    });
  });

  it("validates both envelopes and builds every panel", async () => {
    vi.stubGlobal("fetch", bymaFetch());
    const { getEquitiesOverview } = await loadModule();

    const overview = await getEquitiesOverview();

    expect(overview.marketOpen).toMatchObject({
      status: "available",
      data: true,
    });

    expect(overview.indices.data?.map((index) => index.symbol)).toEqual([
      "M",
      "G",
    ]);

    expect(overview.leaders.data?.rows.map((row) => row.symbol)).toEqual([
      "ALUA",
      "BBAR",
    ]);
    expect(overview.leaders.data?.latestTradeTime).toBe("13:45");

    const cedears = overview.cedears.data!;
    expect(cedears.missingSources).toEqual([]);
    expect(cedears.rows.map((row) => [row.symbol, row.kind])).toEqual([
      ["ARKK", "etf"],
      ["AAL", "cedear"],
    ]);

    // The 24 hs record wins over the immediate-settlement one, and the untraded cable species defers to MEP.
    expect(cedears.rows[1].pesos.last).toBe(9875);
    expect(cedears.rows[1].impliedRate).toEqual({
      basis: "MEP",
      value: 9875 / 6.47,
    });
    expect(cedears.rows[0].impliedRate?.basis).toBe("CCL");

    expect(overview.cedears.freshness).toEqual({
      status: "current",
      fetchedAt: "2026-10-16T16:50:00.000Z",
      fetchedAtLabel: "16/10/2026, 13:50",
    });
  });

  // Records copied unchanged from the `openbymadata` fixtures recorded on 2026-10-16 (`internal/api/testdata/`), which this suite does not otherwise depend on.
  it("parses the records recorded from the live API", async () => {
    vi.stubGlobal(
      "fetch",
      bymaFetch({
        cedears: () => Response.json(recorded.cedears),
        etf: () => Response.json(recorded.etf),
        "leading-equity": () => Response.json(recorded["leading-equity"]),
        "index-price": () => Response.json(recorded["index-price"]),
      }),
    );

    const { getEquitiesOverview } = await loadModule();

    const overview = await getEquitiesOverview();

    expect(overview.indices.data?.map((index) => index.changePct)).toEqual([
      -0.3, 0.16,
    ]);

    expect(overview.leaders.data?.rows.map((row) => row.symbol)).toEqual([
      "BMA",
      "ALUA",
      "BBAR",
    ]);

    const rows = overview.cedears.data!.rows;

    expect(rows.map((row) => [row.symbol, row.kind])).toEqual([
      ["ARKK", "etf"],
      ["AAL", "cedear"],
      ["ARKKB", "etf"],
    ]);

    // AAL: the cable species has not traded, so the MEP one sets the rate and the decomposition.
    const aal = rows[1];

    expect(aal.impliedRate).toEqual({ basis: "MEP", value: 9875 / 6.47 });
    expect(aal.decomposition?.basis).toBe("MEP");
    expect(aal.decomposition?.dollarPct).toBeCloseTo((6.47 / 6.52 - 1) * 100);

    // ARKK: only an untraded cable species, so there is nothing to compare against.
    expect(rows[0].ext?.last).toBeNull();
    expect(rows[0].impliedRate).toBeNull();
    expect(rows[0].decomposition).toBeNull();
  });

  it("reads a record without a last price as untraded instead of rejecting the list", async () => {
    vi.stubGlobal(
      "fetch",
      bymaFetch({
        "leading-equity": () =>
          Response.json([
            security("ALUA", "ARS", 846, 845),
            { ...security("BBAR", "ARS", 0, 6980), trade: null },
          ]),
      }),
    );

    const { getLeaderPanel } = await loadModule();

    const panel = await getLeaderPanel();

    expect(panel.data?.rows.map((row) => [row.symbol, row.last])).toEqual([
      ["ALUA", 846],
      ["BBAR", null],
    ]);
  });

  it("tolerates missing optional fields such as tradeHour and unknown extra fields", async () => {
    vi.stubGlobal(
      "fetch",
      bymaFetch({
        "leading-equity": () =>
          Response.json([
            {
              symbol: "GGAL",
              denominationCcy: "ARS",
              trade: 0,
              novelty: { x: 1 },
            },
          ]),
      }),
    );

    const { getLeaderPanel } = await loadModule();

    const panel = await getLeaderPanel();

    expect(panel.data?.rows[0]).toMatchObject({
      symbol: "GGAL",
      last: null,
      previousClose: null,
      changePct: null,
      tradeTime: null,
      sector: "Financiero",
    });
  });

  it("retries once when BYMA answers 400", async () => {
    let attempts = 0;

    const fetch = bymaFetch({
      "market-open": () =>
        attempts++ === 0
          ? new Response("", { status: 400 })
          : Response.json(false),
    });

    vi.stubGlobal("fetch", fetch);
    const { getMarketOpen } = await loadModule();

    await expect(getMarketOpen()).resolves.toMatchObject({
      status: "available",
      data: false,
    });
    expect(attempts).toBe(2);
  });

  it("does not retry a second 400 or other errors", async () => {
    let attempts = 0;

    vi.stubGlobal(
      "fetch",
      bymaFetch({
        "market-open": () => {
          attempts += 1;

          return new Response("", { status: 400 });
        },
        "index-price": () => {
          attempts += 10;

          return new Response("", { status: 503 });
        },
      }),
    );

    const { getMarketOpen, getIndexStrip } = await loadModule();

    expect(await getMarketOpen()).toEqual({
      status: "unavailable",
      data: null,
      freshness: null,
    });
    expect(await getIndexStrip()).toMatchObject({ status: "unavailable" });
    expect(attempts).toBe(12);
  });

  it("rejects payloads that do not match the schema", async () => {
    vi.stubGlobal(
      "fetch",
      bymaFetch({
        "leading-equity": () =>
          Response.json({ data: [{ symbol: "ALUA", trade: "846" }] }),
        "index-price": () =>
          Response.json({ data: [{ symbol: "SPBYCAP", price: 41345.61 }] }),
        "market-open": () => Response.json("true"),
      }),
    );

    const { getEquitiesOverview } = await loadModule();

    const overview = await getEquitiesOverview();

    expect(overview.leaders.status).toBe("unavailable");
    expect(overview.indices.status).toBe("unavailable");
    expect(overview.marketOpen.status).toBe("unavailable");
    expect(overview.cedears.status).toBe("available");
  });

  it("keeps the CEDEAR panel available when only one of its two lists fails", async () => {
    vi.stubGlobal(
      "fetch",
      bymaFetch({ etf: () => new Response("", { status: 503 }) }),
    );

    const { getCedearPanel } = await loadModule();

    const panel = await getCedearPanel();

    expect(panel.data?.missingSources).toEqual(["etf"]);
    expect(panel.data?.rows.map((row) => row.symbol)).toEqual(["AAL"]);
  });

  it("leaves the other panels available when one source times out", async () => {
    vi.stubGlobal(
      "fetch",
      bymaFetch({ "leading-equity": () => new Promise<Response>(() => {}) }),
    );

    const { getEquitiesOverview } = await loadModule();

    const pending = getEquitiesOverview();
    await vi.advanceTimersByTimeAsync(8_000);
    const overview = await pending;

    expect(overview.leaders).toEqual({
      status: "unavailable",
      data: null,
      freshness: null,
    });
    expect(overview.indices.status).toBe("available");
    expect(overview.cedears.status).toBe("available");
    expect(overview.marketOpen.status).toBe("available");
  });
});

describe("cache and stale fallback", () => {
  it("serves cached lists for two minutes", async () => {
    const fetch = bymaFetch();
    vi.stubGlobal("fetch", fetch);
    const { getIndexStrip } = await loadModule();

    await getIndexStrip();
    await vi.advanceTimersByTimeAsync(119_000);
    await getIndexStrip();
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    await getIndexStrip();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows the last list for up to 15 minutes after its fetch, labelled with that time", async () => {
    let failing = false;

    vi.stubGlobal(
      "fetch",
      bymaFetch({
        "leading-equity": () =>
          failing
            ? new Response("", { status: 500 })
            : Response.json(fixtures["leading-equity"]),
      }),
    );

    const { getLeaderPanel } = await loadModule();

    await getLeaderPanel();
    failing = true;

    await vi.advanceTimersByTimeAsync(14 * 60_000);
    const stale = await getLeaderPanel();

    expect(stale.status).toBe("available");

    expect(stale.freshness).toEqual({
      status: "stale",
      fetchedAt: "2026-10-16T16:50:00.000Z",
      fetchedAtLabel: "16/10/2026, 13:50",
    });

    await vi.advanceTimersByTimeAsync(60_001);
    expect((await getLeaderPanel()).status).toBe("unavailable");
  });

  it("never shows a stale market-open flag", async () => {
    let failing = false;

    vi.stubGlobal(
      "fetch",
      bymaFetch({
        "market-open": () =>
          failing ? new Response("", { status: 500 }) : Response.json(true),
      }),
    );

    const { getMarketOpen } = await loadModule();

    await getMarketOpen();
    failing = true;
    await vi.advanceTimersByTimeAsync(3 * 60_000);

    expect((await getMarketOpen()).status).toBe("unavailable");
  });
});

describe("getEquitySourceHealth", () => {
  it("is not checked before any request", async () => {
    const { getEquitySourceHealth } = await loadModule();

    expect(getEquitySourceHealth()).toEqual({
      status: "not-checked",
      lastSuccessfulFetchAt: null,
      lastFailureAt: null,
    });
  });

  it("moves from fetched to cached", async () => {
    vi.stubGlobal("fetch", bymaFetch());
    const { checkEquitySources } = await loadModule();

    expect(await checkEquitySources()).toEqual({
      status: "fetched",
      lastSuccessfulFetchAt: "2026-10-16T16:50:00.000Z",
      lastFailureAt: null,
    });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(await checkEquitySources()).toEqual({
      status: "cached",
      lastSuccessfulFetchAt: "2026-10-16T16:50:00.000Z",
      lastFailureAt: null,
    });
  });

  it("reports partial, stale and failed states", async () => {
    let failing: Path[] = ["etf"];

    const fetch = vi.fn(async (input: string | URL | Request) => {
      const path = pathOf(input);

      return failing.includes(path)
        ? new Response("", { status: 500 })
        : Response.json(fixtures[path]);
    });

    vi.stubGlobal("fetch", fetch);
    const { checkEquitySources } = await loadModule();

    expect(await checkEquitySources()).toMatchObject({
      status: "partial",
      lastSuccessfulFetchAt: "2026-10-16T16:50:00.000Z",
      lastFailureAt: "2026-10-16T16:50:00.000Z",
    });

    // Past the cache and the backoff, every list except the open flag can fall back to its snapshot.
    failing = ["cedears", "leading-equity", "index-price"];
    await vi.advanceTimersByTimeAsync(3 * 60_000);

    expect(await checkEquitySources()).toMatchObject({ status: "stale" });

    // The open flag has no snapshot to fall back to, so its failure makes the source partial.
    failing = [
      "cedears",
      "etf",
      "leading-equity",
      "index-price",
      "market-open",
    ];
    await vi.advanceTimersByTimeAsync(3 * 60_000);

    expect((await checkEquitySources()).status).toBe("partial");

    await vi.advanceTimersByTimeAsync(15 * 60_000);

    expect(await checkEquitySources()).toMatchObject({
      status: "failed",
      lastSuccessfulFetchAt: "2026-10-16T16:53:00.000Z",
    });
  });

  it("reports partial while some requests are still unanswered", async () => {
    vi.stubGlobal(
      "fetch",
      bymaFetch({ "leading-equity": () => new Promise<Response>(() => {}) }),
    );

    const { checkEquitySources, getEquitySourceHealth } = await loadModule();

    const pending = checkEquitySources();
    await vi.advanceTimersByTimeAsync(1_000);

    // What `/api-status` reads when its 10-second window closes with BYMA requests in progress.
    expect(getEquitySourceHealth()).toMatchObject({
      status: "partial",
      lastSuccessfulFetchAt: "2026-10-16T16:50:00.000Z",
      lastFailureAt: null,
    });

    await vi.advanceTimersByTimeAsync(8_000);

    expect(await pending).toMatchObject({ status: "partial" });
  });

  it("reports partial when only some endpoints have ever been requested", async () => {
    vi.stubGlobal("fetch", bymaFetch());
    const { getLeaderPanel, getEquitySourceHealth } = await loadModule();

    await getLeaderPanel();

    expect(getEquitySourceHealth().status).toBe("partial");
  });

  it("reports stale when every failed refresh is covered by a snapshot", async () => {
    let failing = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = pathOf(input);

        return failing && path !== "market-open"
          ? new Response("", { status: 500 })
          : Response.json(fixtures[path]);
      }),
    );

    const { checkEquitySources } = await loadModule();

    await checkEquitySources();
    failing = true;
    await vi.advanceTimersByTimeAsync(3 * 60_000);

    expect(await checkEquitySources()).toMatchObject({
      status: "stale",
      lastSuccessfulFetchAt: "2026-10-16T16:53:00.000Z",
      lastFailureAt: "2026-10-16T16:53:00.000Z",
    });
  });
});
