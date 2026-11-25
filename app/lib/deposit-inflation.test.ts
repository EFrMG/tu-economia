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
    // A 20,98 % TNA over 30 days, against 1,7 % monthly inflation.
    expect(comparisons[0].nominalReturnPercent).toBeCloseTo(1.72438, 4);
    expect(comparisons[0].realReturnPercent).toBeCloseTo(0.02398, 4);

    expect(simulateDeposit(100_000, comparisons[0])?.finalAmount).toBeCloseTo(
      101_724.38,
      1,
    );
  });

  it("takes the latest rate dated before the month, whatever the series order", () => {
    const comparisons = depositInflationComparisons(
      [{ date: "2026-09-30", value: 2 }],
      [
        { date: "2026-09-01", value: 40 },
        { date: "2026-08-27", value: 20 },
        { date: "2026-08-31", value: 30 },
        { date: "2026-08-28", value: 25 },
      ],
    );

    expect(comparisons.map(({ rateDate, tna }) => ({ rateDate, tna }))).toEqual(
      [{ rateDate: "2026-08-31", tna: 30 }],
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
