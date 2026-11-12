import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEconomicNews } from "~/lib/economic-news.server";
import { getDashboardRates } from "~/lib/exchange-rates.server";
import { getIndecData } from "~/lib/indec.server";
import { getIndicators } from "~/lib/indicators.server";
import { workerEnvContext } from "~/lib/worker-context";
import { loader } from "./dashboard";

vi.mock("~/lib/economic-news.server", () => ({ getEconomicNews: vi.fn() }));
vi.mock("~/lib/exchange-rates.server", () => ({ getDashboardRates: vi.fn() }));
vi.mock("~/lib/indec.server", () => ({ getIndecData: vi.fn() }));
vi.mock("~/lib/indicators.server", () => ({ getIndicators: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIndicators).mockResolvedValue([]);
  vi.mocked(getIndecData).mockResolvedValue({
    baskets: null,
    wages: null,
    prices: null,
  });
});

const requestArgs = (url: string) => {
  const context = new RouterContextProvider();
  context.set(workerEnvContext, { INDEC_API_TOKEN: "token" });

  return { request: new Request(url), context } as unknown as Parameters<
    typeof loader
  >[0];
};

describe("resumen loader", () => {
  it("streams rates, key figures and news independently, and turns a rate failure or news error into an unavailable state", async () => {
    vi.mocked(getDashboardRates).mockRejectedValue(new Error("down"));
    vi.mocked(getEconomicNews).mockRejectedValue(new Error("feed error"));

    const result = loader(requestArgs("http://localhost/dashboard"));

    await expect(result.rates).resolves.toBeNull();
    await expect(result.news).resolves.toBeNull();
    await expect(result.indicators).resolves.toEqual([]);
    await expect(result.indec).resolves.toMatchObject({ baskets: null });
    expect(getIndecData).toHaveBeenCalledWith("token");
  });

  it("previews unavailable data without calling sources", async () => {
    const result = loader(
      requestArgs("http://localhost/dashboard?preview=unavailable"),
    );

    await expect(result.rates).resolves.toBeNull();
    expect(getDashboardRates).not.toHaveBeenCalled();
    expect(getIndicators).not.toHaveBeenCalled();
    expect(getIndecData).not.toHaveBeenCalled();
    expect(getEconomicNews).not.toHaveBeenCalled();
  });
});
