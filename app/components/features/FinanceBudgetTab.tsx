import { useId, useState } from "react";
import { Link } from "react-router";

import { Button } from "~/components/ui/Button";
import { Skeleton } from "~/components/ui/Skeleton";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import {
  ActionForm,
  CategorySelect,
  ExpenseDescriptionInput,
  MoneyInput,
  dateLabel,
  money,
  monthLabel,
} from "~/components/features/FinanceFields";
import { argentinaCalendarDate } from "~/lib/exchange-rate-history";
import { financeHref } from "~/lib/finance-tabs";
import { formatSignedChange } from "~/lib/format";
import type { LocalExpense, buildLocalFinanceMonth } from "~/lib/local-finance";
import type { SalaryComparison } from "~/lib/personal-finance";
import { useDataPreview } from "~/lib/use-data-preview";

interface FinanceDataProps {
  data: ReturnType<typeof buildLocalFinanceMonth>;
}

interface FinanceBudgetTabProps extends FinanceDataProps {
  /** Read-only visitors get the access panel instead of setup steps they cannot take. */
  editable?: boolean;
  comparison: SalaryComparison | null;
  inflationStatus: "idle" | "loading" | "ready" | "unavailable";
  onRetryInflation: () => void;
}

const SalaryComparisonPanel = ({
  data,
  comparison,
  inflationStatus,
  onRetryInflation,
}: FinanceBudgetTabProps) => {
  if (!comparison) return null;

  return (
    <section
      aria-label="Evolución del sueldo"
      className="grid gap-4 border border-base-700 bg-surface-950 p-4 sm:grid-cols-2 sm:p-5"
    >
      <div className="stack-2">
        <p className="font-mono text-label-caps text-text-200 uppercase">
          Cambio nominal desde{" "}
          {monthLabel(data.previousSalaryMonth ?? data.month)}
        </p>
        <p
          className={`font-mono text-data-display ${comparison.nominalPercent < 0 ? "text-red-text-400" : "text-text-100"}`}
        >
          {formatSignedChange(comparison.nominalPercent)}
        </p>
      </div>
      <div className="stack-2">
        <p className="font-mono text-label-caps text-text-200 uppercase">
          Cambio de poder adquisitivo
        </p>
        <p
          className={`font-mono text-data-display ${comparison.realPercent !== null && comparison.realPercent < 0 ? "text-red-text-400" : "text-text-100"}`}
        >
          {comparison.realPercent === null && inflationStatus === "loading" ? (
            <Skeleton className="my-1 h-8 w-24" />
          ) : comparison.realPercent === null ? (
            "s/d"
          ) : (
            formatSignedChange(comparison.realPercent)
          )}
        </p>
        {comparison.realPercent === null ? (
          <p className="text-body-sm text-text-400">
            {inflationStatus === "loading"
              ? "Consultando el IPC publicado…"
              : inflationStatus === "unavailable"
                ? "No fue posible consultar el IPC en este momento."
                : "El IPC aún no cubre todo el período comparado."}
          </p>
        ) : null}
        {inflationStatus === "unavailable" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRetryInflation}
            className="w-fit"
          >
            Reintentar IPC
          </Button>
        ) : null}
      </div>
    </section>
  );
};

const MonthCopySection = ({ data }: FinanceDataProps) => {
  const preview = data.copyPreview;
  if (
    !preview ||
    (!preview.salaryWillCopy &&
      !preview.allocations.some((item) => item.willCopy))
  )
    return null;

  return (
    <section
      aria-labelledby="month-copy-title"
      className="stack-4 border border-base-700 bg-surface-950 p-4 sm:p-5"
    >
      <div className="stack-2">
        <h2
          id="month-copy-title"
          className="font-heading text-body-lg text-text-100"
        >
          Preparar el mes con su último plan
        </h2>
        <p className="text-body-sm text-text-300">
          Origen: {monthLabel(preview.sourceMonth)}. Se completarán solo los
          importes que aún no guardó en {monthLabel(data.month)}; los valores
          existentes, incluso cero, se conservarán.
        </p>
      </div>
      <div
        className="stack-2 text-body-sm text-text-200"
        role="group"
        aria-label="Vista previa de importes para copiar"
      >
        {preview.salaryCents !== null ? (
          <p>
            Sueldo neto:{" "}
            <span className="font-mono">{money(preview.salaryCents)}</span> ·{" "}
            {preview.salaryWillCopy ? "Se copiará" : "Ya definido en este mes"}
          </p>
        ) : null}
        <ul className="grid gap-1 sm:grid-cols-2">
          {preview.allocations.map((item) => (
            <li key={item.categoryId}>
              {item.name}:{" "}
              <span className="font-mono">{money(item.amountCents)}</span> ·{" "}
              {item.willCopy ? "Se copiará" : "Ya definido en este mes"}
            </li>
          ))}
        </ul>
      </div>
      <ActionForm
        intent="month.copy"
        submitLabel="Copiar importes faltantes"
        className="stack-2"
      >
        <input type="hidden" name="month" value={data.month} />
        <input type="hidden" name="sourceMonth" value={preview.sourceMonth} />
        <input
          type="hidden"
          name="sourceSnapshot"
          value={preview.sourceSnapshot}
        />
      </ActionForm>
    </section>
  );
};

interface CategoryBudgetRowProps {
  category: ReturnType<
    typeof buildLocalFinanceMonth
  >["budget"]["categories"][number];
  commitment:
    | ReturnType<typeof buildLocalFinanceMonth>["commitments"][number]
    | undefined;
  active: boolean;
  month: string;
}

const CategoryBudgetRow = ({
  category,
  commitment,
  active,
  month,
}: CategoryBudgetRowProps) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const flexibleCents = commitment?.flexibleCents ?? category.remainingCents;
  return (
    <div className="stack-4 min-w-0 border-b border-base-700 p-4 last:border-b-0 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="stack-2 min-w-0">
          <h3 className="font-heading text-body-lg wrap-break-word text-text-100">
            {category.name}
          </h3>
          <p
            className={`font-mono text-data-label ${flexibleCents < 0 ? "text-red-text-400" : "text-text-300"}`}
          >
            Libre del plan: {money(flexibleCents)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {active ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsRenaming((open) => !open)}
                aria-expanded={isRenaming}
              >
                {isRenaming ? "Cerrar edición" : "Renombrar"}
              </Button>
              <ActionForm
                intent="category.archive"
                submitLabel="Archivar"
                variant="ghost"
                confirmMessage={`¿Archivar ${category.name}? Sus registros anteriores se conservarán.`}
              >
                <input type="hidden" name="categoryId" value={category.id} />
                <input
                  type="hidden"
                  name="effectiveOn"
                  value={argentinaCalendarDate(new Date())}
                />
              </ActionForm>
            </>
          ) : (
            <>
              <span className="px-2 font-mono text-data-label text-text-400 uppercase">
                Archivada
              </span>
              <ActionForm
                intent="category.restore"
                submitLabel="Restaurar"
                variant="ghost"
              >
                <input type="hidden" name="categoryId" value={category.id} />
              </ActionForm>
            </>
          )}
        </div>
      </div>

      {active && isRenaming ? (
        <ActionForm
          intent="category.rename"
          submitLabel="Guardar nombre"
          className="flex flex-wrap items-end gap-3 border border-base-700 bg-surface-900/30 p-3"
        >
          <input type="hidden" name="categoryId" value={category.id} />
          <div className="stack-2 min-w-48 flex-1 sm:max-w-sm">
            <label
              htmlFor={`rename-${category.id}`}
              className="font-mono text-data-label text-text-200 uppercase"
            >
              Nombre de la categoría
            </label>
            <input
              id={`rename-${category.id}`}
              name="name"
              type="text"
              defaultValue={category.name}
              maxLength={60}
              required
              className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
            />
          </div>
        </ActionForm>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 border-y border-base-700 py-3 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-label-caps text-text-400 uppercase">
            Previsto
          </dt>
          <dd className="mt-1 font-mono text-data-label text-text-100">
            {money(category.plannedCents)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-label-caps text-text-400 uppercase">
            Gastado
          </dt>
          <dd className="mt-1 font-mono text-data-label text-text-100">
            {money(category.spentCents)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-label-caps text-text-400 uppercase">
            Pendiente
          </dt>
          <dd className="mt-1 font-mono text-data-label text-text-100">
            {money(commitment?.pendingCents ?? 0)}
          </dd>
        </div>
      </dl>

      {active ? (
        <ActionForm
          key={`${month}-${category.id}-${category.plannedCents}`}
          intent="allocation.save"
          submitLabel="Guardar plan"
          className="mx-auto flex w-full flex-col gap-3 sm:w-fit sm:flex-row sm:items-end"
        >
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="categoryId" value={category.id} />
          <MoneyInput
            id={`allocation-${category.id}`}
            label="Importe previsto (ARS)"
            defaultValue={category.plannedCents}
            className="mx-auto sm:w-80 sm:flex-none"
          />
        </ActionForm>
      ) : null}
    </div>
  );
};

const BudgetSection = ({ data }: FinanceDataProps) => {
  const archivedTitleId = useId();

  const commitmentByCategory = new Map(
    data.commitments.map((item) => [item.categoryId, item]),
  );

  const overPlan = data.commitments.filter((item) => item.flexibleCents < 0);

  const overPlanCents = overPlan.reduce(
    (total, item) => total - item.flexibleCents,
    0,
  );

  const activeIds = new Set(
    data.activeCategories.map((category) => category.id),
  );

  const visibleIds = new Set(
    data.budget.categories.map((category) => category.id),
  );

  const hiddenArchived = data.archivedCategories.filter(
    (category) => !visibleIds.has(category.id),
  );

  return (
    <section aria-labelledby="budget-title" className="stack-6">
      <div className="stack-2">
        <h2
          id="budget-title"
          className="font-heading text-headline-md text-text-100"
        >
          Presupuesto por categorías
        </h2>
        <p className="text-body-sm text-text-300">
          Lo previsto y lo gastado son importes distintos. Los próximos pagos
          forman parte del plan de cada categoría.
        </p>
      </div>
      {overPlan.length ? (
        <p className="max-w-3xl border-l-2 border-tertiary-500/30 bg-tertiary-500/5 px-4 py-3 text-body-sm text-text-200">
          Los gastos registrados y pagos pendientes superan lo previsto en
          algunas categorías por{" "}
          <span className="font-mono">{money(overPlanCents)}</span>. Los pagos
          previstos no aumentan el presupuesto de la categoría automáticamente;
          revise sus importes planificados.
        </p>
      ) : null}
      {data.budget.categories.length ? (
        <div className="border border-base-700 bg-surface-950">
          {data.budget.categories.map((category) => (
            <CategoryBudgetRow
              key={`${category.id}-${category.name}-${activeIds.has(category.id)}`}
              category={category}
              commitment={commitmentByCategory.get(category.id)}
              active={activeIds.has(category.id)}
              month={data.month}
            />
          ))}
        </div>
      ) : (
        <div className="border border-base-700 bg-surface-950 p-5">
          <p className="text-body-sm text-text-300">
            No hay categorías activas para este mes.
          </p>
        </div>
      )}
      <ActionForm
        intent="category.add"
        submitLabel="Agregar categoría"
        resetOnSuccess
        className="flex w-full flex-col gap-3 border border-base-700 bg-surface-950 p-4 sm:w-fit sm:flex-row sm:items-end sm:p-5"
      >
        <div className="stack-2 min-w-0 flex-1 sm:w-80 sm:flex-none">
          <label
            htmlFor="category-name"
            className="font-mono text-data-label text-text-200 uppercase"
          >
            Nueva categoría
          </label>
          <input
            id="category-name"
            name="name"
            type="text"
            maxLength={60}
            required
            placeholder="Ej. Viajes"
            className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 placeholder:text-text-400 ${fieldFocusClassName}`}
          />
        </div>
      </ActionForm>
      {hiddenArchived.length ? (
        <div
          className="border border-base-700 bg-surface-950"
          role="group"
          aria-labelledby={archivedTitleId}
        >
          <h3
            id={archivedTitleId}
            className="border-b border-base-700 px-4 py-3 font-mono text-label-caps text-text-200 uppercase sm:px-5"
          >
            Categorías archivadas
          </h3>
          {hiddenArchived.map((category) => (
            <div
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-base-700 px-4 py-3 last:border-b-0 sm:px-5"
            >
              <span className="font-heading text-body-sm text-text-200">
                {category.name}
              </span>
              <ActionForm
                intent="category.restore"
                submitLabel="Restaurar"
                variant="ghost"
              >
                <input type="hidden" name="categoryId" value={category.id} />
              </ActionForm>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

const ExpensesSection = ({ data }: FinanceDataProps) => {
  const defaultDate =
    data.month === argentinaCalendarDate(new Date()).slice(0, 7)
      ? argentinaCalendarDate(new Date())
      : `${data.month}-01`;

  const categoryNames = new Map(
    data.budget.categories.map((category) => [category.id, category.name]),
  );

  const linkedExpenseIds = new Set(data.linkedExpenseIds);
  return (
    <section aria-labelledby="expenses-title" className="stack-6">
      <div className="stack-2">
        <h2
          id="expenses-title"
          className="font-heading text-headline-md text-text-100"
        >
          Gastos registrados
        </h2>
        <p className="text-body-sm text-text-300">
          Anote los pagos realizados para comparar el gasto real con el plan.
        </p>
      </div>
      <ActionForm
        intent="expense.add"
        submitLabel="Registrar gasto"
        resetOnSuccess
        className="grid gap-4 border border-base-700 bg-surface-950 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5 lg:items-end"
      >
        <CategorySelect
          categories={data.activeCategories}
          id="expense-category"
        />
        <div className="stack-2 min-w-0 flex-1">
          <label
            htmlFor="expense-date"
            className="font-mono text-data-label text-text-200 uppercase"
          >
            Fecha de pago
          </label>
          <input
            id="expense-date"
            name="incurredOn"
            type="date"
            defaultValue={defaultDate}
            required
            className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
          />
        </div>
        <MoneyInput id="expense-amount" label="Importe (ARS)" />
        <ExpenseDescriptionInput id="expense-description" />
      </ActionForm>
      {data.expenses.length ? (
        <ul className="divide-y divide-base-700 border border-base-700 bg-surface-950">
          {data.expenses.map((expense: LocalExpense) => (
            <li key={expense.id} className="stack-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="stack-2">
                  <span className="font-heading text-body-sm text-text-100">
                    {categoryNames.get(expense.categoryId) ??
                      "Categoría archivada"}
                  </span>
                  {expense.description ? (
                    <span className="text-body-sm wrap-break-word text-text-200">
                      {expense.description}
                    </span>
                  ) : null}
                  <span className="font-mono text-data-label text-text-400">
                    {dateLabel(expense.incurredOn)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-data-label text-text-100">
                    {money(expense.amountCents)}
                  </span>
                  <ActionForm
                    intent="expense.remove"
                    submitLabel="Eliminar"
                    variant="ghost"
                    confirmMessage="¿Eliminar este gasto registrado?"
                    className="flex flex-wrap items-center gap-1"
                  >
                    <input type="hidden" name="expenseId" value={expense.id} />
                  </ActionForm>
                </div>
              </div>
              <details className="border-t border-base-700 pt-2">
                <summary className="w-fit cursor-pointer font-mono text-data-label text-primary-text-100 uppercase">
                  Editar gasto
                </summary>
                <ActionForm
                  intent="expense.update"
                  submitLabel="Guardar gasto"
                  className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
                >
                  <input type="hidden" name="expenseId" value={expense.id} />
                  {linkedExpenseIds.has(expense.id) ? (
                    <div className="stack-2 min-w-0 flex-1">
                      <span className="font-mono text-data-label text-text-200 uppercase">
                        Categoría
                      </span>
                      <span className="text-body-sm text-text-300">
                        {categoryNames.get(expense.categoryId)}
                      </span>
                      <input
                        type="hidden"
                        name="categoryId"
                        value={expense.categoryId}
                      />
                    </div>
                  ) : (
                    <CategorySelect
                      categories={data.activeCategories}
                      id={`expense-category-${expense.id}`}
                      defaultValue={expense.categoryId}
                      archivedCategory={data.archivedCategories.find(
                        (item) => item.id === expense.categoryId,
                      )}
                    />
                  )}
                  <div className="stack-2 min-w-0 flex-1">
                    <label
                      htmlFor={`expense-date-${expense.id}`}
                      className="font-mono text-data-label text-text-200 uppercase"
                    >
                      Fecha de pago
                    </label>
                    <input
                      id={`expense-date-${expense.id}`}
                      name="incurredOn"
                      type="date"
                      defaultValue={expense.incurredOn}
                      required
                      className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
                    />
                  </div>
                  <MoneyInput
                    id={`expense-amount-${expense.id}`}
                    label="Importe (ARS)"
                    defaultValue={expense.amountCents}
                  />
                  <ExpenseDescriptionInput
                    id={`expense-description-${expense.id}`}
                    defaultValue={expense.description}
                  />
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border border-base-700 bg-surface-950 p-5">
          <p className="text-body-sm text-text-300">
            Todavía no registró gastos en este mes.
          </p>
        </div>
      )}
    </section>
  );
};

export const FinanceBudgetTab = (props: FinanceBudgetTabProps) => {
  const previewUnavailable = useDataPreview();

  return (
    <div className="stack-10">
      {props.editable && props.data.isFirstMonthSetup ? (
        <section
          aria-labelledby="first-month-title"
          className="stack-2 border border-base-700 bg-surface-950 p-4 sm:p-5"
        >
          <h2
            id="first-month-title"
            className="font-heading text-body-lg text-text-100"
          >
            Para comenzar
          </h2>
          <p className="max-w-2xl text-body-sm text-text-300">
            Registre el sueldo neto de este mes desde la barra del mes y asigne
            importes a las categorías que use. Después anote los gastos cuando
            los pague. Las cuentas mensuales y las metas de ahorro se organizan
            en{" "}
            <Link
              to={financeHref(
                "planificacion",
                props.data.month,
                previewUnavailable,
              )}
              className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
            >
              Planificación
            </Link>
            .
          </p>
        </section>
      ) : null}
      <SalaryComparisonPanel {...props} />
      <MonthCopySection data={props.data} />
      <BudgetSection data={props.data} />
      <ExpensesSection data={props.data} />
    </div>
  );
};
