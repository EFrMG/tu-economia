import { describe, expect, it, vi } from "vitest";

import { getDashboardHistory } from "~/lib/exchange-rates.server";
import {
  getDepositRateHistory,
  getMonthlyInflationHistory,
} from "~/lib/indicators.server";
import { loader, shouldRevalidate } from "./analisis";

vi.mock("~/lib/exchange-rates.server", () => ({
  getDashboardHistory: vi.fn(),
}));

vi.mock("~/lib/indicators.server", () => ({
  getDepositRateHistory: vi.fn(),
  getMonthlyInflationHistory: vi.fn(),
}));

const navigation = (current: string, next: string, formMethod?: string) =>
  ({
    currentUrl: new URL(current),
    nextUrl: new URL(next),
    formMethod,
    defaultShouldRevalidate: true,
  }) as Parameters<typeof shouldRevalidate>[0];

describe("analysis revalidation", () => {
  it("keeps loaded history when only calculator inputs or chart period change", () => {
    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/analisis?ppAmount=100",
          "https://example.com/analisis?ppAmount=250&ppFrom=2026-01",
        ),
      ),
    ).toBe(false);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/analisis?period=7",
          "https://example.com/analisis?period=90&depositMonth=2026-09",
        ),
      ),
    ).toBe(false);
  });

  it("revalidates on refresh, preview changes, and submissions", () => {
    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/analisis",
          "https://example.com/analisis",
        ),
      ),
    ).toBe(true);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/analisis",
          "https://example.com/analisis?preview=unavailable",
        ),
      ),
    ).toBe(true);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/analisis?ppAmount=100",
          "https://example.com/analisis?ppAmount=250",
          "POST",
        ),
      ),
    ).toBe(true);
  });
});

it("settles all analysis sections when upstream requests never return", async () => {
  vi.useFakeTimers();

  try {
    vi.mocked(getDashboardHistory).mockReturnValue(
      new Promise(() => undefined),
    );

    vi.mocked(getMonthlyInflationHistory).mockReturnValue(
      new Promise(() => undefined),
    );

    vi.mocked(getDepositRateHistory).mockReturnValue(
      new Promise(() => undefined),
    );

    const result = loader({
      request: new Request("http://localhost/analisis"),
    } as Parameters<typeof loader>[0]);

    const history = expect(result.history).resolves.toMatchObject({
      historicalFailedSeries: ["blue", "oficial"],
    });

    const inflation = expect(result.inflationHistory).resolves.toBeNull();
    const comparisons = expect(result.comparisons).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([history, inflation, comparisons]);
  } finally {
    vi.useRealTimers();
  }
});
