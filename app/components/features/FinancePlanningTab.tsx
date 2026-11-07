import {
  ActionForm,
  CategorySelect,
  MoneyInput,
  dateLabel,
  money,
} from "~/components/features/FinanceFields";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import { argentinaCalendarDate } from "~/lib/exchange-rate-history";
import type { buildLocalFinanceMonth } from "~/lib/local-finance";
import type { UpcomingOccurrence } from "~/lib/upcoming-expenses";

interface FinanceDataProps {
  data: ReturnType<typeof buildLocalFinanceMonth>;
}

/** An HTML date input ignores an impossible day, so the bound must name the month's real last day. */
const lastDayOfMonth = (date: string) => {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
};

const UpcomingRow = ({
  occurrence,
  defaultDate,
}: {
  occurrence: UpcomingOccurrence;
  defaultDate: string;
}) => (
  <li className="stack-4 border-b border-base-700 p-4 last:border-b-0 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="stack-2">
        <h3 className="font-heading text-body-lg text-text-100">
          {occurrence.title}
        </h3>
        <p className="font-mono text-data-label text-text-400">
          {dateLabel(occurrence.dueOn)} ·{" "}
          {occurrence.recurrence === "monthly" ? "Mensual" : "Una vez"} ·{" "}
          {occurrence.amountKind === "estimate" ? "Estimado" : "Confirmado"}
        </p>
      </div>
      <div className="text-right">
        <p className="font-mono text-data-display text-text-100">
          {money(occurrence.amountCents)}
        </p>
        <p
          className={`font-mono text-data-label ${occurrence.state === "paid" ? "text-secondary-text-100" : occurrence.state === "skipped" ? "text-text-400" : "text-tertiary-text-200"}`}
        >
          {occurrence.state === "paid"
            ? "Pagado"
            : occurrence.state === "skipped"
              ? "Omitido"
              : "Pendiente"}
        </p>
      </div>
    </div>
    {occurrence.state === "planned" ? (
      <div className="flex flex-wrap items-start gap-3">
        <details className="min-w-64 flex-1 border border-base-700 bg-surface-900 p-3">
          <summary className="cursor-pointer font-mono text-data-label text-primary-text-100 uppercase">
            Registrar pago
          </summary>
          <ActionForm
            intent="plan.pay"
            submitLabel="Confirmar pago"
            className="mt-4 stack-4"
          >
            <input type="hidden" name="planId" value={occurrence.id} />
            <input type="hidden" name="dueOn" value={occurrence.dueOn} />
            <MoneyInput
              id={`pay-${occurrence.id}-${occurrence.dueOn}`}
              label="Importe pagado (ARS)"
              defaultValue={occurrence.amountCents}
            />
            <div className="stack-2">
              <label
                htmlFor={`paid-on-${occurrence.id}-${occurrence.dueOn}`}
                className="font-mono text-data-label text-text-200 uppercase"
              >
                Fecha de pago
              </label>
              <input
                id={`paid-on-${occurrence.id}-${occurrence.dueOn}`}
                name="incurredOn"
                type="date"
                defaultValue={defaultDate}
                required
                className={`w-full border border-base-700 bg-surface-950 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
              />
            </div>
          </ActionForm>
        </details>
        <ActionForm
          intent="plan.skip"
          submitLabel="Omitir esta vez"
          variant="ghost"
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="planId" value={occurrence.id} />
          <input type="hidden" name="dueOn" value={occurrence.dueOn} />
        </ActionForm>
      </div>
    ) : null}
    {occurrence.state === "planned" &&
    occurrence.recurrence === "monthly" &&
    occurrence.archivedAt === null ? (
      <details className="border border-base-700 bg-surface-900 p-3">
        <summary className="cursor-pointer font-mono text-data-label text-primary-text-100 uppercase">
          Editar cuenta mensual
        </summary>
        <p className="mt-3 text-body-sm text-text-300">
          El cambio rige desde este mes. Los pagos anteriores conservarán su
          registro.
        </p>
        <ActionForm
          intent="plan.revise"
          submitLabel="Guardar cuenta"
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="planId" value={occurrence.id} />
          <input type="hidden" name="dueOn" value={occurrence.dueOn} />
          <MoneyInput
            id={`revise-amount-${occurrence.id}`}
            label="Nuevo importe (ARS)"
            defaultValue={occurrence.amountCents}
          />
          <div className="stack-2 min-w-0 flex-1">
            <label
              htmlFor={`revise-date-${occurrence.id}`}
              className="font-mono text-data-label text-text-200 uppercase"
            >
              Nuevo vencimiento
            </label>
            <input
              id={`revise-date-${occurrence.id}`}
              name="firstDueOn"
              type="date"
              defaultValue={occurrence.dueOn}
              min={`${occurrence.dueOn.slice(0, 7)}-01`}
              max={lastDayOfMonth(occurrence.dueOn)}
              required
              className={`w-full border border-base-700 bg-surface-950 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
            />
          </div>
        </ActionForm>
      </details>
    ) : null}
    {occurrence.state === "skipped" && occurrence.archivedAt === null ? (
      <ActionForm
        intent="plan.reopen"
        submitLabel="Reabrir vencimiento"
        variant="ghost"
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="planId" value={occurrence.id} />
        <input type="hidden" name="dueOn" value={occurrence.dueOn} />
      </ActionForm>
    ) : null}
    {(occurrence.recurrence === "monthly" || occurrence.state === "planned") &&
    occurrence.archivedAt === null ? (
      <ActionForm
        intent="plan.archive"
        submitLabel={
          occurrence.recurrence === "monthly"
            ? "Detener desde aquí"
            : "Quitar previsto"
        }
        variant="ghost"
        confirmMessage="¿Detener este gasto previsto desde el vencimiento seleccionado? Los pagos registrados se conservarán."
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="planId" value={occurrence.id} />
        <input type="hidden" name="effectiveOn" value={occurrence.dueOn} />
      </ActionForm>
    ) : null}
  </li>
);

const UpcomingSection = ({ data }: FinanceDataProps) => {
  const today = argentinaCalendarDate(new Date());

  const defaultDate =
    data.month === today.slice(0, 7) ? today : `${data.month}-01`;

  return (
    <section aria-labelledby="upcoming-title" className="stack-6">
      <div className="stack-2">
        <h2
          id="upcoming-title"
          className="font-heading text-headline-md text-text-100"
        >
          Próximos gastos
        </h2>
        <p className="text-body-sm text-text-300">
          Planifique compras puntuales y cuentas mensuales. El importe previsto
          no cambia automáticamente.
        </p>
      </div>
      <ActionForm
        intent="plan.add"
        submitLabel="Agregar gasto previsto"
        resetOnSuccess
        className="grid gap-4 border border-base-700 bg-surface-950 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 lg:items-end"
      >
        <div className="stack-2 min-w-0 flex-1">
          <label
            htmlFor="plan-title"
            className="font-mono text-data-label text-text-200 uppercase"
          >
            Concepto
          </label>
          <input
            id="plan-title"
            name="title"
            type="text"
            maxLength={80}
            required
            placeholder="Ej. Internet"
            className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 placeholder:text-text-400 ${fieldFocusClassName}`}
          />
        </div>
        <CategorySelect categories={data.activeCategories} id="plan-category" />
        <MoneyInput id="plan-amount" label="Importe previsto (ARS)" />
        <div className="stack-2 min-w-0 flex-1">
          <label
            htmlFor="plan-date"
            className="font-mono text-data-label text-text-200 uppercase"
          >
            Primer vencimiento
          </label>
          <input
            id="plan-date"
            name="firstDueOn"
            type="date"
            defaultValue={defaultDate}
            required
            className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
          />
        </div>
        <div className="stack-2 min-w-0 flex-1">
          <label
            htmlFor="plan-recurrence"
            className="font-mono text-data-label text-text-200 uppercase"
          >
            Frecuencia
          </label>
          <select
            id="plan-recurrence"
            name="recurrence"
            className={`themed-select w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
          >
            <option value="once">Una vez</option>
            <option value="monthly">Mensual</option>
          </select>
        </div>
        <div className="stack-2 min-w-0 flex-1">
          <label
            htmlFor="plan-amount-kind"
            className="font-mono text-data-label text-text-200 uppercase"
          >
            Tipo de importe
          </label>
          <select
            id="plan-amount-kind"
            name="amountKind"
            className={`themed-select w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
          >
            <option value="estimate">Estimado</option>
            <option value="confirmed">Confirmado</option>
          </select>
        </div>
      </ActionForm>
      {data.upcoming.occurrences.length ? (
        <ul className="border border-base-700 bg-surface-950">
          {data.upcoming.occurrences.map((occurrence) => (
            <UpcomingRow
              key={`${occurrence.id}-${occurrence.dueOn}`}
              occurrence={occurrence}
              defaultDate={defaultDate}
            />
          ))}
        </ul>
      ) : (
        <div className="border border-base-700 bg-surface-950 p-5">
          <p className="text-body-sm text-text-300">
            No hay gastos previstos para este mes.
          </p>
        </div>
      )}
    </section>
  );
};

const SavingsSection = ({ data }: FinanceDataProps) => (
  <section aria-labelledby="savings-title" className="stack-6">
    <div className="stack-2">
      <h2
        id="savings-title"
        className="font-heading text-headline-md text-text-100"
      >
        Metas de ahorro
      </h2>
      <p className="max-w-2xl text-body-sm text-text-300">
        Registre manualmente cuánto ha reservado para cada meta. Estos importes
        no se descuentan del presupuesto mensual ni representan un saldo
        bancario.
      </p>
    </div>
    <ActionForm
      intent="goal.add"
      submitLabel="Agregar meta"
      resetOnSuccess
      className="flex flex-col gap-3 border border-base-700 bg-surface-950 p-4 sm:flex-row sm:items-end sm:p-5"
    >
      <div className="stack-2 min-w-0 flex-1">
        <label
          htmlFor="goal-name"
          className="font-mono text-data-label text-text-200 uppercase"
        >
          Nombre de la meta
        </label>
        <input
          id="goal-name"
          name="name"
          type="text"
          maxLength={80}
          placeholder="Ej. Fondo de emergencia"
          required
          className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 placeholder:text-text-400 ${fieldFocusClassName}`}
        />
      </div>
      <MoneyInput id="goal-target" name="target" label="Objetivo (ARS)" />
    </ActionForm>
    {data.goals.length ? (
      <ul className="divide-y divide-base-700 border border-base-700 bg-surface-950">
        {data.goals.map((goal) => {
          const percent = Math.round(
            (goal.savedCents / goal.targetCents) * 100,
          );

          return (
            <li key={goal.id} className="stack-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="stack-2">
                  <h3 className="font-heading text-body-lg text-text-100">
                    {goal.name}
                  </h3>
                  <p className="font-mono text-data-label text-text-300">
                    {money(goal.savedCents)} de {money(goal.targetCents)} ·{" "}
                    {percent}%
                  </p>
                </div>
                <ActionForm
                  intent="goal.remove"
                  submitLabel="Eliminar"
                  variant="ghost"
                  confirmMessage={`¿Eliminar la meta ${goal.name}?`}
                >
                  <input type="hidden" name="goalId" value={goal.id} />
                </ActionForm>
              </div>
              <div className="h-2 w-full bg-surface-900" aria-hidden="true">
                <div
                  className="h-full bg-primary-500"
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <p className="font-mono text-data-label text-text-400">
                {goal.savedCents >= goal.targetCents
                  ? "Objetivo alcanzado"
                  : `Faltan ${money(goal.targetCents - goal.savedCents)}`}
              </p>
              <details className="border-t border-base-700 pt-2">
                <summary className="w-fit cursor-pointer font-mono text-data-label text-primary-text-100 uppercase">
                  Editar meta
                </summary>
                <ActionForm
                  intent="goal.update"
                  submitLabel="Guardar meta"
                  className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
                >
                  <input type="hidden" name="goalId" value={goal.id} />
                  <div className="stack-2 min-w-0 flex-1">
                    <label
                      htmlFor={`goal-name-${goal.id}`}
                      className="font-mono text-data-label text-text-200 uppercase"
                    >
                      Nombre
                    </label>
                    <input
                      id={`goal-name-${goal.id}`}
                      name="name"
                      type="text"
                      maxLength={80}
                      defaultValue={goal.name}
                      required
                      className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
                    />
                  </div>
                  <MoneyInput
                    id={`goal-target-${goal.id}`}
                    name="target"
                    label="Objetivo (ARS)"
                    defaultValue={goal.targetCents}
                  />
                  <MoneyInput
                    id={`goal-saved-${goal.id}`}
                    name="saved"
                    label="Reservado (ARS)"
                    defaultValue={goal.savedCents}
                  />
                </ActionForm>
              </details>
            </li>
          );
        })}
      </ul>
    ) : (
      <div className="border border-base-700 bg-surface-950 p-5">
        <p className="text-body-sm text-text-300">
          Todavía no registró metas de ahorro.
        </p>
      </div>
    )}
  </section>
);

export const FinancePlanningTab = ({ data }: FinanceDataProps) => (
  <div className="stack-10">
    <UpcomingSection data={data} />
    <SavingsSection data={data} />
  </div>
);
