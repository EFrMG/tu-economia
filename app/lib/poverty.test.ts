import { describe, expect, it } from "vitest";

import {
  formatPovertyChange,
  formatPovertyRate,
  formatSemester,
  formatSemesterShort,
  povertyPointsForYears,
  povertySummary,
  povertyUnitFromParam,
  povertyYearsFromParam,
  type PovertyPoint,
} from "./poverty";

const point = (period: string, poverty: number): PovertyPoint => ({
  period,
  personas: { poverty, indigence: poverty / 5 },
  hogares: { poverty: poverty - 8, indigence: null },
  note: null,
  provisional: false,
});

const series = [
  point("2024-S1", 52.9),
  point("2024-S2", 38.1),
  point("2025-S1", 31.6),
  point("2025-S2", 28.2),
  point("2026-S1", 32.3),
];

describe("poverty", () => {
  it("compares the latest semester with the same semester a year earlier, in percentage points", () => {
    const summary = povertySummary(series, "personas");

    expect(summary?.latest.period).toBe("2026-S1");
    expect(summary?.reference?.period).toBe("2025-S1");
    expect(summary?.change.poverty).toBe(0.7);
    expect(summary?.change.indigence).toBe(0.1);

    expect(povertySummary(series, "hogares")?.change).toEqual({
      poverty: 0.7,
      indigence: null,
    });
  });

  it("has no change without the year-earlier semester, and no summary without points", () => {
    const summary = povertySummary(series.slice(1, 3), "personas");

    expect(summary?.reference).toBeNull();
    expect(summary?.change).toEqual({ poverty: null, indigence: null });
    expect(povertySummary([], "personas")).toBeNull();
  });

  it("keeps two semesters per year of the recent range, and the whole series otherwise", () => {
    expect(
      povertyPointsForYears(series, 2).map((entry) => entry.period),
    ).toEqual(["2024-S2", "2025-S1", "2025-S2", "2026-S1"]);
    expect(povertyPointsForYears(series, null)).toBe(series);
  });

  it("reads only the known values from the URL", () => {
    expect(povertyUnitFromParam("hogares")).toBe("hogares");
    expect(povertyUnitFromParam("otros")).toBe("personas");
    expect(povertyUnitFromParam(null)).toBe("personas");
    expect(povertyYearsFromParam("4")).toBe(4);
    expect(povertyYearsFromParam("10")).toBeNull();
  });

  it("formats semesters, rates and changes in Spanish", () => {
    expect(formatSemester("2026-S1")).toBe("1.er semestre 2026");
    expect(formatSemester("2025-S2")).toBe("2.º semestre 2025");
    expect(formatSemesterShort("2025-S2")).toBe("2S 2025");
    expect(formatPovertyRate(32.3)).toBe("32,3%");
    expect(formatPovertyChange(0.7)).toBe("+0,7 pp");
    expect(formatPovertyChange(-3.4)).toBe("-3,4 pp");
  });
});
