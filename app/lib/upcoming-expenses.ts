import {
  isCalendarDate,
  isMoneyCents,
  isMonth,
  type MonthlyBudgetSummary,
} from "~/lib/personal-finance";

export interface PlannedExpense {
  id: string;
  categoryId: string;
  title: string;
  amountCents: number;
  amountKind: "confirmed" | "estimate";
  recurrence: "once" | "monthly";
  firstDueOn: string;
  lastDueOn: string | null;
  archivedAt: string | null;
}

export interface PlannedExpenseResolution {
  plannedExpenseId: string;
  dueOn: string;
  state: "paid" | "skipped";
}

export interface UpcomingOccurrence extends PlannedExpense {
  dueOn: string;
  state: "planned" | "paid" | "skipped";
}

export interface UpcomingMonth {
  month: string;
  occurrences: UpcomingOccurrence[];
  pendingCents: number;
  pendingByCategory: Record<string, number>;
}

export interface CategoryCommitment {
  categoryId: string;
  plannedCents: number;
  spentCents: number;
  pendingCents: number;
  flexibleCents: number;
}

function dueOnForMonth(expense: PlannedExpense, month: string) {
  if (
    !isCalendarDate(expense.firstDueOn) ||
    (expense.lastDueOn && !isCalendarDate(expense.lastDueOn))
  )
    throw new RangeError("Invalid planned expense date");

  const firstMonth = expense.firstDueOn.slice(0, 7);
  if (expense.recurrence === "once")
    return firstMonth === month ? expense.firstDueOn : null;

  if (expense.recurrence !== "monthly" || firstMonth > month) return null;

  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dueDay = Math.min(Number(expense.firstDueOn.slice(8, 10)), lastDay);
  return `${month}-${String(dueDay).padStart(2, "0")}`;
}

/** Paid occurrences remain visible, but only unresolved plans count as future commitments. */
export function upcomingExpensesForMonth(
  month: string,
  plans: PlannedExpense[],
  resolutions: PlannedExpenseResolution[],
): UpcomingMonth {
  if (!isMonth(month)) throw new RangeError("Invalid month");

  const resolutionByOccurrence = new Map(
    resolutions.map((resolution) => [
      `${resolution.plannedExpenseId}|${resolution.dueOn}`,
      resolution.state,
    ]),
  );

  const occurrences: UpcomingOccurrence[] = [];
  const pendingByCategory: Record<string, number> = {};
  let pendingCents = 0;

  for (const plan of plans) {
    if (!isMoneyCents(plan.amountCents))
      throw new RangeError("Invalid planned expense amount");

    const dueOn = dueOnForMonth(plan, month);

    const state = dueOn
      ? (resolutionByOccurrence.get(`${plan.id}|${dueOn}`) ?? "planned")
      : "planned";

    if (
      !dueOn ||
      (plan.lastDueOn && dueOn > plan.lastDueOn) ||
      (plan.archivedAt &&
        dueOn >= plan.archivedAt.slice(0, 10) &&
        state === "planned")
    )
      continue;

    occurrences.push({ ...plan, dueOn, state });

    if (state === "planned") {
      pendingCents += plan.amountCents;

      pendingByCategory[plan.categoryId] =
        (pendingByCategory[plan.categoryId] ?? 0) + plan.amountCents;
    }
  }

  if (
    !Number.isSafeInteger(pendingCents) ||
    Object.values(pendingByCategory).some(
      (amount) => !Number.isSafeInteger(amount),
    )
  )
    throw new RangeError("Upcoming total is too large");

  occurrences.sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title, "es"),
  );

  return { month, occurrences, pendingCents, pendingByCategory };
}

/** Pending commitments are inside category allocations, so they do not change unassigned salary. */
export function categoryCommitments(
  budget: MonthlyBudgetSummary,
  upcoming: UpcomingMonth,
): CategoryCommitment[] {
  return budget.categories.map((category) => {
    const pendingCents = upcoming.pendingByCategory[category.id] ?? 0;
    return {
      categoryId: category.id,
      plannedCents: category.plannedCents,
      spentCents: category.spentCents,
      pendingCents,
      flexibleCents: category.plannedCents - category.spentCents - pendingCents,
    };
  });
}
