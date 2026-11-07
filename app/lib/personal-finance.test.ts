import { describe, expect, it } from "vitest";

import {
  compareSalaryMonths,
  isCalendarDate,
  summarizeMonthlyBudget,
} from "~/lib/personal-finance";
import { calendarMonthAfter } from "~/lib/billing-entitlement";

describe("monthly personal finance", () => {
  it("keeps allocated, spent and unassigned amounts distinct", () => {
    expect(
      summarizeMonthlyBudget(1_000_000_00, [
        {
          id: "food",
          name: "Alimentación",
          plannedCents: 250_000_00,
          spentCents: 80_000_00,
        },
        {
          id: "travel",
          name: "Viajes",
          plannedCents: 100_000_00,
          spentCents: 120_000_00,
        },
      ]),
    ).toEqual({
      incomeCents: 1_000_000_00,
      plannedCents: 350_000_00,
      spentCents: 200_000_00,
      unassignedCents: 650_000_00,
      categories: [
        {
          id: "food",
          name: "Alimentación",
          plannedCents: 250_000_00,
          spentCents: 80_000_00,
          remainingCents: 170_000_00,
        },
        {
          id: "travel",
          name: "Viajes",
          plannedCents: 100_000_00,
          spentCents: 120_000_00,
          remainingCents: -20_000_00,
        },
      ],
    });
  });

  it("does not infer unassigned income before salary is recorded", () => {
    expect(summarizeMonthlyBudget(null, []).unassignedCents).toBeNull();

    expect(
      summarizeMonthlyBudget(0, [
        { id: "x", name: "X", plannedCents: 10_000, spentCents: 2_000 },
      ]).unassignedCents,
    ).toBe(-10_000);

    expect(() =>
      summarizeMonthlyBudget(100, [
        { id: "x", name: "X", plannedCents: -1, spentCents: 0 },
      ]),
    ).toThrow();
  });

  it("compares a zero current salary without dividing by a zero previous salary", () => {
    const inflation = [
      { date: "2026-01-31", value: 3 },
      { date: "2026-02-28", value: 5 },
    ];

    expect(
      compareSalaryMonths(
        { month: "2026-01", netIncomeCents: 100_000 },
        { month: "2026-02", netIncomeCents: 0 },
        inflation,
      ),
    ).toEqual({ nominalPercent: -100, realPercent: -100 });

    expect(
      compareSalaryMonths(
        { month: "2026-01", netIncomeCents: 0 },
        { month: "2026-02", netIncomeCents: 100_000 },
        inflation,
      ),
    ).toBeNull();
  });

  it("does not invent a real salary change while IPC is unpublished", () => {
    const previous = { month: "2026-01", netIncomeCents: 100_000_00 };
    const current = { month: "2026-03", netIncomeCents: 132_000_00 };

    const inflation = [
      { date: "2026-01-31", value: 3 },
      { date: "2026-02-28", value: 10 },
      { date: "2026-03-31", value: 20 },
    ];

    expect(
      compareSalaryMonths(previous, current, inflation)?.realPercent,
    ).toBeCloseTo(0);

    const unpublished = compareSalaryMonths(
      previous,
      current,
      inflation.slice(0, 2),
    );

    expect(unpublished?.nominalPercent).toBeCloseTo(32);
    expect(unpublished?.realPercent).toBeNull();
  });

  it("validates dates and clamps a calendar-month trial", () => {
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2024-02-29")).toBe(true);

    expect(calendarMonthAfter("2026-01-31T12:00:00.000Z")).toBe(
      "2026-02-28T12:00:00.000Z",
    );
  });
});
