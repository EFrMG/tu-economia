import { Suspense, useMemo } from "react";
import {
  Await,
  redirect,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import type { Route } from "./+types/tasas";
import {
  DepositInflationLoading,
  DepositInflationSection,
} from "~/components/features/DepositInflationSection";
import { IndicatorGroups } from "~/components/features/IndicatorCards";
import {
  CardFilterForm,
  CardTable,
  LoanFilterForm,
  LoanTable,
  RatesPanelSwitch,
} from "~/components/features/RatesTables";
import { RouteError } from "~/components/layout/RouteError";
import { RouteFooter } from "~/components/ui/RouteFooter";
import { isUnavailablePreview } from "~/lib/data-preview";
import { depositInflationComparisons } from "~/lib/deposit-inflation";
import { INDICATOR_DEFINITIONS, type IndicatorResult } from "~/lib/indicators";
import {
  getDepositRateHistory,
  getIndicators,
  getMonthlyInflationHistory,
} from "~/lib/indicators.server";
import { pageMeta } from "~/lib/meta";
import {
  DEFAULT_RATES_PANEL,
  isRatesPanel,
  parseCardFilters,
  parseLoanFilters,
  ratesSearch,
} from "~/lib/transparency-rates";
import { getCardPage, getLoanPage } from "~/lib/transparency-rates.server";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

const INDICATOR_GROUPS_SHOWN = ["rates", "units"] as const;

/** Parameters of the deposit calculator and the dev preview, which the panels' canonical query keeps as they are. */
const PASSTHROUGH_PARAMS = ["depositAmount", "depositMonth", "preview"];

export function meta() {
  return pageMeta({
    title: "Tasas y ahorro",
    description:
      "Tasas de depósitos, BADLAR, TAMAR y préstamos, UVA, UVI, CER e ICL, costo financiero total de préstamos personales y tarjetas por entidad, y depósitos frente a la inflación.",
    path: "/tasas",
  });
}

/**
 * Resolves `?panel=` and the panel's filters, and redirects any other query to its canonical form: unknown or invalid values and the other panel's
 * parameters are removed, and a page past the last becomes the last. A bare `/tasas` shows the default panel without a redirect.
 * The panels' data is bundled, so they never stream; the cards and the deposit comparison do.
 */
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("panel");
  const panel = isRatesPanel(requested) ? requested : DEFAULT_RATES_PANEL;

  const loanFilters =
    panel === "prestamos" ? parseLoanFilters(url.searchParams) : null;

  const cardFilters =
    panel === "tarjetas" ? parseCardFilters(url.searchParams) : null;

  const loans = loanFilters ? getLoanPage(loanFilters) : null;
  const cards = cardFilters ? getCardPage(cardFilters) : null;

  const canonical = loanFilters
    ? ratesSearch(panel, { ...loanFilters, pagina: loans!.page })
    : ratesSearch(panel, { ...cardFilters!, pagina: cards!.page });

  // A client navigation requests `/tasas.data?_routes=…`; that parameter and path belong to React Router, not to the page's query.
  const query = new URLSearchParams(url.searchParams);
  query.delete("_routes");

  const passthrough = new URLSearchParams();

  for (const key of PASSTHROUGH_PARAMS) {
    const value = query.get(key);
    if (value !== null) passthrough.set(key, value);

    query.delete(key);
  }

  if (query.size && canonical.toString() !== query.toString())
    throw redirect(
      `/tasas?${canonical}${passthrough.size ? `&${passthrough}` : ""}`,
    );

  const panels = { panel, loanFilters, loans, cardFilters, cards };

  if (isUnavailablePreview(url.searchParams))
    return {
      ...panels,
      indicators: Promise.resolve(
        INDICATOR_DEFINITIONS.map((definition): IndicatorResult => ({
          id: definition.id,
          point: null,
        })),
      ),
      comparisons: Promise.resolve(null),
    };

  return {
    ...panels,
    indicators: getIndicators(),
    comparisons: withUpstreamTimeout(10_000, () =>
      Promise.all([getMonthlyInflationHistory(), getDepositRateHistory()]).then(
        ([inflation, deposits]) =>
          depositInflationComparisons(inflation, deposits),
      ),
    ).catch(() => null),
  };
}

/** The deposit calculator's inputs live in the URL but only recompute on the client. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (
    formMethod ||
    currentUrl.pathname !== nextUrl.pathname ||
    currentUrl.search === nextUrl.search
  )
    return defaultShouldRevalidate;

  const current = new URLSearchParams(currentUrl.searchParams);
  const next = new URLSearchParams(nextUrl.searchParams);

  for (const key of ["depositAmount", "depositMonth"]) {
    current.delete(key);
    next.delete(key);
  }

  return current.toString() === next.toString()
    ? false
    : defaultShouldRevalidate;
}

/** Shared by the page and its error state, so the page keeps its title in both. */
const TasasHeader = () => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">
      Tasas y ahorro
    </h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      Tasas de referencia y unidades de actualización, el costo de préstamos
      personales y tarjetas de crédito por entidad, y el rendimiento de un
      depósito frente a la inflación.
    </p>
  </header>
);

const TasasFooter = () => (
  <RouteFooter>
    <p>Fuentes: BCRA; BCRA, Régimen de Transparencia.</p>
  </RouteFooter>
);

export default function Tasas({ loaderData }: Route.ComponentProps) {
  const { loanFilters, loans, cardFilters, cards } = loaderData;

  const retryNeeded = useMemo(
    () =>
      Promise.all([loaderData.indicators, loaderData.comparisons]).then(
        ([indicators, comparisons]) =>
          comparisons === null ||
          indicators.some(
            (result) =>
              result.point === null &&
              INDICATOR_DEFINITIONS.some(
                (definition) =>
                  definition.id === result.id &&
                  (INDICATOR_GROUPS_SHOWN as readonly string[]).includes(
                    definition.group,
                  ),
              ),
          ),
        () => true,
      ),
    [loaderData.indicators, loaderData.comparisons],
  );

  useFailedDataRetry(retryNeeded);

  return (
    <div className="stack-10">
      <TasasHeader />

      <Suspense fallback={<IndicatorGroups groups={INDICATOR_GROUPS_SHOWN} />}>
        <Await
          resolve={loaderData.indicators}
          errorElement={
            <IndicatorGroups groups={INDICATOR_GROUPS_SHOWN} results={[]} />
          }
        >
          {(results) => (
            <IndicatorGroups
              groups={INDICATOR_GROUPS_SHOWN}
              results={results}
            />
          )}
        </Await>
      </Suspense>

      <div className="stack-6">
        <RatesPanelSwitch />

        {loanFilters && loans ? (
          <>
            <LoanFilterForm filters={loanFilters} />
            <LoanTable data={loans} filters={loanFilters} />
          </>
        ) : null}

        {cardFilters && cards ? (
          <>
            <CardFilterForm filters={cardFilters} />
            <CardTable data={cards} filters={cardFilters} />
          </>
        ) : null}
      </div>

      {/* A stable anchor for search: the calculator's loading state has no heading id. */}
      <div id="depositos-e-inflacion">
        <Suspense fallback={<DepositInflationLoading />}>
          <Await
            resolve={loaderData.comparisons}
            errorElement={<DepositInflationSection comparisons={null} />}
          >
            {(comparisons) => (
              <DepositInflationSection comparisons={comparisons} />
            )}
          </Await>
        </Suspense>
      </div>

      <TasasFooter />
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="stack-10">
      <TasasHeader />
      <RatesPanelSwitch />
      <RouteError
        title="Tasas no disponibles"
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
    </div>
  );
}
