import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const activityUrl =
  "https://apis.datos.gob.ar/series/api/series/?ids=143.3_ICE_SERVIA_2004_A_25,143.3_ICE_SER_VM_2004_A_34&last=12&metadata=none";

const csvUrl =
  "https://infra.datos.gob.ar/catalog/sspm/dataset/143/distribution/143.3/download/emae-valores-anuales-indice-base-2004-mensual.csv";

const payload = {
  data: [
    ["2026-06-01", 0.031347740461844, 0.002702419675709],
    ["2026-07-01", -0.014417650408067, -0.0289996119192081],
  ],
  count: 260,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("economic activity", () => {
  it("validates the official EMAE series and converts fractional changes to percentages", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ...payload, data: [...payload.data].reverse() }),
    );

    vi.stubGlobal("fetch", fetch);
    const { getEconomicActivity } = await import("./economic-activity.server");

    const activity = await getEconomicActivity();

    expect(fetch).toHaveBeenCalledWith(
      activityUrl,
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );

    expect(activity.observations.map((point) => point.date)).toEqual([
      "2026-06-01",
      "2026-07-01",
    ]);

    expect(activity.latest).toMatchObject({
      date: "2026-07-01",
      yearOverYear: -1.4417650408067,
      monthOverMonth: -2.89996119192081,
    });
  });

  it("shares concurrent work, evicts failures, and caches valid values for thirty minutes", async () => {
    let apiAttempts = 0;

    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === csvUrl)
        return new Response("Unavailable", { status: 503 });

      return apiAttempts++ === 0
        ? Response.json({ data: [["2026-07-01", "bad", 0.01]] })
        : Response.json(payload);
    });

    vi.stubGlobal("fetch", fetch);
    const { getEconomicActivity } = await import("./economic-activity.server");

    const [first, concurrent] = await Promise.allSettled([
      getEconomicActivity(),
      getEconomicActivity(),
    ]);

    expect(first.status).toBe("rejected");
    expect(concurrent.status).toBe("rejected");
    expect(fetch).toHaveBeenCalledTimes(2);

    // Inside the failure backoff the failure is served without another upstream request.
    await expect(getEconomicActivity()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);

    await getEconomicActivity();
    await getEconomicActivity();
    expect(fetch).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(30 * 60_000 + 1);
    await getEconomicActivity();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("uses the official CSV when the series API is unavailable", async () => {
    const csv = [
      "indice_tiempo,emae_original_via,emae_desestacionalizada_vm",
      "2026-06-01,0.031347740461844,0.002702419675709",
      "2026-07-01,-0.014417650408067,-0.0289996119192081",
    ].join("\n");

    const fetch = vi.fn(async (input: string | URL | Request) =>
      String(input) === activityUrl
        ? new Response("Unavailable", { status: 503 })
        : new Response(csv),
    );

    vi.stubGlobal("fetch", fetch);
    const { getEconomicActivity } = await import("./economic-activity.server");

    const activity = await getEconomicActivity();

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      activityUrl,
      csvUrl,
    ]);

    expect(activity.latest).toMatchObject({
      date: "2026-07-01",
      yearOverYear: -1.4417650408067,
    });
  });

  it("formats the published month and differences between annual rates", async () => {
    const {
      activityRateDifference,
      formatActivityChange,
      formatActivityMonth,
    } = await import("./economic-activity");

    expect(formatActivityMonth("2026-07-01")).toBe("julio de 2026");
    expect(formatActivityChange(-1.441765)).toBe("-1,4%");
    expect(formatActivityChange(-0.002)).toBe("0,0%");

    expect(activityRateDifference(-1.4, 3.1)).toBe(
      "bajó 4,5 puntos porcentuales frente al mes anterior",
    );

    expect(activityRateDifference(null, 3.1)).toBeNull();
  });
});
