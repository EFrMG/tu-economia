import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { MdChevronLeft, MdChevronRight } from "react-icons/md";

import { Button } from "~/components/ui/Button";
import {
  ActionForm,
  MoneyInput,
  money,
  monthLabel,
} from "~/components/features/FinanceFields";
import { argentinaCalendarDate } from "~/lib/exchange-rate-history";
import {
  adjacentMonth,
  financeHref,
  type FinanceTab,
} from "~/lib/finance-tabs";
import { useDataPreview } from "~/lib/use-data-preview";

interface MonthBarMetric {
  label: string;
  value: string;
  risk?: boolean;
}

interface FinanceMonthBarProps {
  tab: FinanceTab;
  month: string;
  metrics: MonthBarMetric[];
  /** When present, the bar leads with the month's net salary and edits it in place. */
  salaryCents?: number | null;
}

const columns: Record<number, string> = {
  3: "lg:grid-cols-[auto_repeat(3,minmax(0,1fr))]",
  4: "lg:grid-cols-[auto_repeat(4,minmax(0,1fr))]",
};

/** Below `lg` the cells sit in one sideways-scrolling row: they never shrink, so wide values widen their cell instead of wrapping. */
const cellClassName =
  "bg-surface-950 stack-1 lg:stack-2 shrink-0 grow basis-36 lg:min-w-0 px-3 py-2 lg:py-2.5 sm:px-4";

const valueClassName =
  "font-mono text-body-lg lg:text-data-display block whitespace-nowrap lg:whitespace-normal lg:wrap-break-word";

const navLinkClassName =
  "text-primary-text-100 hocus:bg-surface-900/80 px-2 py-1 focus-visible:outline-none";

/**
 * The month's controls and headline figures, pinned to the top of the terminal canvas so they stay in view while the tab below scrolls.
 * Mount it with `key={month}` so an open salary editor closes when the month changes.
 */
export const FinanceMonthBar = ({
  tab,
  month,
  metrics,
  salaryCents,
}: FinanceMonthBarProps) => {
  const previewUnavailable = useDataPreview();
  const [editingSalary, setEditingSalary] = useState(false);
  const salaryToggleRef = useRef<HTMLButtonElement>(null);

  const hasSalary = salaryCents !== undefined;
  const cellCount = metrics.length + (hasSalary ? 1 : 0);
  const currentMonth = argentinaCalendarDate(new Date()).slice(0, 7);
  const previous = adjacentMonth(month, -1);
  const next = adjacentMonth(month, 1);

  useEffect(() => {
    if (editingSalary) document.getElementById("bar-salary-amount")?.focus();
  }, [editingSalary]);

  const closeSalaryEditor = () => {
    setEditingSalary(false);
    salaryToggleRef.current?.focus();
  };

  return (
    <section
      aria-label={`Resumen de ${monthLabel(month)}`}
      className="sticky top-0 z-20 bg-base-950 outline -outline-offset-1 outline-base-700 before:pointer-events-none before:absolute before:-inset-x-4 before:-top-5 before:bottom-0 before:-z-10 before:bg-base-950 after:pointer-events-none after:absolute after:-inset-x-4 after:top-full after:h-8 after:bg-linear-to-b after:from-base-950 after:via-base-950/70 after:to-transparent md:before:-inset-x-8 md:before:-top-9 md:after:-inset-x-8"
    >
      <div
        className={`grid grid-cols-1 gap-px bg-base-700 ${columns[cellCount] ?? ""}`}
      >
        <nav
          aria-label="Seleccionar mes"
          className="flex items-center justify-between gap-2 bg-surface-950 px-2 py-2 lg:justify-start"
        >
          <Link
            to={financeHref(tab, previous, previewUnavailable)}
            aria-label={`Ver ${monthLabel(previous)}`}
            className={navLinkClassName}
            preventScrollReset
          >
            <MdChevronLeft aria-hidden="true" />
          </Link>
          <span className="stack-2 min-w-32 text-center">
            <span className="block font-mono text-data-label text-text-100 capitalize">
              {monthLabel(month)}
            </span>
            {month === currentMonth ? null : (
              <Link
                to={financeHref(tab, currentMonth, previewUnavailable)}
                className="block font-mono text-label-caps text-primary-text-100 uppercase underline-offset-4 focus-visible:outline-none hocus:underline"
                preventScrollReset
              >
                Ir al mes actual
              </Link>
            )}
          </span>
          <Link
            to={financeHref(tab, next, previewUnavailable)}
            aria-label={`Ver ${monthLabel(next)}`}
            className={navLinkClassName}
            preventScrollReset
          >
            <MdChevronRight aria-hidden="true" />
          </Link>
        </nav>

        {/* Like the tabs, the figures scroll sideways below `lg`; from `lg` the wrapper dissolves so they join the grid row beside the month. Horizontal scrolling forces an overflow box on both axes, so the vertical one is clipped explicitly. */}
        <div className="flex gap-px overflow-x-auto overflow-y-hidden lg:contents">
          {hasSalary ? (
            <div className={cellClassName}>
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="font-mono text-label-caps text-text-200 uppercase">
                  Sueldo neto
                </span>
                <Button
                  ref={salaryToggleRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={editingSalary}
                  aria-controls="bar-salary-editor"
                  onClick={() => setEditingSalary((open) => !open)}
                  className="-my-1 -mr-2"
                >
                  {editingSalary
                    ? "Cerrar"
                    : salaryCents === null
                      ? "Registrar"
                      : "Editar"}
                </Button>
              </div>
              <span
                className={`${valueClassName} ${salaryCents === null ? "text-text-400" : "text-text-100"}`}
              >
                {salaryCents === null ? "Sin registrar" : money(salaryCents)}
              </span>
            </div>
          ) : null}

          {metrics.map((metric) => (
            <div key={metric.label} className={cellClassName}>
              <span className="block font-mono text-label-caps text-text-200 uppercase">
                {metric.label}
              </span>
              <span
                className={`${valueClassName} ${metric.risk ? "text-red-text-400" : "text-text-100"}`}
              >
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {hasSalary && editingSalary ? (
        <div
          id="bar-salary-editor"
          className="stack-2 border-t border-base-700 bg-surface-900 p-3 sm:p-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeSalaryEditor();
          }}
        >
          <ActionForm
            key={`salary-${month}-${salaryCents}`}
            intent="salary.save"
            submitLabel={
              salaryCents === null ? "Guardar sueldo" : "Actualizar sueldo"
            }
            onSuccess={closeSalaryEditor}
            className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          >
            <input type="hidden" name="month" value={month} />
            <MoneyInput
              id="bar-salary-amount"
              label={`Sueldo neto de ${monthLabel(month)} (ARS)`}
              defaultValue={salaryCents}
              className="sm:w-80 sm:flex-none"
            />
          </ActionForm>
          <p className="text-body-sm text-text-400">
            Registre el importe neto recibido en pesos. Puede completar meses
            anteriores.
          </p>
        </div>
      ) : null}
    </section>
  );
};
