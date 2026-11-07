import type { IndicatorPoint } from "~/lib/indicators";
import { calculatePurchasingPower } from "~/lib/purchasing-power";

export interface BudgetCategoryTotal {
  id: string;
  name: string;
  plannedCents: number;
  spentCents: number;
}

export interface BudgetCategorySummary extends BudgetCategoryTotal {
  remainingCents: number;
}

export interface MonthlyBudgetSummary {
  incomeCents: number | null;
  plannedCents: number;
  spentCents: number;
  unassignedCents: number | null;
  categories: BudgetCategorySummary[];
}

export interface SalaryComparison {
  nominalPercent: number;
  realPercent: number | null;
}

export const isMonth = (value: string) =>
  /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value);

export const isCalendarDate = (value: string) => {
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

export const isMoneyCents = (value: number, allowZero = false) =>
  Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);

/** These totals describe a spending plan; they are not a bank balance or confirmed savings. */
export function summarizeMonthlyBudget(
  incomeCents: number | null,
  categories: BudgetCategoryTotal[],
): MonthlyBudgetSummary {
  if (incomeCents !== null && !isMoneyCents(incomeCents, true))
    throw new RangeError("Invalid monthly income");

  if (
    categories.some(
      ({ plannedCents, spentCents }) =>
        !isMoneyCents(plannedCents, true) || !isMoneyCents(spentCents, true),
    )
  )
    throw new RangeError("Invalid category amount");

  const plannedCents = categories.reduce(
    (total, category) => total + category.plannedCents,
    0,
  );

  const spentCents = categories.reduce(
    (total, category) => total + category.spentCents,
    0,
  );

  if (!Number.isSafeInteger(plannedCents) || !Number.isSafeInteger(spentCents))
    throw new RangeError("Monthly total is too large");

  return {
    incomeCents,
    plannedCents,
    spentCents,
    unassignedCents: incomeCents === null ? null : incomeCents - plannedCents,
    categories: categories.map((category) => ({
      ...category,
      remainingCents: category.plannedCents - category.spentCents,
    })),
  };
}

/** Real change is shown only when published IPC covers the complete comparison period. */
export function compareSalaryMonths(
  previous: { month: string; netIncomeCents: number },
  current: { month: string; netIncomeCents: number },
  inflation: IndicatorPoint[],
): SalaryComparison | null {
  if (
    !isMonth(previous.month) ||
    !isMonth(current.month) ||
    previous.month >= current.month ||
    !isMoneyCents(previous.netIncomeCents) ||
    !isMoneyCents(current.netIncomeCents, true)
  )
    return null;

  const previousAdjusted = calculatePurchasingPower(
    previous.netIncomeCents,
    previous.month,
    inflation.filter(({ date }) => date.slice(0, 7) <= current.month),
  );

  return {
    nominalPercent:
      (current.netIncomeCents / previous.netIncomeCents - 1) * 100,
    realPercent:
      previousAdjusted?.throughMonth === current.month
        ? (current.netIncomeCents / previousAdjusted.adjustedAmount - 1) * 100
        : null,
  };
}
