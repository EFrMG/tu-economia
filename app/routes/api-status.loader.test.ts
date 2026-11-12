import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkCompanyFilingSources,
  getCompanyFilingSourceHealth,
} from "~/lib/company-filings.server";
import {
  checkEquitySources,
  getEquitySourceHealth,
} from "~/lib/equities.server";
import { workerEnvContext } from "~/lib/worker-context";
import { loader } from "./api-status";

const health = {
  status: "fetched",
  lastSuccessfulFetchAt: "2026-11-10T12:00:00.000Z",
  lastFailureAt: null,
} as const;

vi.mock("~/lib/equities.server", () => ({
  checkEquitySources: vi.fn(),
  getEquitySourceHealth: vi.fn(),
}));

vi.mock("~/lib/company-filings.server", () => ({
  checkCompanyFilingSources: vi.fn(),
  getCompanyFilingSourceHealth: vi.fn(),
}));

vi.mock("~/lib/exchange-rates.server", () => ({
  checkExchangeRateSources: vi.fn(async () => undefined),
  getExchangeRateSourceHealth: vi.fn(() => ({ live: health, history: health })),
}));

vi.mock("~/lib/economic-news.server", () => ({
  getEconomicNews: vi.fn(async () => undefined),
  getNewsSourceHealth: vi.fn(() => []),
}));

vi.mock("~/lib/indicators.server", () => ({
  getIndicators: vi.fn(async () => undefined),
  getIndicatorSourceHealth: vi.fn(() => ({
    bcra: health,
    countryRisk: health,
  })),
}));

vi.mock("~/lib/economic-activity.server", () => ({
  getEconomicActivity: vi.fn(async () => undefined),
  getEconomicActivitySourceHealth: vi.fn(() => health),
}));

vi.mock("~/lib/prices.server", () => ({
  getPricesSourceHealth: vi.fn(() => health),
}));

beforeEach(() => {
  vi.mocked(checkEquitySources).mockReset().mockResolvedValue(health);
  vi.mocked(getEquitySourceHealth).mockReset().mockReturnValue(health);
  vi.mocked(checkCompanyFilingSources).mockReset().mockResolvedValue(health);
  vi.mocked(getCompanyFilingSourceHealth).mockReset().mockReturnValue(health);
});

const requestArgs = (path: string, bymaEnabled: boolean) => {
  const context = new RouterContextProvider();

  context.set(workerEnvContext, {
    EQUITIES_BYMA_ENABLED: bymaEnabled ? "true" : "false",
  });

  return {
    request: new Request(`http://localhost${path}`),
    context,
  } as unknown as Parameters<typeof loader>[0];
};

const names = (data: Awaited<ReturnType<typeof loader>>) =>
  data.sources.map((source) => source.name);

describe("api-status loader", () => {
  it("neither checks nor lists BYMA while the flag is off, and checks SEC EDGAR", async () => {
    const data = await loader(requestArgs("/api-status", false));

    expect(names(data)).not.toContain("BYMA Open Data");
    expect(names(data)).toContain("SEC EDGAR");
    expect(checkEquitySources).not.toHaveBeenCalled();
    expect(getEquitySourceHealth).not.toHaveBeenCalled();
    expect(checkCompanyFilingSources).toHaveBeenCalledTimes(1);
  });

  it("checks and lists BYMA while the flag is on", async () => {
    const data = await loader(requestArgs("/api-status", true));

    expect(names(data)).toContain("BYMA Open Data");
    expect(names(data)).toContain("SEC EDGAR");
    expect(checkEquitySources).toHaveBeenCalledTimes(1);
  });

  it("follows the flag in the dev preview too, without checking anything", async () => {
    const off = await loader(
      requestArgs("/api-status?preview=unavailable", false),
    );

    const on = await loader(
      requestArgs("/api-status?preview=unavailable", true),
    );

    expect(names(off)).not.toContain("BYMA Open Data");
    expect(names(off)).toContain("SEC EDGAR");
    expect(names(on)).toContain("BYMA Open Data");
    expect(checkEquitySources).not.toHaveBeenCalled();
    expect(checkCompanyFilingSources).not.toHaveBeenCalled();
  });
});
