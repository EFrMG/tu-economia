import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

import { FinanceBudgetTab } from "~/components/features/FinanceBudgetTab";
import { money } from "~/components/features/FinanceFields";
import { FinanceMonthBar } from "~/components/features/FinanceMonthBar";
import { FinancePlanningTab } from "~/components/features/FinancePlanningTab";
import { FinancePricesTab } from "~/components/features/FinancePricesTab";
import { FinanceUserTab } from "~/components/features/FinanceUserTab";
import { SubscriptionOffer } from "~/components/features/SubscriptionOffer";
import { Button } from "~/components/ui/Button";
import { withUnavailablePreview } from "~/lib/data-preview";
import type { AccountState } from "~/lib/finance-access";
import {
  FINANCE_TABS,
  financeHref,
  ACCOUNT_ANCHOR,
  SUBSCRIPTION_ANCHOR,
  type FinanceTab,
} from "~/lib/finance-tabs";
import type { IndicatorPoint } from "~/lib/indicators";
import type { buildLocalFinanceMonth } from "~/lib/local-finance";
import { compareSalaryMonths } from "~/lib/personal-finance";
import { useDataPreview } from "~/lib/use-data-preview";

interface PersonalFinanceTrackerProps {
  data: ReturnType<typeof buildLocalFinanceMonth>;
  account: AccountState;
  tab: FinanceTab;
}

const tabClassName =
  "font-mono text-label-caps shrink-0 border-b-2 px-4 py-3 uppercase motion-safe:transition-colors focus-visible:outline-none";

export const FinanceTabs = ({
  tab,
  month,
}: {
  /** Null while loading a URL without `?tab=`, before the default is known. */
  tab: FinanceTab | null;
  month?: string;
}) => {
  const previewUnavailable = useDataPreview();

  return (
    <nav
      aria-label="Secciones de Mi economía"
      className="border-b border-base-700"
    >
      {/* Horizontal scrolling forces an overflow box on both axes, so the vertical one is clipped explicitly. */}
      <div className="flex overflow-x-auto overflow-y-hidden">
        {FINANCE_TABS.map((item) => (
          <Link
            key={item.id}
            to={financeHref(item.id, month, previewUnavailable)}
            aria-current={item.id === tab ? "page" : undefined}
            preventScrollReset
            className={`${tabClassName} ${item.id === tab ? "border-primary-500 text-primary-text-100" : "border-transparent text-text-200 hocus:bg-surface-900/80 hocus:text-text-100"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
};

export const FinanceHeader = ({
  tab,
  month,
}: {
  /** Null while loading a URL without `?tab=`, before the default is known. */
  tab: FinanceTab | null;
  month?: string;
}) => (
  <header className="stack-6">
    <div className="stack-2">
      <h1 className="font-heading text-headline-lg text-text-100">
        Mi economía
      </h1>
      <p className="max-w-2xl text-body-lg text-text-200">
        Sueldo, presupuesto y próximos gastos en un mismo lugar.
      </p>
    </div>
    <FinanceTabs tab={tab} month={month} />
  </header>
);

/** Signed out and lapsed visitors read the same offer; only the action names their next step. The terms, record status and deletion date live on the Usuario tab the action opens. */
const noticeAction: Record<Exclude<AccountState["access"], "edit">, string> = {
  unavailable: "Más información",
  "signed-out": "Crear cuenta",
  "read-only": "Activar suscripción",
};

/** Where on the Usuario tab each action lands, so the card to act on is highlighted. */
const noticeAnchor: Record<Exclude<AccountState["access"], "edit">, string> = {
  unavailable: "",
  "signed-out": `#${ACCOUNT_ANCHOR}`,
  "read-only": `#${SUBSCRIPTION_ANCHOR}`,
};

/** Hides the notice only while it is still below the viewport, so it rises into place as the reader reaches the end of the section. Without JavaScript, with reduced motion, or when it is already on screen, it simply stays visible. */
const useRevealOnScroll = () => {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setRevealed(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        setRevealed(true);
        observer.disconnect();
      },
      { threshold: 0.25 },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return { ref, revealed };
};

const AccessNotice = ({
  account,
  month,
}: {
  account: AccountState;
  month: string;
}) => {
  const previewUnavailable = useDataPreview();
  const { ref, revealed } = useRevealOnScroll();

  if (account.access === "edit") return null;

  return (
    <aside
      ref={ref}
      className={`pointer-events-none relative z-10 -mt-40 pt-32 motion-safe:transition-[opacity,translate] motion-safe:duration-500 motion-safe:ease-out ${revealed ? "opacity-100" : "translate-y-6 opacity-0"}`}
    >
      {/* The fade spans the overlapped tail of the section, so the notice itself always sits on the solid backdrop below it. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-transparent to-base-950"
      />
      <div className="pointer-events-auto stack-6 flex flex-col items-center bg-base-950 px-5 pt-2 pb-6 text-center sm:px-6">
        {account.access === "unavailable" ? (
          <p className="max-w-2xl text-body-lg text-text-100">
            No fue posible acceder a sus registros en este momento. No se
            modificó ningún registro.
          </p>
        ) : (
          <SubscriptionOffer
            trialEligible={account.trialEligible}
            leadClassName="max-w-2xl text-body-lg text-text-100"
          />
        )}
        <Button
          href={`${financeHref("usuario", month, previewUnavailable)}${noticeAnchor[account.access]}`}
          className="w-fit"
        >
          {noticeAction[account.access]}
        </Button>
      </div>
    </aside>
  );
};

export const PersonalFinanceTracker = ({
  data,
  account,
  tab,
}: PersonalFinanceTrackerProps) => {
  const inflationFetcher = useFetcher<{ points: IndicatorPoint[] | null }>();
  const previewUnavailable = useDataPreview();
  const requestedInflation = useRef(false);

  const hasComparison =
    data.budget.incomeCents !== null &&
    data.previousSalaryMonth !== null &&
    data.previousSalaryCents !== null &&
    data.previousSalaryCents > 0;

  useEffect(() => {
    if (tab === "presupuesto" && hasComparison && !requestedInflation.current) {
      requestedInflation.current = true;
      inflationFetcher.load(
        withUnavailablePreview(
          "/resources/inflation-history",
          previewUnavailable,
        ),
      );
    }
  }, [tab, hasComparison, inflationFetcher, previewUnavailable]);

  const inflation = inflationFetcher.data?.points;

  const comparison =
    data.previousSalaryMonth !== null &&
    data.previousSalaryCents !== null &&
    data.previousSalaryCents > 0 &&
    data.budget.incomeCents !== null &&
    inflation
      ? compareSalaryMonths(
          {
            month: data.previousSalaryMonth,
            netIncomeCents: data.previousSalaryCents,
          },
          { month: data.month, netIncomeCents: data.budget.incomeCents },
          inflation,
        )
      : data.salaryComparison;

  const inflationStatus = !hasComparison
    ? "idle"
    : inflationFetcher.data === undefined
      ? "loading"
      : inflation === null
        ? "unavailable"
        : "ready";

  const pendingCount = data.upcoming.occurrences.filter(
    (item) => item.state === "planned",
  ).length;

  const readOnly = account.access !== "edit";
  const monthTab = tab === "presupuesto" || tab === "planificacion";

  const goalsSavedCents = data.goals.reduce(
    (total, goal) => total + goal.savedCents,
    0,
  );

  return (
    <div className="stack-8 pb-12">
      <FinanceHeader tab={tab} month={data.month} />

      {/* A disabled fieldset turns off every control in the month tabs while links keep working. It renders only for those tabs, since an empty stack child would add a second gap below the tab bar. */}
      {monthTab ? (
        <fieldset disabled={readOnly} className="stack-8 min-w-0">
          {tab === "presupuesto" ? (
            <>
              <FinanceMonthBar
                key={data.month}
                tab={tab}
                month={data.month}
                salaryCents={data.budget.incomeCents}
                metrics={[
                  {
                    label: "Total previsto",
                    value: money(data.budget.plannedCents),
                  },
                  { label: "Gastado", value: money(data.budget.spentCents) },
                  {
                    label: "Sin asignar",
                    value:
                      data.budget.unassignedCents === null
                        ? "s/d"
                        : money(data.budget.unassignedCents),
                    risk:
                      data.budget.unassignedCents !== null &&
                      data.budget.unassignedCents < 0,
                  },
                ]}
              />
              <FinanceBudgetTab
                data={data}
                editable={!readOnly}
                comparison={comparison}
                inflationStatus={inflationStatus}
                onRetryInflation={() =>
                  inflationFetcher.load(
                    withUnavailablePreview(
                      "/resources/inflation-history",
                      previewUnavailable,
                    ),
                  )
                }
              />
            </>
          ) : null}

          {tab === "planificacion" ? (
            <>
              <FinanceMonthBar
                key={data.month}
                tab={tab}
                month={data.month}
                metrics={[
                  {
                    label: "Pendiente del mes",
                    value: money(data.upcoming.pendingCents),
                  },
                  {
                    label: "Vencimientos pendientes",
                    value: `${pendingCount} de ${data.upcoming.occurrences.length}`,
                  },
                  {
                    label: "Reservado en metas",
                    value: money(goalsSavedCents),
                  },
                ]}
              />
              <FinancePlanningTab data={data} />
            </>
          ) : null}
        </fieldset>
      ) : null}

      {readOnly && monthTab ? (
        <AccessNotice account={account} month={data.month} />
      ) : null}

      {tab === "precios" ? <FinancePricesTab /> : null}

      {tab === "usuario" ? <FinanceUserTab account={account} /> : null}
    </div>
  );
};
