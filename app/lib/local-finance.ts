import { z } from "zod";

import type { IndicatorPoint } from "~/lib/indicators";
import {
  compareSalaryMonths,
  isCalendarDate,
  isMoneyCents,
  isMonth,
  summarizeMonthlyBudget,
} from "~/lib/personal-finance";
import {
  categoryCommitments,
  upcomingExpensesForMonth,
} from "~/lib/upcoming-expenses";

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  archivedAt: z.string().nullable(),
});

const expenseSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  incurredOn: z.string(),
  amountCents: z.number().int().positive(),
  description: z.string().trim().max(100).default(""),
});

const planSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  title: z.string().min(1).max(80),
  amountCents: z.number().int().positive(),
  amountKind: z.enum(["confirmed", "estimate"]),
  recurrence: z.enum(["once", "monthly"]),
  firstDueOn: z.string(),
  lastDueOn: z.string().nullable(),
  archivedAt: z.string().nullable(),
  revisesPlanId: z.string().min(1).nullable().default(null),
});

const resolutionSchema = z.object({
  plannedExpenseId: z.string().min(1),
  dueOn: z.string(),
  state: z.enum(["paid", "skipped"]),
  expenseId: z.string().nullable(),
});

const goalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  targetCents: z.number().int().positive(),
  savedCents: z.number().int().nonnegative(),
});

export const localFinanceSchema = z.object({
  version: z.literal(1),
  salaries: z
    .record(z.string(), z.number().int().nonnegative())
    .refine(
      (value) => Object.keys(value).length <= 240,
      "Too many salary months",
    ),
  categories: z.array(categorySchema).max(300),
  allocations: z
    .record(
      z.string(),
      z
        .record(z.string(), z.number().int().nonnegative())
        .refine(
          (value) => Object.keys(value).length <= 300,
          "Too many allocation categories",
        ),
    )
    .refine(
      (value) => Object.keys(value).length <= 240,
      "Too many allocation months",
    ),
  expenses: z.array(expenseSchema).max(5000),
  plans: z.array(planSchema).max(1000),
  resolutions: z.array(resolutionSchema).max(10000),
  goals: z.array(goalSchema).max(200).default([]),
});

export type LocalFinanceDocument = z.infer<typeof localFinanceSchema>;
export type LocalCategory = LocalFinanceDocument["categories"][number];
export type LocalExpense = LocalFinanceDocument["expenses"][number];
export type LocalGoal = LocalFinanceDocument["goals"][number];

export interface FinanceActionResult {
  ok: boolean;
  message: string;
}

/** Validate stored and imported documents before any UI or mutation consumes them. */
export function parseLocalFinanceDocument(
  value: unknown,
): LocalFinanceDocument {
  const document = localFinanceSchema.parse(value);
  const categoryIds = new Set(document.categories.map((item) => item.id));
  const expenseIds = new Set(document.expenses.map((item) => item.id));
  const planIds = new Set(document.plans.map((item) => item.id));
  const goalIds = new Set(document.goals.map((item) => item.id));
  if (
    categoryIds.size !== document.categories.length ||
    expenseIds.size !== document.expenses.length ||
    planIds.size !== document.plans.length ||
    goalIds.size !== document.goals.length
  )
    throw new RangeError("El archivo contiene identificadores repetidos.");

  for (const [month, amount] of Object.entries(document.salaries)) {
    if (!isMonth(month) || !isMoneyCents(amount, true))
      throw new RangeError("El archivo contiene un sueldo inválido.");
  }

  for (const [month, categories] of Object.entries(document.allocations)) {
    if (
      !isMonth(month) ||
      Object.entries(categories).some(
        ([id, amount]) => !categoryIds.has(id) || !isMoneyCents(amount, true),
      )
    )
      throw new RangeError("El archivo contiene un presupuesto inválido.");
  }

  if (
    document.expenses.some(
      (item) =>
        !categoryIds.has(item.categoryId) ||
        !isCalendarDate(item.incurredOn) ||
        !isMoneyCents(item.amountCents),
    )
  )
    throw new RangeError("El archivo contiene un gasto inválido.");

  if (
    document.plans.some(
      (item) =>
        !categoryIds.has(item.categoryId) ||
        !item.title.trim() ||
        !isCalendarDate(item.firstDueOn) ||
        (item.lastDueOn !== null &&
          (!isCalendarDate(item.lastDueOn) ||
            item.lastDueOn < item.firstDueOn)) ||
        (item.archivedAt !== null && !isCalendarDate(item.archivedAt)) ||
        !isMoneyCents(item.amountCents),
    )
  )
    throw new RangeError("El archivo contiene un gasto previsto inválido.");

  if (
    document.plans.some(
      (item) =>
        item.revisesPlanId !== null &&
        (item.revisesPlanId === item.id ||
          !document.plans.some(
            (parent) =>
              parent.id === item.revisesPlanId &&
              parent.recurrence === "monthly",
          )),
    )
  )
    throw new RangeError(
      "El archivo contiene una revisión de gasto previsto inválida.",
    );

  if (
    document.categories.some(
      (item) =>
        !item.name.trim() ||
        (item.archivedAt !== null && !isCalendarDate(item.archivedAt)),
    )
  )
    throw new RangeError("El archivo contiene una categoría inválida.");

  if (
    document.goals.some(
      (item) =>
        !item.name.trim() ||
        !isMoneyCents(item.targetCents) ||
        !isMoneyCents(item.savedCents, true),
    )
  )
    throw new RangeError("El archivo contiene una meta de ahorro inválida.");

  const resolutionKeys = new Set<string>();
  const resolvedExpenseIds = new Set<string>();
  for (const resolution of document.resolutions) {
    const plan = document.plans.find(
      (item) => item.id === resolution.plannedExpenseId,
    );

    const key = `${resolution.plannedExpenseId}|${resolution.dueOn}`;
    if (!plan || !isCalendarDate(resolution.dueOn) || resolutionKeys.has(key))
      throw new RangeError("El archivo contiene un vencimiento inválido.");

    const occurrence = upcomingExpensesForMonth(
      resolution.dueOn.slice(0, 7),
      [plan],
      [resolution],
    ).occurrences[0];

    if (
      !occurrence ||
      occurrence.dueOn !== resolution.dueOn ||
      (resolution.state === "paid") !== (resolution.expenseId !== null) ||
      (resolution.expenseId !== null &&
        (!expenseIds.has(resolution.expenseId) ||
          resolvedExpenseIds.has(resolution.expenseId) ||
          document.expenses.find((item) => item.id === resolution.expenseId)
            ?.categoryId !== plan.categoryId))
    )
      throw new RangeError("El archivo contiene un pago previsto inválido.");

    resolutionKeys.add(key);

    if (resolution.expenseId !== null)
      resolvedExpenseIds.add(resolution.expenseId);
  }

  return document;
}

export type FinanceCommand =
  | { kind: "salary.save"; month: string; amountCents: number }
  | {
      kind: "month.copy";
      month: string;
      sourceMonth: string;
      sourceSnapshot: string;
    }
  | { kind: "category.add"; name: string }
  | { kind: "category.rename"; categoryId: string; name: string }
  | { kind: "category.archive"; categoryId: string; effectiveOn: string }
  | { kind: "category.restore"; categoryId: string }
  | {
      kind: "allocation.save";
      month: string;
      categoryId: string;
      amountCents: number;
    }
  | {
      kind: "expense.add";
      categoryId: string;
      incurredOn: string;
      amountCents: number;
      description?: string;
    }
  | {
      kind: "expense.update";
      expenseId: string;
      categoryId: string;
      incurredOn: string;
      amountCents: number;
      description?: string;
    }
  | { kind: "expense.remove"; expenseId: string }
  | {
      kind: "plan.add";
      categoryId: string;
      title: string;
      amountCents: number;
      amountKind: "confirmed" | "estimate";
      recurrence: "once" | "monthly";
      firstDueOn: string;
    }
  | { kind: "plan.archive"; planId: string; effectiveOn: string }
  | {
      kind: "plan.revise";
      planId: string;
      dueOn: string;
      firstDueOn: string;
      amountCents: number;
    }
  | { kind: "plan.skip"; planId: string; dueOn: string }
  | { kind: "plan.reopen"; planId: string; dueOn: string }
  | {
      kind: "plan.pay";
      planId: string;
      dueOn: string;
      incurredOn: string;
      amountCents: number;
    }
  | { kind: "goal.add"; name: string; targetCents: number }
  | {
      kind: "goal.update";
      goalId: string;
      name: string;
      targetCents: number;
      savedCents: number;
    }
  | { kind: "goal.remove"; goalId: string };

const STARTER_CATEGORIES = [
  "Vivienda",
  "Alimentación",
  "Transporte",
  "Servicios",
  "Salud",
  "Otros",
];

function nextMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);

  return date.toISOString().slice(0, 7);
}

/** Offer only an earlier plan with values for categories that can still be edited. */
function monthCopyPreview(document: LocalFinanceDocument, month: string) {
  const activeCategories = document.categories.filter(
    (category) => category.archivedAt === null,
  );

  const sourceMonth = Object.keys(document.allocations)
    .filter(
      (candidate) =>
        candidate < month &&
        activeCategories.some(
          (category) =>
            document.allocations[candidate][category.id] !== undefined,
        ),
    )
    .sort()
    .at(-1);

  if (!sourceMonth) return null;

  const sourceAllocations = document.allocations[sourceMonth];
  const targetAllocations = document.allocations[month] ?? {};

  const allocations = activeCategories
    .filter((category) => sourceAllocations[category.id] !== undefined)
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      amountCents: sourceAllocations[category.id],
      willCopy: targetAllocations[category.id] === undefined,
    }));

  const salaryCents = document.salaries[sourceMonth] ?? null;
  return {
    sourceMonth,
    salaryCents,
    salaryWillCopy:
      salaryCents !== null && document.salaries[month] === undefined,
    allocations,
    sourceSnapshot: JSON.stringify({
      salaryCents,
      allocations: allocations.map(({ categoryId, amountCents }) => [
        categoryId,
        amountCents,
      ]),
    }),
  };
}

export function initialLocalFinance(
  createId: () => string = () => crypto.randomUUID(),
): LocalFinanceDocument {
  return {
    version: 1,
    salaries: {},
    categories: STARTER_CATEGORIES.map((name) => ({
      id: createId(),
      name,
      archivedAt: null,
    })),
    allocations: {},
    expenses: [],
    plans: [],
    resolutions: [],
    goals: [],
  };
}

/** Accept plain pesos and optional comma or dot cents; reject ambiguous thousands separators. */
export function parsePesosToCents(
  value: string,
  allowZero = false,
): number | null {
  const normalized = value.trim();
  if (!/^\d{1,12}(?:[,.]\d{1,2})?$/.test(normalized)) return null;

  const [whole, fractional = ""] = normalized.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  return isMoneyCents(cents, allowZero) ? cents : null;
}

function requireActiveCategory(
  document: LocalFinanceDocument,
  categoryId: string,
) {
  const category = document.categories.find(
    (item) => item.id === categoryId && item.archivedAt === null,
  );

  if (!category) throw new RangeError("La categoría ya no está disponible.");

  return category;
}

function expenseDescription(value: string) {
  const description = value.trim();
  if (description.length > 100)
    throw new RangeError("La descripción no puede superar 100 caracteres.");

  return description;
}

function requirePendingPlan(
  document: LocalFinanceDocument,
  planId: string,
  dueOn: string,
) {
  if (!isCalendarDate(dueOn))
    throw new RangeError("La fecha de vencimiento no es válida.");

  const month = dueOn.slice(0, 7);

  const upcoming = upcomingExpensesForMonth(
    month,
    document.plans,
    document.resolutions,
  );

  const occurrence = upcoming.occurrences.find(
    (item) => item.id === planId && item.dueOn === dueOn,
  );

  if (!occurrence || occurrence.state !== "planned")
    throw new RangeError("El gasto previsto ya no está disponible.");

  return occurrence;
}

export function applyFinanceCommand(
  document: LocalFinanceDocument,
  command: FinanceCommand,
  createId: () => string = () => crypto.randomUUID(),
): LocalFinanceDocument {
  const next = structuredClone(document);

  switch (command.kind) {
    case "salary.save": {
      if (!isMonth(command.month) || !isMoneyCents(command.amountCents, true))
        throw new RangeError("Ingrese un sueldo válido.");

      next.salaries[command.month] = command.amountCents;

      return next;
    }
    case "month.copy": {
      if (!isMonth(command.month) || !isMonth(command.sourceMonth))
        throw new RangeError("Seleccione un mes válido.");

      const preview = monthCopyPreview(next, command.month);
      if (
        !preview ||
        preview.sourceMonth !== command.sourceMonth ||
        preview.sourceSnapshot !== command.sourceSnapshot
      )
        throw new RangeError(
          "El plan de origen cambió. Revise los importes y vuelva a copiarlo.",
        );

      if (preview.salaryWillCopy && preview.salaryCents !== null)
        next.salaries[command.month] = preview.salaryCents;

      next.allocations[command.month] ??= {};

      for (const allocation of preview.allocations) {
        if (allocation.willCopy)
          next.allocations[command.month][allocation.categoryId] =
            allocation.amountCents;
      }

      return next;
    }
    case "category.add": {
      const name = command.name.trim();
      if (!name || name.length > 60)
        throw new RangeError("Ingrese un nombre de hasta 60 caracteres.");

      if (
        next.categories.some(
          (item) =>
            item.archivedAt === null &&
            item.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"),
        )
      )
        throw new RangeError("La categoría ya existe.");

      next.categories.push({ id: createId(), name, archivedAt: null });

      return next;
    }
    case "category.rename": {
      const category = requireActiveCategory(next, command.categoryId);
      const name = command.name.trim();
      if (!name || name.length > 60)
        throw new RangeError("Ingrese un nombre de hasta 60 caracteres.");

      if (
        next.categories.some(
          (item) =>
            item.id !== category.id &&
            item.archivedAt === null &&
            item.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"),
        )
      )
        throw new RangeError("La categoría ya existe.");

      category.name = name;

      return next;
    }
    case "category.archive": {
      const category = requireActiveCategory(next, command.categoryId);

      if (!isCalendarDate(command.effectiveOn))
        throw new RangeError("La fecha no es válida.");

      category.archivedAt = command.effectiveOn;

      for (const plan of next.plans) {
        if (plan.categoryId === category.id && plan.archivedAt === null)
          plan.archivedAt = command.effectiveOn;
      }

      return next;
    }
    case "category.restore": {
      const category = next.categories.find(
        (item) => item.id === command.categoryId && item.archivedAt !== null,
      );

      if (!category) throw new RangeError("La categoría ya no está archivada.");

      if (
        next.categories.some(
          (item) =>
            item.id !== category.id &&
            item.archivedAt === null &&
            item.name.toLocaleLowerCase("es") ===
              category.name.toLocaleLowerCase("es"),
        )
      )
        throw new RangeError("Ya existe una categoría activa con ese nombre.");

      category.archivedAt = null;

      return next;
    }
    case "allocation.save": {
      if (!isMonth(command.month) || !isMoneyCents(command.amountCents, true))
        throw new RangeError("Ingrese un presupuesto válido.");

      requireActiveCategory(next, command.categoryId);
      next.allocations[command.month] ??= {};
      next.allocations[command.month][command.categoryId] = command.amountCents;

      return next;
    }
    case "expense.add": {
      if (
        !isCalendarDate(command.incurredOn) ||
        !isMoneyCents(command.amountCents)
      )
        throw new RangeError("Ingrese un gasto válido.");

      requireActiveCategory(next, command.categoryId);
      const description = expenseDescription(command.description ?? "");

      next.expenses.push({
        id: createId(),
        categoryId: command.categoryId,
        incurredOn: command.incurredOn,
        amountCents: command.amountCents,
        description,
      });

      return next;
    }
    case "expense.remove": {
      const expense = next.expenses.find(
        (item) => item.id === command.expenseId,
      );

      if (!expense) throw new RangeError("El gasto ya no está disponible.");

      next.expenses = next.expenses.filter(
        (item) => item.id !== command.expenseId,
      );

      next.resolutions = next.resolutions.filter(
        (item) => item.expenseId !== command.expenseId,
      );

      return next;
    }
    case "expense.update": {
      const expense = next.expenses.find(
        (item) => item.id === command.expenseId,
      );

      if (!expense) throw new RangeError("El gasto ya no está disponible.");

      if (
        !isCalendarDate(command.incurredOn) ||
        !isMoneyCents(command.amountCents)
      )
        throw new RangeError("Ingrese un gasto válido.");

      const linkedPlan = next.resolutions.find(
        (item) => item.expenseId === expense.id,
      );

      if (linkedPlan && command.categoryId !== expense.categoryId)
        throw new RangeError(
          "La categoría de un pago previsto no puede cambiarse.",
        );

      if (command.categoryId !== expense.categoryId)
        requireActiveCategory(next, command.categoryId);

      const description = expenseDescription(
        command.description ?? expense.description,
      );

      expense.categoryId = command.categoryId;
      expense.incurredOn = command.incurredOn;
      expense.amountCents = command.amountCents;
      expense.description = description;

      return next;
    }
    case "plan.add": {
      const title = command.title.trim();
      if (
        !title ||
        title.length > 80 ||
        !isMoneyCents(command.amountCents) ||
        !isCalendarDate(command.firstDueOn)
      )
        throw new RangeError("Ingrese un gasto previsto válido.");

      requireActiveCategory(next, command.categoryId);

      next.plans.push({
        id: createId(),
        categoryId: command.categoryId,
        title,
        amountCents: command.amountCents,
        amountKind: command.amountKind,
        recurrence: command.recurrence,
        firstDueOn: command.firstDueOn,
        lastDueOn: null,
        archivedAt: null,
        revisesPlanId: null,
      });

      return next;
    }
    case "plan.archive": {
      const plan = next.plans.find(
        (item) => item.id === command.planId && item.archivedAt === null,
      );

      if (!plan || !isCalendarDate(command.effectiveOn))
        throw new RangeError("El gasto previsto ya no está disponible.");

      plan.archivedAt = command.effectiveOn;

      return next;
    }
    case "plan.revise": {
      const occurrence = requirePendingPlan(
        next,
        command.planId,
        command.dueOn,
      );

      const plan = next.plans.find((item) => item.id === command.planId);
      if (plan && plan.archivedAt !== null)
        throw new RangeError(
          "Esta versión de la cuenta ya terminó. Edite la cuenta mensual vigente.",
        );

      const latestLaterResolution = next.resolutions
        .filter(
          (item) =>
            item.plannedExpenseId === command.planId &&
            item.dueOn > occurrence.dueOn,
        )
        .map((item) => item.dueOn)
        .sort()
        .at(-1);

      if (latestLaterResolution) {
        const safeMonth = nextMonth(latestLaterResolution.slice(0, 7));
        throw new RangeError(
          `Esta cuenta tiene pagos u omisiones posteriores. Edítela desde ${isMonth(safeMonth) ? safeMonth : "un mes posterior al último vencimiento registrado"} para conservarlos.`,
        );
      }

      if (
        !plan ||
        plan.recurrence !== "monthly" ||
        !isMoneyCents(command.amountCents) ||
        !isCalendarDate(command.firstDueOn) ||
        command.firstDueOn.slice(0, 7) !== occurrence.dueOn.slice(0, 7)
      )
        throw new RangeError(
          "Ingrese un importe y vencimiento válidos para este mes.",
        );

      // Keep the old schedule and its paid occurrences intact; the new schedule starts this month.
      plan.archivedAt = occurrence.dueOn;

      next.plans.push({
        ...plan,
        id: createId(),
        amountCents: command.amountCents,
        firstDueOn: command.firstDueOn,
        archivedAt: null,
        revisesPlanId: plan.id,
      });

      return next;
    }
    case "plan.skip": {
      requirePendingPlan(next, command.planId, command.dueOn);

      next.resolutions.push({
        plannedExpenseId: command.planId,
        dueOn: command.dueOn,
        state: "skipped",
        expenseId: null,
      });

      return next;
    }
    case "plan.reopen": {
      const resolution = next.resolutions.find(
        (item) =>
          item.plannedExpenseId === command.planId &&
          item.dueOn === command.dueOn &&
          item.state === "skipped",
      );

      if (!resolution)
        throw new RangeError("Este vencimiento ya no está omitido.");

      next.resolutions = next.resolutions.filter((item) => item !== resolution);

      return next;
    }
    case "plan.pay": {
      const occurrence = requirePendingPlan(
        next,
        command.planId,
        command.dueOn,
      );

      if (
        !isCalendarDate(command.incurredOn) ||
        !isMoneyCents(command.amountCents)
      )
        throw new RangeError("Ingrese un pago válido.");

      const expenseId = createId();

      next.expenses.push({
        id: expenseId,
        categoryId: occurrence.categoryId,
        incurredOn: command.incurredOn,
        amountCents: command.amountCents,
        description: "",
      });

      next.resolutions.push({
        plannedExpenseId: command.planId,
        dueOn: command.dueOn,
        state: "paid",
        expenseId,
      });

      return next;
    }
    case "goal.add": {
      const name = command.name.trim();
      if (!name || name.length > 80 || !isMoneyCents(command.targetCents))
        throw new RangeError("Ingrese una meta de ahorro válida.");

      next.goals.push({
        id: createId(),
        name,
        targetCents: command.targetCents,
        savedCents: 0,
      });

      return next;
    }
    case "goal.update": {
      const goal = next.goals.find((item) => item.id === command.goalId);
      if (!goal)
        throw new RangeError("La meta de ahorro ya no está disponible.");

      const name = command.name.trim();
      if (
        !name ||
        name.length > 80 ||
        !isMoneyCents(command.targetCents) ||
        !isMoneyCents(command.savedCents, true)
      )
        throw new RangeError("Ingrese una meta de ahorro válida.");

      goal.name = name;
      goal.targetCents = command.targetCents;
      goal.savedCents = command.savedCents;

      return next;
    }
    case "goal.remove": {
      if (!next.goals.some((item) => item.id === command.goalId))
        throw new RangeError("La meta de ahorro ya no está disponible.");

      next.goals = next.goals.filter((item) => item.id !== command.goalId);

      return next;
    }
  }
}

export function buildLocalFinanceMonth(
  document: LocalFinanceDocument,
  month: string,
  inflation: IndicatorPoint[] | null,
) {
  if (!isMonth(month)) throw new RangeError("Mes inválido.");

  const monthExpenses = document.expenses
    .filter((item) => item.incurredOn.slice(0, 7) === month)
    .sort((left, right) => right.incurredOn.localeCompare(left.incurredOn));

  const upcoming = upcomingExpensesForMonth(
    month,
    document.plans,
    document.resolutions,
  );

  const allocated = document.allocations[month] ?? {};

  const visibleCategories = document.categories.filter(
    (category) =>
      category.archivedAt === null ||
      allocated[category.id] !== undefined ||
      monthExpenses.some((expense) => expense.categoryId === category.id) ||
      upcoming.pendingByCategory[category.id] !== undefined,
  );

  const budget = summarizeMonthlyBudget(
    document.salaries[month] ?? null,
    visibleCategories.map((category) => ({
      id: category.id,
      name: category.name,
      plannedCents: allocated[category.id] ?? 0,
      spentCents: monthExpenses
        .filter((expense) => expense.categoryId === category.id)
        .reduce((sum, expense) => sum + expense.amountCents, 0),
    })),
  );

  const previousMonth = Object.keys(document.salaries)
    .filter((candidate) => candidate < month)
    .sort()
    .at(-1);

  const salaryComparison =
    previousMonth && document.salaries[month] !== undefined
      ? compareSalaryMonths(
          {
            month: previousMonth,
            netIncomeCents: document.salaries[previousMonth],
          },
          { month, netIncomeCents: document.salaries[month] },
          inflation ?? [],
        )
      : null;

  return {
    month,
    isFirstMonthSetup:
      Object.keys(document.salaries).length === 0 &&
      Object.keys(document.allocations).length === 0 &&
      document.expenses.length === 0 &&
      document.plans.length === 0,
    copyPreview: monthCopyPreview(document, month),
    budget,
    commitments: categoryCommitments(budget, upcoming),
    expenses: monthExpenses,
    linkedExpenseIds: document.resolutions
      .filter((item) => item.state === "paid" && item.expenseId !== null)
      .map((item) => item.expenseId),
    upcoming,
    salaryComparison,
    previousSalaryMonth: previousMonth ?? null,
    previousSalaryCents: previousMonth
      ? document.salaries[previousMonth]
      : null,
    activeCategories: document.categories.filter(
      (category) => category.archivedAt === null,
    ),
    archivedCategories: document.categories.filter(
      (category) => category.archivedAt !== null,
    ),
    goals: document.goals,
  };
}
