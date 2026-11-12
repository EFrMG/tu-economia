import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDashboardHistory,
  getDashboardRates,
  type DashboardRates,
} from "~/lib/exchange-rates.server";
import { getIndicators } from "~/lib/indicators.server";
import { loader, shouldRevalidate } from "./dolar";

vi.mock("~/lib/indicators.server", () => ({ getIndicators: vi.fn() }));

vi.mock("~/lib/exchange-rates.server", () => ({
  getDashboardRates: vi.fn(),
  getDashboardHistory: vi.fn(),
}));

const rates: DashboardRates = {
  highlight: {
    casa: "blue",
    nombre: "Blue",
    compra: 100,
    venta: 110,
    changePct: 1,
    history: [],
  },
  grid: [],
  brecha: {},
  updatedAt: null,
  freshness: {
    status: "current",
    lastSuccessfulFetchAt: "2026-09-29T12:00:00.000Z",
    lastSuccessfulFetchAtLabel: "29/09/2026, 09:00",
  },
  historicalChart: [],
  historicalAsOf: "2026-09-29",
  historicalFailedSeries: [],
};

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getDashboardHistory).mockResolvedValue({
    historicalChart: [],
    historicalAsOf: "2026-09-29",
    historicalFailedSeries: [],
  });

  vi.mocked(getIndicators).mockResolvedValue([]);
});

const requestArgs = (url: string) =>
  ({ request: new Request(url) }) as Parameters<typeof loader>[0];

describe("dolar loader", () => {
  it("streams exchange rates and the indicator cards independently", async () => {
    let resolveRates!: (rates: DashboardRates) => void;

    const pendingRates = new Promise<DashboardRates>((resolve) => {
      resolveRates = resolve;
    });

    vi.mocked(getDashboardRates).mockReturnValue(pendingRates);

    const result = loader(requestArgs("http://localhost/dolar"));

    await expect(result.indicators).resolves.toEqual([]);
    resolveRates(rates);

    await expect(result.market).resolves.toMatchObject({
      rates: { highlight: rates.highlight },
    });
  });

  it("keeps historical data available after a live-rate source failure", async () => {
    vi.mocked(getDashboardRates).mockRejectedValue(
      new Response("upstream unavailable", { status: 502 }),
    );

    vi.mocked(getDashboardHistory).mockResolvedValue({
      historicalChart: [{ fecha: "2026-09-29", blue: 100, oficial: 90 }],
      historicalAsOf: "2026-09-29",
      historicalFailedSeries: [],
    });

    const result = loader(requestArgs("http://localhost/dolar"));

    await expect(result.market).resolves.toMatchObject({
      rates: null,
      history: {
        historicalChart: [{ fecha: "2026-09-29", blue: 100, oficial: 90 }],
      },
    });
  });

  it("settles unavailable market data when an upstream request never returns", async () => {
    vi.useFakeTimers();

    try {
      vi.mocked(getDashboardRates).mockReturnValue(
        new Promise(() => undefined),
      );

      vi.mocked(getDashboardHistory).mockReturnValue(
        new Promise(() => undefined),
      );

      const result = loader(requestArgs("http://localhost/dolar"));

      const outcome = expect(result.market).resolves.toMatchObject({
        rates: null,
        history: { historicalFailedSeries: ["blue", "oficial"] },
      });

      await vi.advanceTimersByTimeAsync(10_000);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles a parallel history rejection after live rates succeed", async () => {
    vi.mocked(getDashboardRates).mockResolvedValue(rates);

    vi.mocked(getDashboardHistory).mockRejectedValue(
      new Error("history source unavailable"),
    );

    const result = loader(requestArgs("http://localhost/dolar"));

    await expect(result.market).resolves.toMatchObject({
      rates: { highlight: rates.highlight },
    });
  });

  it("previews unavailable data without calling sources in development", async () => {
    const result = loader(
      requestArgs("http://localhost/dolar?preview=unavailable"),
    );

    await expect(result.market).resolves.toMatchObject({
      rates: null,
      history: { historicalFailedSeries: ["blue", "oficial"] },
    });

    expect(getDashboardRates).not.toHaveBeenCalled();
    expect(getDashboardHistory).not.toHaveBeenCalled();
    expect(getIndicators).not.toHaveBeenCalled();
  });
});

describe("dolar revalidation", () => {
  const navigation = (current: string, next: string, formMethod?: string) =>
    ({
      currentUrl: new URL(current),
      nextUrl: new URL(next),
      formMethod,
      defaultShouldRevalidate: true,
    }) as Parameters<typeof shouldRevalidate>[0];

  it("keeps loader data while only the chart's period or view changes", () => {
    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dolar?period=30",
          "https://example.com/dolar?period=7",
        ),
      ),
    ).toBe(false);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dolar?period=30",
          "https://example.com/dolar?period=30&view=gap",
        ),
      ),
    ).toBe(false);
  });

  it("preserves normal revalidation for refreshes, other search changes, and submissions", () => {
    expect(
      shouldRevalidate(
        navigation("https://example.com/dolar", "https://example.com/dolar"),
      ),
    ).toBe(true);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dolar?period=7",
          "https://example.com/dolar?period=30&source=blue",
        ),
      ),
    ).toBe(true);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dolar?period=7",
          "https://example.com/dolar?period=30",
          "POST",
        ),
      ),
    ).toBe(true);
  });
});
