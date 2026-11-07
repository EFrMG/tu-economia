import { describe, expect, it } from "vitest";

import { calculatePurchasingPower } from "~/lib/purchasing-power";

describe("purchasing power", () => {
  const series = [
    { date: "2026-01-31", value: 3 },
    { date: "2026-02-28", value: 10 },
    { date: "2026-03-31", value: 20 },
  ];

  it("compounds every month after the selected starting month", () => {
    expect(calculatePurchasingPower(100, "2026-01", series)).toEqual({
      adjustedAmount: 132,
      retainedPercent: 100 / 1.32,
      fromMonth: "2026-01",
      throughMonth: "2026-03",
      months: 2,
    });
  });

  it("does not fill a missing month or allow invalid amounts", () => {
    expect(
      calculatePurchasingPower(100, "2026-01", [series[0], series[2]]),
    ).toBeNull();

    expect(calculatePurchasingPower(-100, "2026-01", series)).toBeNull();
    expect(calculatePurchasingPower(100, "2026-03", series)).toBeNull();
  });
});
