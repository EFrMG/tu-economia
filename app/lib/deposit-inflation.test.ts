import { describe, expect, it } from "vitest";

import {
  depositInflationComparisons,
  simulateDeposit,
} from "~/lib/deposit-inflation";

describe("deposit and inflation comparison", () => {
  it("matches a 30-day month with a recent prior published rate", () => {
    const comparisons = depositInflationComparisons(
      [
        { date: "2026-08-31", value: 2 },
        { date: "2026-09-30", value: 1.7 },
      ],
      [
        { date: "2026-08-28", value: 20.98 },
        { date: "2026-09-30", value: 99 },
      ],
    );

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].month).toBe("2026-09");
    expect(comparisons[0].rateDate).toBe("2026-08-28");
    expect(comparisons[0].nominalReturnPercent).toBeCloseTo((20.98 * 30) / 365);

    expect(comparisons[0].realReturnPercent).toBeCloseTo(
      ((1 + (20.98 * 30) / 36500) / 1.017 - 1) * 100,
    );

    expect(simulateDeposit(100_000, comparisons[0])?.finalAmount).toBeCloseTo(
      101_724.38,
      1,
    );
  });

  it("excludes months with an old or missing starting reference rate", () => {
    expect(
      depositInflationComparisons(
        [{ date: "2026-09-30", value: 2 }],
        [{ date: "2026-08-20", value: 20 }],
      ),
    ).toEqual([]);

    expect(
      depositInflationComparisons(
        [{ date: "2026-09-30", value: 2 }],
        [{ date: "2026-09-01", value: 20 }],
      ),
    ).toEqual([]);
  });
});
