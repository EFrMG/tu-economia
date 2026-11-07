import { describe, expect, it } from "vitest";

import { summarizeMonthlyBudget } from "~/lib/personal-finance";
import {
  categoryCommitments,
  upcomingExpensesForMonth,
  type PlannedExpense,
} from "~/lib/upcoming-expenses";

const rent: PlannedExpense = {
  id: "rent",
  categoryId: "home",
  title: "Alquiler",
  amountCents: 400_000_00,
  amountKind: "confirmed",
  recurrence: "monthly",
  firstDueOn: "2026-01-31",
  lastDueOn: null,
  archivedAt: null,
};

describe("upcoming expenses", () => {
  it("keeps a monthly bill on the last available day", () => {
    const february = upcomingExpensesForMonth("2026-02", [rent], []);
    expect(february.occurrences[0].dueOn).toBe("2026-02-28");

    expect(
      upcomingExpensesForMonth("2028-02", [rent], []).occurrences[0].dueOn,
    ).toBe("2028-02-29");

    expect(
      upcomingExpensesForMonth("2026-03", [rent], []).occurrences[0].dueOn,
    ).toBe("2026-03-31");
  });

  it("counts only unresolved bills as commitments", () => {
    const purchase: PlannedExpense = {
      ...rent,
      id: "purchase",
      categoryId: "food",
      title: "Compra",
      amountCents: 25_000_00,
      amountKind: "estimate",
      recurrence: "once",
      firstDueOn: "2026-02-10",
    };

    const result = upcomingExpensesForMonth(
      "2026-02",
      [rent, purchase],
      [{ plannedExpenseId: "rent", dueOn: "2026-02-28", state: "paid" }],
    );

    expect(result.pendingCents).toBe(25_000_00);
    expect(result.pendingByCategory).toEqual({ food: 25_000_00 });

    expect(result.occurrences.map(({ state }) => state)).toEqual([
      "planned",
      "paid",
    ]);

    const budget = summarizeMonthlyBudget(1_000_000_00, [
      {
        id: "food",
        name: "Alimentación",
        plannedCents: 100_000_00,
        spentCents: 20_000_00,
      },
      {
        id: "home",
        name: "Vivienda",
        plannedCents: 400_000_00,
        spentCents: 400_000_00,
      },
    ]);

    expect(budget.unassignedCents).toBe(500_000_00);

    expect(categoryCommitments(budget, result)).toEqual([
      {
        categoryId: "food",
        plannedCents: 100_000_00,
        spentCents: 20_000_00,
        pendingCents: 25_000_00,
        flexibleCents: 55_000_00,
      },
      {
        categoryId: "home",
        plannedCents: 400_000_00,
        spentCents: 400_000_00,
        pendingCents: 0,
        flexibleCents: 0,
      },
    ]);
  });

  it("respects first, final and archived dates", () => {
    expect(upcomingExpensesForMonth("2025-12", [rent], []).occurrences).toEqual(
      [],
    );

    expect(
      upcomingExpensesForMonth(
        "2026-03",
        [{ ...rent, lastDueOn: "2026-02-28" }],
        [],
      ).occurrences,
    ).toEqual([]);

    expect(
      upcomingExpensesForMonth(
        "2026-03",
        [{ ...rent, archivedAt: "2026-03-01T00:00:00.000Z" }],
        [],
      ).occurrences,
    ).toEqual([]);

    expect(
      upcomingExpensesForMonth(
        "2026-02",
        [{ ...rent, archivedAt: "2026-03-01T00:00:00.000Z" }],
        [],
      ).occurrences,
    ).toHaveLength(1);

    expect(
      upcomingExpensesForMonth(
        "2026-03",
        [{ ...rent, archivedAt: "2026-03-01T00:00:00.000Z" }],
        [{ plannedExpenseId: "rent", dueOn: "2026-03-31", state: "paid" }],
      ).occurrences[0].state,
    ).toBe("paid");
  });
});
