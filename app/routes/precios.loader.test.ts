import { RouterContextProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { getIndecData } from "~/lib/indec.server";
import {
  getIndicators,
  getMonthlyInflationHistory,
} from "~/lib/indicators.server";
import { workerEnvContext } from "~/lib/worker-context";
import { loader, shouldRevalidate } from "./precios";

vi.mock("~/lib/indec.server", () => ({ getIndecData: vi.fn() }));

vi.mock("~/lib/indicators.server", () => ({
  getIndicators: vi.fn(),
  getMonthlyInflationHistory: vi.fn(),
}));

const navigation = (current: string, next: string, formMethod?: string) =>
  ({
    currentUrl: new URL(current),
    nextUrl: new URL(next),
    formMethod,
    defaultShouldRevalidate: true,
  }) as Parameters<typeof shouldRevalidate>[0];

describe("precios revalidation", () => {
  it("keeps loaded data when only the calculator inputs change", () => {
    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/precios?ppAmount=100",
          "https://example.com/precios?ppAmount=250&ppFrom=2026-01",
        ),
      ),
    ).toBe(false);
  });

  it("revalidates on refresh, preview changes and submissions", () => {
    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/precios",
          "https://example.com/precios",
        ),
      ),
    ).toBe(true);
    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/precios",
          "https://example.com/precios?preview=unavailable",
        ),
      ),
    ).toBe(true);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/precios?ppAmount=100",
          "https://example.com/precios?ppAmount=250",
          "POST",
        ),
      ),
    ).toBe(true);
  });
});

it("settles the inflation history when its upstream never returns", async () => {
  vi.useFakeTimers();

  try {
    vi.mocked(getIndicators).mockResolvedValue([]);
    vi.mocked(getIndecData).mockResolvedValue({
      baskets: null,
      wages: null,
      prices: null,
    });
    vi.mocked(getMonthlyInflationHistory).mockReturnValue(
      new Promise(() => undefined),
    );

    const context = new RouterContextProvider();
    context.set(workerEnvContext, {});

    const result = loader({
      request: new Request("http://localhost/precios"),
      context,
    } as unknown as Parameters<typeof loader>[0]);

    const inflation = expect(result.inflationHistory).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    await inflation;
  } finally {
    vi.useRealTimers();
  }
});
