import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const monthlyUrl =
  "https://api.argentinadatos.com/v1/finanzas/indices/inflacion";

const yearlyUrl =
  "https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual";

const depositsUrl =
  "https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias";

const uvaUrl = "https://api.argentinadatos.com/v1/finanzas/indices/uva";

const riskUrl =
  "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo";

const rows = [{ fecha: "2026-08-31", valor: 1.7 }];

const response = (items: unknown, status = 200) =>
  Response.json(items, { status });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("economic indicators", () => {
  it("validates each payload and selects its latest dated value without rescaling it", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === monthlyUrl)
        return response([rows[0], { fecha: "2026-07-31", valor: 1.9 }]);

      if (url === yearlyUrl)
        return response([{ fecha: "2026-08-31T00:00:00.000Z", valor: 33.5 }]);

      if (url === depositsUrl)
        return response([{ fecha: "2026-09-29", valor: 20.98 }]);

      if (url === uvaUrl)
        return response([{ fecha: "2026-09-30", valor: 1650.25 }]);

      if (url === riskUrl) return response({ fecha: "2026-09-29", valor: 640 });

      throw new Error("unexpected source");
    });

    vi.stubGlobal("fetch", fetch);

    const { getIndicators, getMonthlyInflationHistory, getDepositRateHistory } =
      await import("./indicators.server");

    expect(await getIndicators()).toEqual([
      { id: "inflation-monthly", point: { date: "2026-08-31", value: 1.7 } },
      { id: "inflation-yearly", point: { date: "2026-08-31", value: 33.5 } },
      { id: "deposits-30-days", point: { date: "2026-09-29", value: 20.98 } },
      { id: "uva", point: { date: "2026-09-30", value: 1650.25 } },
      { id: "country-risk", point: { date: "2026-09-29", value: 640 } },
    ]);

    expect(await getMonthlyInflationHistory()).toEqual([
      { date: "2026-07-31", value: 1.9 },
      { date: "2026-08-31", value: 1.7 },
    ]);

    expect(await getDepositRateHistory()).toEqual([
      { date: "2026-09-29", value: 20.98 },
    ]);

    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("keeps valid series visible when another upstream payload is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input) === yearlyUrl
          ? response([{ fecha: "not-a-date", valor: 33.5 }])
          : String(input) === riskUrl
            ? response({ fecha: "2026-09-29", valor: 640 })
            : response(rows),
      ),
    );

    const { getIndicators } = await import("./indicators.server");

    const result = await getIndicators();
    expect(result[0].point?.value).toBe(1.7);
    expect(result[1]).toEqual({ id: "inflation-yearly", point: null });
    expect(result[2].point?.value).toBe(1.7);
    expect(result[3].point?.value).toBe(1.7);
    expect(result[4].point?.value).toBe(640);
  });

  it("shares concurrent work and retries a rejected series without refetching healthy cached series", async () => {
    let monthlyAttempts = 0;

    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === monthlyUrl && monthlyAttempts++ === 0)
        return response([], 503);

      if (String(input) === riskUrl)
        return response({ fecha: "2026-09-29", valor: 640 });

      return response(rows);
    });

    vi.stubGlobal("fetch", fetch);
    const { getIndicators } = await import("./indicators.server");

    const [first, concurrent] = await Promise.all([
      getIndicators(),
      getIndicators(),
    ]);

    expect(first[0].point).toBeNull();
    expect(concurrent[0].point).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(5);

    // Inside the failure backoff the failing series is not requested again.
    const backingOff = await getIndicators();
    expect(backingOff[0].point).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(5);

    await vi.advanceTimersByTimeAsync(5_000);

    const retried = await getIndicators();
    expect(retried[0].point?.value).toBe(1.7);
    expect(fetch).toHaveBeenCalledTimes(6);

    vi.advanceTimersByTime(30 * 60_000 + 1);
    await getIndicators();
    expect(fetch).toHaveBeenCalledTimes(11);
  });
});
