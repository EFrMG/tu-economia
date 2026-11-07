import { Suspense, useMemo } from "react";
import { Await, type ShouldRevalidateFunctionArgs } from "react-router";

import type { Route } from "./+types/analisis";
import {
  DepositInflationLoading,
  DepositInflationSection,
} from "~/components/features/DepositInflationSection";
import { HistoricalExchangeChart } from "~/components/features/HistoricalExchangeChart";
import { RouteError } from "~/components/layout/RouteError";
import { RouteFooter } from "~/components/ui/RouteFooter";
import {
  PurchasingPowerLoading,
  PurchasingPowerSection,
} from "~/components/features/PurchasingPowerSection";
import { depositInflationComparisons } from "~/lib/deposit-inflation";
import { isUnavailablePreview } from "~/lib/data-preview";
import { argentinaCalendarDate } from "~/lib/exchange-rate-history";
import { getDashboardHistory } from "~/lib/exchange-rates.server";
import {
  getDepositRateHistory,
  getMonthlyInflationHistory,
} from "~/lib/indicators.server";
import { pageMeta } from "~/lib/meta";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

export function meta() {
  return pageMeta({
    title: "Análisis",
    description:
      "Brecha histórica del dólar, poder adquisitivo y comparación entre depósitos e inflación.",
    path: "/analisis",
  });
}

export function loader({ request }: Route.LoaderArgs) {
  const previewUnavailable = isUnavailablePreview(
    new URL(request.url).searchParams,
  );

  const unavailableHistory = () => ({
    historicalChart: [],
    historicalAsOf: argentinaCalendarDate(new Date()),
    historicalFailedSeries: ["blue", "oficial"] as ("blue" | "oficial")[],
  });

  const history = previewUnavailable
    ? Promise.resolve(unavailableHistory())
    : withUpstreamTimeout(10_000, () => getDashboardHistory()).catch(
        unavailableHistory,
      );

  const inflationHistory = previewUnavailable
    ? Promise.resolve(null)
    : withUpstreamTimeout(10_000, () => getMonthlyInflationHistory()).catch(
        () => null,
      );

  const comparisons = previewUnavailable
    ? Promise.resolve(null)
    : withUpstreamTimeout(10_000, () =>
        Promise.all([
          getMonthlyInflationHistory(),
          getDepositRateHistory(),
        ]).then(([inflation, deposits]) =>
          depositInflationComparisons(inflation, deposits),
        ),
      ).catch(() => null);

  return { history, inflationHistory, comparisons };
}

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
  for (const key of [
    "period",
    "ppAmount",
    "ppFrom",
    "depositAmount",
    "depositMonth",
  ]) {
    current.delete(key);
    next.delete(key);
  }

  return current.toString() === next.toString()
    ? false
    : defaultShouldRevalidate;
}

/** Shared by the page, its hydration fallback and its error state, so the page keeps its title in all three. */
const AnalisisHeader = () => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">Análisis</h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      Compare series históricas y explore cómo cambió el valor de un monto con
      datos publicados.
    </p>
  </header>
);

const HistoryLoading = () => (
  <HistoricalExchangeChart
    points={[]}
    asOf={argentinaCalendarDate(new Date())}
    failedSeries={[]}
    view="gap"
    loading
  />
);

/** The loader rejected outright: render the same shell in its failure state, so the section keeps its height. */
const HistoryUnavailable = () => (
  <HistoricalExchangeChart
    points={[]}
    asOf={argentinaCalendarDate(new Date())}
    failedSeries={["blue", "oficial"]}
    view="gap"
  />
);

export default function Analisis({ loaderData }: Route.ComponentProps) {
  const retryNeeded = useMemo(
    () =>
      Promise.all([
        loaderData.history,
        loaderData.inflationHistory,
        loaderData.comparisons,
      ]).then(
        ([history, inflation, comparisons]) =>
          history.historicalFailedSeries.length > 0 ||
          inflation === null ||
          comparisons === null,
        () => true,
      ),
    [loaderData.history, loaderData.inflationHistory, loaderData.comparisons],
  );

  useFailedDataRetry(retryNeeded);

  return (
    <div className="stack-8">
      <AnalisisHeader />

      <Suspense fallback={<HistoryLoading />}>
        <Await
          resolve={loaderData.history}
          errorElement={<HistoryUnavailable />}
        >
          {(history) => (
            <HistoricalExchangeChart
              points={history.historicalChart}
              asOf={history.historicalAsOf}
              failedSeries={history.historicalFailedSeries}
              view="gap"
            />
          )}
        </Await>
      </Suspense>

      <Suspense fallback={<PurchasingPowerLoading />}>
        <Await
          resolve={loaderData.inflationHistory}
          errorElement={<PurchasingPowerSection history={null} />}
        >
          {(history) => <PurchasingPowerSection history={history} />}
        </Await>
      </Suspense>

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

      <RouteFooter>
        <p>Fuentes: ArgentinaDatos; BCRA.</p>
      </RouteFooter>
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="stack-8">
      <AnalisisHeader />
      <HistoryLoading />
      <PurchasingPowerLoading />
      <DepositInflationLoading />
      <RouteFooter>
        <p>Fuentes: ArgentinaDatos; BCRA.</p>
      </RouteFooter>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="stack-8">
      <AnalisisHeader />
      <RouteError
        title="Análisis no disponible"
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
    </div>
  );
}
