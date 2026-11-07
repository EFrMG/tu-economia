import { describe, expect, it } from "vitest";

import {
  chartPeriodFromSearchParam,
  gapPeriodChange,
  historicalGap,
  historyForCalendarDays,
  mergeHistoricalSeries,
  normalizeHistory,
} from "~/lib/exchange-rate-history";

describe("exchange-rate history", () => {
  it("sorts valid source dates and drops malformed dates", () => {
    expect(
      normalizeHistory([
        { fecha: "2026-01-15", venta: 150 },
        { fecha: "not-a-date", venta: 200 },
        { fecha: "2026-01-13", venta: 130 },
        { fecha: "2026-02-30", venta: 230 },
      ]),
    ).toEqual([
      { fecha: "2026-01-13", venta: 130 },
      { fecha: "2026-01-15", venta: 150 },
    ]);
  });

  it("merges Blue and Oficial closes while preserving a missing observation", () => {
    expect(
      mergeHistoricalSeries(
        [
          { fecha: "2026-01-13", venta: 120 },
          { fecha: "2026-01-15", venta: 140 },
        ],
        [
          { fecha: "2026-01-14", venta: 110 },
          { fecha: "2026-01-15", venta: 115 },
        ],
      ),
    ).toEqual([
      { fecha: "2026-01-13", blue: 120, oficial: null },
      { fecha: "2026-01-14", blue: null, oficial: 110 },
      { fecha: "2026-01-15", blue: 140, oficial: 115 },
    ]);
  });

  it("uses inclusive calendar-day boundaries instead of a count of observations", () => {
    const points = [
      { fecha: "2026-01-08", venta: 100 },
      { fecha: "2026-01-09", venta: 101 },
      { fecha: "2026-01-12", venta: 102 },
      { fecha: "2026-01-15", venta: 103 },
    ];

    expect(historyForCalendarDays(points, 7, "2026-01-15")).toEqual([
      { fecha: "2026-01-09", venta: 101 },
      { fecha: "2026-01-12", venta: 102 },
      { fecha: "2026-01-15", venta: 103 },
    ]);
  });

  it("keeps the selected 90-day calendar window across a year boundary", () => {
    const points = [
      { fecha: "2025-12-01", venta: 100 },
      { fecha: "2025-12-02", venta: 101 },
      { fecha: "2026-03-01", venta: 102 },
    ];

    expect(historyForCalendarDays(points, 90, "2026-03-01")).toEqual(
      points.slice(1),
    );
  });

  it("accepts only the three shareable period values", () => {
    expect(["7", "30", "90"].map(chartPeriodFromSearchParam)).toEqual([
      7, 30, 90,
    ]);

    expect(chartPeriodFromSearchParam("14")).toBe(30);
    expect(chartPeriodFromSearchParam(null)).toBe(30);
  });

  it("calculates same-date gaps and the change in percentage points", () => {
    const points = historicalGap([
      { fecha: "2026-01-13", blue: 120, oficial: 100 },
      { fecha: "2026-01-14", blue: 130, oficial: null },
      { fecha: "2026-01-15", blue: 140, oficial: 100 },
      { fecha: "2026-01-16", blue: 150, oficial: 0 },
    ]);

    expect(points).toEqual([
      { fecha: "2026-01-13", gap: 20 },
      { fecha: "2026-01-14", gap: null },
      { fecha: "2026-01-15", gap: 40 },
      { fecha: "2026-01-16", gap: null },
    ]);

    expect(gapPeriodChange(points)?.change).toBe(20);
  });
});
