import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDepositRateHistory,
  getMonthlyInflationHistory,
} from "~/lib/indicators.server";

vi.mock("~/lib/indicators.server", () => ({
  getMonthlyInflationHistory: vi.fn(),
  getDepositRateHistory: vi.fn(),
}));

const inflation = [{ date: "2026-09-30", value: 2 }];
const deposits = [{ date: "2026-08-28", value: 20 }];

describe("deposit and inflation comparisons per instance", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(getMonthlyInflationHistory).mockResolvedValue(inflation);
    vi.mocked(getDepositRateHistory).mockResolvedValue(deposits);
  });

  it("reuses the comparison while the cached series are the same arrays", async () => {
    const { getDepositInflationComparisons } =
      await import("./deposit-inflation.server");

    const first = await getDepositInflationComparisons({});

    expect(first).toHaveLength(1);
    expect(await getDepositInflationComparisons({})).toBe(first);
  });

  it("recomputes when either series is reloaded", async () => {
    const { getDepositInflationComparisons } =
      await import("./deposit-inflation.server");

    const first = await getDepositInflationComparisons({});

    vi.mocked(getDepositRateHistory).mockResolvedValue([
      { date: "2026-08-28", value: 30 },
    ]);

    const second = await getDepositInflationComparisons({});

    expect(second).not.toBe(first);
    expect(second[0].tna).toBe(30);

    vi.mocked(getMonthlyInflationHistory).mockResolvedValue([
      { date: "2026-09-30", value: 3 },
    ]);

    expect((await getDepositInflationComparisons({}))[0].inflation).toBe(3);
  });
});
