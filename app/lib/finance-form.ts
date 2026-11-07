import { parsePesosToCents, type FinanceCommand } from "~/lib/local-finance";

export const formField = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

function moneyField(form: FormData, name: string, allowZero = false) {
  const cents = parsePesosToCents(formField(form, name), allowZero);
  if (cents === null)
    throw new RangeError(
      "Ingrese un importe válido, sin separadores de miles.",
    );

  return cents;
}

const amount = (form: FormData, allowZero = false) =>
  moneyField(form, "amount", allowZero);

export function commandFromForm(form: FormData): FinanceCommand {
  const intent = formField(form, "_intent");
  switch (intent) {
    case "salary.save":
      return {
        kind: intent,
        month: formField(form, "month"),
        amountCents: amount(form, true),
      };
    case "month.copy":
      return {
        kind: intent,
        month: formField(form, "month"),
        sourceMonth: formField(form, "sourceMonth"),
        sourceSnapshot: formField(form, "sourceSnapshot"),
      };
    case "category.add":
      return { kind: intent, name: formField(form, "name") };
    case "category.rename":
      return {
        kind: intent,
        categoryId: formField(form, "categoryId"),
        name: formField(form, "name"),
      };
    case "category.archive":
      return {
        kind: intent,
        categoryId: formField(form, "categoryId"),
        effectiveOn: formField(form, "effectiveOn"),
      };
    case "category.restore":
      return { kind: intent, categoryId: formField(form, "categoryId") };
    case "allocation.save":
      return {
        kind: intent,
        month: formField(form, "month"),
        categoryId: formField(form, "categoryId"),
        amountCents: amount(form, true),
      };
    case "expense.add":
      return {
        kind: intent,
        categoryId: formField(form, "categoryId"),
        incurredOn: formField(form, "incurredOn"),
        amountCents: amount(form),
        description: formField(form, "description"),
      };
    case "expense.remove":
      return { kind: intent, expenseId: formField(form, "expenseId") };
    case "expense.update":
      return {
        kind: intent,
        expenseId: formField(form, "expenseId"),
        categoryId: formField(form, "categoryId"),
        incurredOn: formField(form, "incurredOn"),
        amountCents: amount(form),
        description: formField(form, "description"),
      };
    case "plan.add": {
      const amountKind = formField(form, "amountKind");
      const recurrence = formField(form, "recurrence");

      if (amountKind !== "confirmed" && amountKind !== "estimate")
        throw new RangeError("Seleccione el tipo de importe.");

      if (recurrence !== "once" && recurrence !== "monthly")
        throw new RangeError("Seleccione la frecuencia.");

      return {
        kind: intent,
        categoryId: formField(form, "categoryId"),
        title: formField(form, "title"),
        amountCents: amount(form),
        amountKind,
        recurrence,
        firstDueOn: formField(form, "firstDueOn"),
      };
    }
    case "plan.archive":
      return {
        kind: intent,
        planId: formField(form, "planId"),
        effectiveOn: formField(form, "effectiveOn"),
      };
    case "plan.revise":
      return {
        kind: intent,
        planId: formField(form, "planId"),
        dueOn: formField(form, "dueOn"),
        firstDueOn: formField(form, "firstDueOn"),
        amountCents: amount(form),
      };
    case "plan.skip":
      return {
        kind: intent,
        planId: formField(form, "planId"),
        dueOn: formField(form, "dueOn"),
      };
    case "plan.reopen":
      return {
        kind: intent,
        planId: formField(form, "planId"),
        dueOn: formField(form, "dueOn"),
      };
    case "plan.pay":
      return {
        kind: intent,
        planId: formField(form, "planId"),
        dueOn: formField(form, "dueOn"),
        incurredOn: formField(form, "incurredOn"),
        amountCents: amount(form),
      };
    case "goal.add":
      return {
        kind: intent,
        name: formField(form, "name"),
        targetCents: moneyField(form, "target"),
      };
    case "goal.update":
      return {
        kind: intent,
        goalId: formField(form, "goalId"),
        name: formField(form, "name"),
        targetCents: moneyField(form, "target"),
        savedCents: moneyField(form, "saved", true),
      };
    case "goal.remove":
      return { kind: intent, goalId: formField(form, "goalId") };
    default:
      throw new RangeError("La operación solicitada no está disponible.");
  }
}
