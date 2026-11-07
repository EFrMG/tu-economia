import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEconomicNews } from "~/lib/economic-news.server";
import type { EconomicNews } from "~/lib/economic-news";
import {
  getDashboardHistory,
  getDashboardRates,
  type DashboardRates,
} from "~/lib/exchange-rates.server";
import { loader, shouldRevalidate } from "./dashboard";

vi.mock("~/lib/economic-news.server", () => ({ getEconomicNews: vi.fn() }));

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
});

const requestArgs = (url: string) =>
  ({ request: new Request(url) }) as Parameters<typeof loader>[0];

describe("dashboard loader", () => {
  it("streams exchange rates and news independently", async () => {
    let resolveNews!: (news: EconomicNews) => void;
    let resolveRates!: (rates: DashboardRates) => void;

    const pendingNews = new Promise<EconomicNews>((resolve) => {
      resolveNews = resolve;
    });

    const pendingRates = new Promise<DashboardRates>((resolve) => {
      resolveRates = resolve;
    });

    vi.mocked(getEconomicNews).mockReturnValue(pendingNews);
    vi.mocked(getDashboardRates).mockReturnValue(pendingRates);

    const result = loader(requestArgs("http://localhost/dashboard"));

    expect(result.market).toBeInstanceOf(Promise);
    expect(result.news).toBeInstanceOf(Promise);

    const news = { items: [], unavailableSources: [] } satisfies EconomicNews;
    resolveNews(news);
    await expect(result.news).resolves.toEqual(news);
    resolveRates(rates);

    await expect(result.market).resolves.toMatchObject({
      rates: { highlight: rates.highlight },
    });
  });

  it("keeps exchange rates available after an unexpected news error", async () => {
    vi.mocked(getEconomicNews).mockRejectedValue(
      new Error("unexpected feed error"),
    );

    vi.mocked(getDashboardRates).mockResolvedValue(rates);

    const result = loader(requestArgs("http://localhost/dashboard"));

    await expect(result.market).resolves.toMatchObject({
      rates: { highlight: rates.highlight },
    });

    await expect(result.news).resolves.toBeNull();
  });

  it("keeps historical data and news available after a live-rate source failure", async () => {
    vi.mocked(getDashboardRates).mockRejectedValue(
      new Response("upstream unavailable", { status: 502 }),
    );

    vi.mocked(getDashboardHistory).mockResolvedValue({
      historicalChart: [{ fecha: "2026-09-29", blue: 100, oficial: 90 }],
      historicalAsOf: "2026-09-29",
      historicalFailedSeries: [],
    });

    vi.mocked(getEconomicNews).mockResolvedValue({
      items: [],
      unavailableSources: [],
    });

    const result = loader(requestArgs("http://localhost/dashboard"));

    await expect(result.market).resolves.toMatchObject({
      rates: null,
      history: {
        historicalChart: [{ fecha: "2026-09-29", blue: 100, oficial: 90 }],
      },
    });

    await expect(result.news).resolves.toEqual({
      items: [],
      unavailableSources: [],
    });
  });

  it("settles unavailable market data when an upstream request never returns", async () => {
    vi.useFakeTimers();

    try {
      vi.mocked(getEconomicNews).mockResolvedValue({
        items: [],
        unavailableSources: [],
      });

      vi.mocked(getDashboardRates).mockReturnValue(
        new Promise(() => undefined),
      );

      vi.mocked(getDashboardHistory).mockReturnValue(
        new Promise(() => undefined),
      );

      const result = loader(requestArgs("http://localhost/dashboard"));

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
    vi.mocked(getEconomicNews).mockResolvedValue({
      items: [],
      unavailableSources: [],
    });

    vi.mocked(getDashboardRates).mockResolvedValue(rates);

    vi.mocked(getDashboardHistory).mockRejectedValue(
      new Error("history source unavailable"),
    );

    const result = loader(requestArgs("http://localhost/dashboard"));

    await expect(result.market).resolves.toMatchObject({
      rates: { highlight: rates.highlight },
    });
  });

  it("previews unavailable data without calling sources in development", async () => {
    const result = loader(
      requestArgs("http://localhost/dashboard?preview=unavailable"),
    );

    await expect(result.market).resolves.toMatchObject({
      rates: null,
      history: { historicalFailedSeries: ["blue", "oficial"] },
    });

    await expect(result.news).resolves.toBeNull();
    expect(getDashboardRates).not.toHaveBeenCalled();
    expect(getDashboardHistory).not.toHaveBeenCalled();
    expect(getEconomicNews).not.toHaveBeenCalled();
  });

  it("redirects shared gap links to the analysis route", async () => {
    try {
      await loader(requestArgs("http://localhost/dashboard?view=gap&period=7"));

      throw new Error("Expected a redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);

      expect((error as Response).headers.get("Location")).toBe(
        "/analisis?period=7",
      );
    }

    expect(getDashboardRates).not.toHaveBeenCalled();
  });
});

describe("dashboard revalidation", () => {
  const navigation = (current: string, next: string, formMethod?: string) =>
    ({
      currentUrl: new URL(current),
      nextUrl: new URL(next),
      formMethod,
      defaultShouldRevalidate: true,
    }) as Parameters<typeof shouldRevalidate>[0];

  it("keeps loader data while only dashboard presentation state changes", () => {
    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dashboard?period=30",
          "https://example.com/dashboard?period=7",
        ),
      ),
    ).toBe(false);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dashboard?rate=blue",
          "https://example.com/dashboard?rate=cripto",
        ),
      ),
    ).toBe(false);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dashboard?period=30",
          "https://example.com/dashboard?period=30&view=gap",
        ),
      ),
    ).toBe(true);
  });

  it("preserves normal revalidation for refreshes, other search changes, and submissions", () => {
    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dashboard",
          "https://example.com/dashboard",
        ),
      ),
    ).toBe(true);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dashboard?period=7",
          "https://example.com/dashboard?period=30&source=blue",
        ),
      ),
    ).toBe(true);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/dashboard?period=7",
          "https://example.com/dashboard?period=30",
          "POST",
        ),
      ),
    ).toBe(true);
  });
});
