import { describe, expect, it } from "vitest";

import {
  applyFinanceCommand,
  buildLocalFinanceMonth,
  initialLocalFinance,
  parseLocalFinanceDocument,
  parsePesosToCents,
} from "~/lib/local-finance";

describe("local salary tracker", () => {
  let categoryNumber = 0;
  const document = initialLocalFinance(() => `category-${++categoryNumber}`);

  it("parses pesos without guessing thousands separators", () => {
    expect(parsePesosToCents("250000,50")).toBe(25_000_050);
    expect(parsePesosToCents("250000.5")).toBe(25_000_050);
    expect(parsePesosToCents("1.000")).toBeNull();
    expect(parsePesosToCents("0")).toBeNull();
    expect(parsePesosToCents("0", true)).toBe(0);
  });

  it("stores and edits an optional expense description without changing its amount", () => {
    expect(
      buildLocalFinanceMonth(document, "2026-10", null).isFirstMonthSetup,
    ).toBe(true);

    let next = applyFinanceCommand(
      document,
      {
        kind: "expense.add",
        categoryId: "category-1",
        incurredOn: "2026-10-08",
        amountCents: 12_500,
        description: "  Supermercado  ",
      },
      () => "expense-described",
    );

    expect(next.expenses[0].description).toBe("Supermercado");

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).isFirstMonthSetup,
    ).toBe(false);

    next = applyFinanceCommand(next, {
      kind: "expense.update",
      expenseId: "expense-described",
      categoryId: "category-1",
      incurredOn: "2026-10-08",
      amountCents: 12_500,
      description: "  Compra semanal  ",
    });

    expect(next.expenses[0].description).toBe("Compra semanal");
    expect(next.expenses[0].amountCents).toBe(12_500);

    expect(() =>
      applyFinanceCommand(next, {
        kind: "expense.update",
        expenseId: "expense-described",
        categoryId: "category-1",
        incurredOn: "2026-10-08",
        amountCents: 12_500,
        description: "x".repeat(101),
      }),
    ).toThrow("100 caracteres");

    expect(next.expenses[0].description).toBe("Compra semanal");

    next = applyFinanceCommand(next, {
      kind: "expense.update",
      expenseId: "expense-described",
      categoryId: "category-1",
      incurredOn: "2026-10-08",
      amountCents: 12_500,
      description: "",
    });

    expect(next.expenses[0].description).toBe("");
  });

  it("keeps planned, paid and recorded amounts from being counted twice", () => {
    let next = applyFinanceCommand(document, {
      kind: "salary.save",
      month: "2026-10",
      amountCents: 1_000_000_00,
    });

    next = applyFinanceCommand(next, {
      kind: "allocation.save",
      month: "2026-10",
      categoryId: "category-1",
      amountCents: 400_000_00,
    });

    next = applyFinanceCommand(
      next,
      {
        kind: "plan.add",
        categoryId: "category-1",
        title: "Alquiler",
        amountCents: 400_000_00,
        amountKind: "confirmed",
        recurrence: "monthly",
        firstDueOn: "2026-10-31",
      },
      () => "plan-1",
    );

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).commitments[0].pendingCents,
    ).toBe(400_000_00);

    next = applyFinanceCommand(next, {
      kind: "plan.skip",
      planId: "plan-1",
      dueOn: "2026-10-31",
    });

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).upcoming.pendingCents,
    ).toBe(0);

    next = applyFinanceCommand(next, {
      kind: "plan.reopen",
      planId: "plan-1",
      dueOn: "2026-10-31",
    });

    next = applyFinanceCommand(
      next,
      {
        kind: "plan.pay",
        planId: "plan-1",
        dueOn: "2026-10-31",
        incurredOn: "2026-10-29",
        amountCents: 400_000_00,
      },
      () => "expense-1",
    );

    const month = buildLocalFinanceMonth(next, "2026-10", null);
    expect(month.budget.spentCents).toBe(400_000_00);
    expect(month.upcoming.pendingCents).toBe(0);
    expect(month.commitments[0].flexibleCents).toBe(0);
    expect(month.budget.unassignedCents).toBe(600_000_00);

    next = applyFinanceCommand(next, {
      kind: "expense.remove",
      expenseId: "expense-1",
    });

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).upcoming.pendingCents,
    ).toBe(400_000_00);
  });

  it("retains category history when a category is archived", () => {
    let next = applyFinanceCommand(document, {
      kind: "allocation.save",
      month: "2026-09",
      categoryId: "category-1",
      amountCents: 100_000_00,
    });

    next = applyFinanceCommand(next, {
      kind: "category.archive",
      categoryId: "category-1",
      effectiveOn: "2026-10-01",
    });

    expect(
      buildLocalFinanceMonth(next, "2026-09", null).budget.categories,
    ).toHaveLength(6);

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).activeCategories,
    ).toHaveLength(5);

    next = applyFinanceCommand(next, {
      kind: "category.restore",
      categoryId: "category-1",
    });

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).activeCategories,
    ).toHaveLength(6);
  });

  it("edits an expense without breaking its planned payment", () => {
    let next = applyFinanceCommand(
      document,
      {
        kind: "plan.add",
        categoryId: "category-1",
        title: "Internet",
        amountCents: 10_000,
        amountKind: "confirmed",
        recurrence: "monthly",
        firstDueOn: "2026-10-15",
      },
      () => "plan-1",
    );

    next = applyFinanceCommand(
      next,
      {
        kind: "plan.pay",
        planId: "plan-1",
        dueOn: "2026-10-15",
        incurredOn: "2026-10-14",
        amountCents: 10_000,
      },
      () => "expense-1",
    );

    expect(() =>
      applyFinanceCommand(next, {
        kind: "expense.update",
        expenseId: "expense-1",
        categoryId: "category-2",
        incurredOn: "2026-10-14",
        amountCents: 11_000,
      }),
    ).toThrow("categoría");

    next = applyFinanceCommand(next, {
      kind: "expense.update",
      expenseId: "expense-1",
      categoryId: "category-1",
      incurredOn: "2026-11-01",
      amountCents: 11_000,
    });

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).upcoming.pendingCents,
    ).toBe(0);

    expect(
      buildLocalFinanceMonth(next, "2026-11", null).budget.spentCents,
    ).toBe(11_000);

    expect(parseLocalFinanceDocument(next).resolutions[0].expenseId).toBe(
      "expense-1",
    );
  });

  it("revises a monthly bill from the selected month while preserving paid history", () => {
    let next = applyFinanceCommand(
      document,
      {
        kind: "plan.add",
        categoryId: "category-1",
        title: "Internet",
        amountCents: 10_000,
        amountKind: "confirmed",
        recurrence: "monthly",
        firstDueOn: "2026-09-15",
      },
      () => "plan-1",
    );

    next = applyFinanceCommand(
      next,
      {
        kind: "plan.pay",
        planId: "plan-1",
        dueOn: "2026-09-15",
        incurredOn: "2026-09-15",
        amountCents: 10_000,
      },
      () => "expense-1",
    );

    next = applyFinanceCommand(
      next,
      {
        kind: "plan.revise",
        planId: "plan-1",
        dueOn: "2026-10-15",
        firstDueOn: "2026-10-20",
        amountCents: 12_000,
      },
      () => "plan-2",
    );

    expect(
      buildLocalFinanceMonth(next, "2026-09", null).upcoming.occurrences[0]
        .state,
    ).toBe("paid");

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).upcoming.occurrences.map(
        (item) => item.dueOn,
      ),
    ).toEqual(["2026-10-20"]);

    expect(
      buildLocalFinanceMonth(next, "2026-11", null).upcoming.pendingCents,
    ).toBe(12_000);

    expect(parseLocalFinanceDocument(next).plans).toHaveLength(2);
  });

  it("blocks a historical bill revision after later settled months and names the first safe month", () => {
    let next = applyFinanceCommand(
      document,
      {
        kind: "plan.add",
        categoryId: "category-1",
        title: "Internet",
        amountCents: 10_000,
        amountKind: "confirmed",
        recurrence: "monthly",
        firstDueOn: "2026-01-15",
      },
      () => "plan-history",
    );

    next = applyFinanceCommand(
      next,
      {
        kind: "plan.pay",
        planId: "plan-history",
        dueOn: "2026-02-15",
        incurredOn: "2026-02-15",
        amountCents: 10_000,
      },
      () => "expense-history",
    );

    next = applyFinanceCommand(next, {
      kind: "plan.skip",
      planId: "plan-history",
      dueOn: "2026-04-15",
    });

    expect(() =>
      applyFinanceCommand(next, {
        kind: "plan.revise",
        planId: "plan-history",
        dueOn: "2026-01-15",
        firstDueOn: "2026-01-20",
        amountCents: 12_000,
      }),
    ).toThrow("2026-05");

    expect(
      buildLocalFinanceMonth(next, "2026-02", null).upcoming.occurrences,
    ).toHaveLength(1);

    expect(
      buildLocalFinanceMonth(next, "2026-02", null).upcoming.pendingCents,
    ).toBe(0);

    expect(parseLocalFinanceDocument(next).plans).toHaveLength(1);
  });

  it("does not create a second successor from an older version of a monthly bill", () => {
    let next = applyFinanceCommand(
      document,
      {
        kind: "plan.add",
        categoryId: "category-1",
        title: "Internet",
        amountCents: 10_000,
        amountKind: "confirmed",
        recurrence: "monthly",
        firstDueOn: "2026-01-15",
      },
      () => "plan-original",
    );

    next = applyFinanceCommand(
      next,
      {
        kind: "plan.revise",
        planId: "plan-original",
        dueOn: "2026-03-15",
        firstDueOn: "2026-03-20",
        amountCents: 12_000,
      },
      () => "plan-current",
    );

    expect(() =>
      applyFinanceCommand(next, {
        kind: "plan.revise",
        planId: "plan-original",
        dueOn: "2026-02-15",
        firstDueOn: "2026-02-20",
        amountCents: 11_000,
      }),
    ).toThrow("ya terminó");

    expect(
      buildLocalFinanceMonth(next, "2026-03", null).upcoming.occurrences,
    ).toHaveLength(1);

    expect(parseLocalFinanceDocument(next).plans).toHaveLength(2);
  });

  it("copies only missing values from the latest earlier plan and keeps intentional zeroes", () => {
    let next = applyFinanceCommand(document, {
      kind: "salary.save",
      month: "2026-08",
      amountCents: 100_000,
    });

    next = applyFinanceCommand(next, {
      kind: "allocation.save",
      month: "2026-08",
      categoryId: "category-1",
      amountCents: 50_000,
    });

    next = applyFinanceCommand(next, {
      kind: "salary.save",
      month: "2026-09",
      amountCents: 200_000,
    });

    next = applyFinanceCommand(next, {
      kind: "allocation.save",
      month: "2026-09",
      categoryId: "category-1",
      amountCents: 30_000,
    });

    next = applyFinanceCommand(next, {
      kind: "allocation.save",
      month: "2026-09",
      categoryId: "category-2",
      amountCents: 0,
    });

    next = applyFinanceCommand(next, {
      kind: "allocation.save",
      month: "2026-10",
      categoryId: "category-1",
      amountCents: 0,
    });

    next = applyFinanceCommand(next, {
      kind: "expense.add",
      categoryId: "category-1",
      incurredOn: "2026-10-03",
      amountCents: 5_000,
    });

    const preview = buildLocalFinanceMonth(next, "2026-10", null).copyPreview;
    expect(preview?.sourceMonth).toBe("2026-09");
    expect(preview?.salaryWillCopy).toBe(true);

    expect(preview?.allocations.map(({ willCopy }) => willCopy)).toEqual([
      false,
      true,
    ]);

    next = applyFinanceCommand(next, {
      kind: "month.copy",
      month: "2026-10",
      sourceMonth: preview!.sourceMonth,
      sourceSnapshot: preview!.sourceSnapshot,
    });

    expect(next.salaries["2026-10"]).toBe(200_000);
    expect(next.allocations["2026-10"]["category-1"]).toBe(0);
    expect(next.allocations["2026-10"]["category-2"]).toBe(0);
    expect(next.expenses).toHaveLength(1);

    expect(
      parseLocalFinanceDocument(JSON.parse(JSON.stringify(next))).version,
    ).toBe(1);

    next = applyFinanceCommand(next, {
      kind: "salary.save",
      month: "2026-11",
      amountCents: 250_000,
    });

    const novemberPreview = buildLocalFinanceMonth(
      next,
      "2026-11",
      null,
    ).copyPreview!;

    expect(novemberPreview.sourceMonth).toBe("2026-10");
    expect(novemberPreview.salaryWillCopy).toBe(false);

    next = applyFinanceCommand(next, {
      kind: "month.copy",
      month: "2026-11",
      sourceMonth: novemberPreview.sourceMonth,
      sourceSnapshot: novemberPreview.sourceSnapshot,
    });

    expect(next.salaries["2026-11"]).toBe(250_000);
  });

  it("keeps a zero salary distinct from an unset month during copy and backup validation", () => {
    let next = applyFinanceCommand(document, {
      kind: "salary.save",
      month: "2026-09",
      amountCents: 100_000,
    });

    next = applyFinanceCommand(next, {
      kind: "allocation.save",
      month: "2026-09",
      categoryId: "category-1",
      amountCents: 30_000,
    });

    next = applyFinanceCommand(next, {
      kind: "salary.save",
      month: "2026-10",
      amountCents: 0,
    });

    const octoberPreview = buildLocalFinanceMonth(
      next,
      "2026-10",
      null,
    ).copyPreview!;

    expect(octoberPreview.salaryWillCopy).toBe(false);

    next = applyFinanceCommand(next, {
      kind: "month.copy",
      month: "2026-10",
      sourceMonth: octoberPreview.sourceMonth,
      sourceSnapshot: octoberPreview.sourceSnapshot,
    });

    expect(next.salaries["2026-10"]).toBe(0);

    expect(
      buildLocalFinanceMonth(next, "2026-10", null).budget.unassignedCents,
    ).toBe(-30_000);

    const novemberPreview = buildLocalFinanceMonth(
      next,
      "2026-11",
      null,
    ).copyPreview!;

    expect(novemberPreview.salaryCents).toBe(0);
    expect(novemberPreview.salaryWillCopy).toBe(true);

    next = applyFinanceCommand(next, {
      kind: "month.copy",
      month: "2026-11",
      sourceMonth: novemberPreview.sourceMonth,
      sourceSnapshot: novemberPreview.sourceSnapshot,
    });

    expect(
      parseLocalFinanceDocument(JSON.parse(JSON.stringify(next))).salaries[
        "2026-11"
      ],
    ).toBe(0);
  });

  it("refuses to copy unseen changes to the source plan", () => {
    let next = applyFinanceCommand(document, {
      kind: "allocation.save",
      month: "2026-09",
      categoryId: "category-1",
      amountCents: 30_000,
    });

    const preview = buildLocalFinanceMonth(next, "2026-10", null).copyPreview!;

    next = applyFinanceCommand(next, {
      kind: "allocation.save",
      month: "2026-09",
      categoryId: "category-1",
      amountCents: 40_000,
    });

    expect(() =>
      applyFinanceCommand(next, {
        kind: "month.copy",
        month: "2026-10",
        sourceMonth: preview.sourceMonth,
        sourceSnapshot: preview.sourceSnapshot,
      }),
    ).toThrow("origen cambió");

    expect(next.allocations["2026-10"]).toBeUndefined();
  });

  it("continues to accept version-one backups with pre-existing overlapping bill schedules", () => {
    const legacy = structuredClone(document);

    legacy.plans.push(
      {
        id: "old-plan",
        categoryId: "category-1",
        title: "Internet",
        amountCents: 10_000,
        amountKind: "confirmed",
        recurrence: "monthly",
        firstDueOn: "2026-01-15",
        lastDueOn: null,
        archivedAt: "2026-01-15",
        revisesPlanId: null,
      },
      {
        id: "new-plan",
        categoryId: "category-1",
        title: "Internet",
        amountCents: 12_000,
        amountKind: "confirmed",
        recurrence: "monthly",
        firstDueOn: "2026-01-20",
        lastDueOn: null,
        archivedAt: null,
        revisesPlanId: null,
      },
    );

    legacy.expenses.push({
      id: "paid-old",
      categoryId: "category-1",
      incurredOn: "2026-02-15",
      amountCents: 10_000,
      description: "",
    });

    legacy.resolutions.push({
      plannedExpenseId: "old-plan",
      dueOn: "2026-02-15",
      state: "paid",
      expenseId: "paid-old",
    });

    const backup = JSON.parse(JSON.stringify(legacy)) as {
      plans: Record<string, unknown>[];
    };

    for (const plan of backup.plans) delete plan.revisesPlanId;

    const restored = parseLocalFinanceDocument(backup);

    expect(restored.plans.every((plan) => plan.revisesPlanId === null)).toBe(
      true,
    );

    expect(
      buildLocalFinanceMonth(restored, "2026-02", null).upcoming.occurrences,
    ).toHaveLength(2);
  });

  it("rejects a backup with a payment linked to the wrong category", () => {
    const invalid = {
      ...document,
      expenses: [
        {
          id: "paid-1",
          categoryId: "category-2",
          incurredOn: "2026-10-05",
          amountCents: 100,
        },
      ],
      plans: [
        {
          id: "plan-1",
          categoryId: "category-1",
          title: "Alquiler",
          amountCents: 100,
          amountKind: "confirmed",
          recurrence: "once",
          firstDueOn: "2026-10-05",
          lastDueOn: null,
          archivedAt: null,
        },
      ],
      resolutions: [
        {
          plannedExpenseId: "plan-1",
          dueOn: "2026-10-05",
          state: "paid",
          expenseId: "paid-1",
        },
      ],
    };

    expect(() => parseLocalFinanceDocument(invalid)).toThrow();
  });

  it("imports older local records and keeps savings goals separate from the monthly budget", () => {
    const legacy = structuredClone(document) as Partial<typeof document>;
    delete legacy.goals;
    let next = parseLocalFinanceDocument(legacy);
    expect(next.goals).toEqual([]);

    next = applyFinanceCommand(
      next,
      {
        kind: "goal.add",
        name: "Fondo de emergencia",
        targetCents: 500_000_00,
      },
      () => "goal-1",
    );

    next = applyFinanceCommand(next, {
      kind: "goal.update",
      goalId: "goal-1",
      name: "Fondo de emergencia",
      targetCents: 500_000_00,
      savedCents: 100_000_00,
    });

    const month = buildLocalFinanceMonth(next, "2026-10", null);
    expect(month.goals[0].savedCents).toBe(100_000_00);
    expect(month.budget.spentCents).toBe(0);
    expect(parseLocalFinanceDocument(next).goals).toHaveLength(1);

    expect(
      applyFinanceCommand(next, { kind: "goal.remove", goalId: "goal-1" })
        .goals,
    ).toEqual([]);
  });
});
