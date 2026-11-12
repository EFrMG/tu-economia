import { Suspense, useEffect, useMemo } from "react";
import {
  Await,
  isRouteErrorResponse,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import type { Route } from "./+types/dolar";
import { HistoricalExchangeChart } from "~/components/features/HistoricalExchangeChart";
import { IndicatorGroups } from "~/components/features/IndicatorCards";
import {
  MarketRates,
  marketRatesIncomplete,
} from "~/components/features/MarketRates";
import { RouteFooter } from "~/components/ui/RouteFooter";
import { isUnavailablePreview } from "~/lib/data-preview";
import {
  getDashboardHistory,
  getDashboardRates,
  type DashboardRates,
} from "~/lib/exchange-rates.server";
import {
  argentinaCalendarDate,
  chartViewFromSearchParam,
} from "~/lib/exchange-rate-history";
import { rateCardId, searchableRateCasa } from "~/lib/exchange-rate-search";
import { getIndicators } from "~/lib/indicators.server";
import { INDICATOR_DEFINITIONS, type IndicatorResult } from "~/lib/indicators";
import { pageMeta } from "~/lib/meta";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

const INDICATOR_GROUPS_SHOWN = ["external"] as const;

export function meta() {
  return pageMeta({
    title: "Dólar",
    description:
      "Cotizaciones del dólar blue, oficial, MEP, CCL y cripto, conversor, evolución y brecha histórica, dólar mayorista, reservas y riesgo país.",
    path: "/dolar",
  });
}

const unavailableHistory = () => ({
  historicalChart: [],
  historicalAsOf: argentinaCalendarDate(new Date()),
  historicalFailedSeries: ["blue", "oficial"] as ("blue" | "oficial")[],
});

export function loader({ request }: Route.LoaderArgs) {
  if (isUnavailablePreview(new URL(request.url).searchParams)) {
    return {
      market: Promise.resolve({ rates: null, history: unavailableHistory() }),
      indicators: Promise.resolve(
        INDICATOR_DEFINITIONS.map((definition): IndicatorResult => ({
          id: definition.id,
          point: null,
        })),
      ),
    };
  }

  const history = getDashboardHistory().catch(unavailableHistory);

  const market = withUpstreamTimeout(10_000, async () => {
    try {
      const rates = await getDashboardRates();
      const { historicalChart, historicalAsOf, historicalFailedSeries } = rates;
      return {
        rates,
        history: { historicalChart, historicalAsOf, historicalFailedSeries },
      };
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 502) throw error;

      return { rates: null, history: await history };
    }
  }).catch(() => ({ rates: null, history: unavailableHistory() }));

  return { market, indicators: getIndicators() };
}

/** The chart's period and view, and the rate card selected by search, are presentation state: the history already loaded covers every period. */
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

  for (const key of ["period", "view", "rate"]) {
    current.delete(key);
    next.delete(key);
  }

  return current.toString() === next.toString()
    ? false
    : defaultShouldRevalidate;
}

interface MarketContentProps {
  market: {
    rates: DashboardRates | null;
    history: Awaited<ReturnType<typeof getDashboardHistory>>;
  } | null;
  loading?: boolean;
}

const MarketContent = ({ market, loading = false }: MarketContentProps) => {
  const [searchParams] = useSearchParams();
  const history = market?.history;

  return (
    <MarketRates
      rates={market?.rates ?? null}
      loading={loading}
      title="Dólar"
      lead="Cotizaciones del mercado argentino y su evolución histórica."
    >
      <HistoricalExchangeChart
        points={history?.historicalChart ?? []}
        asOf={history?.historicalAsOf ?? argentinaCalendarDate(new Date())}
        failedSeries={history?.historicalFailedSeries ?? []}
        view={chartViewFromSearchParam(searchParams.get("view"))}
        loading={loading}
      />
    </MarketRates>
  );
};

const DolarFooter = () => (
  <RouteFooter>
    <p>Fuentes: Dólar API; ArgentinaDatos; BCRA; Ámbito vía ArgentinaDatos.</p>
  </RouteFooter>
);

export default function Dolar({ loaderData }: Route.ComponentProps) {
  const retryNeeded = useMemo(
    () =>
      Promise.all([loaderData.market, loaderData.indicators]).then(
        ([market, indicators]) =>
          marketRatesIncomplete(market.rates) ||
          market.history.historicalFailedSeries.length > 0 ||
          indicators.some(
            (result) =>
              result.point === null &&
              INDICATOR_DEFINITIONS.some(
                (definition) =>
                  definition.id === result.id &&
                  definition.group === "external",
              ),
          ),
        () => true,
      ),
    [loaderData.market, loaderData.indicators],
  );

  useFailedDataRetry(retryNeeded);

  const [searchParams] = useSearchParams();
  const selectedCasa = searchableRateCasa(searchParams.get("rate"));

  useEffect(() => {
    if (!selectedCasa) return;

    const target = document.getElementById(rateCardId(selectedCasa));
    if (!target) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });

    target.focus({ preventScroll: true });
  }, [selectedCasa]);

  return (
    <div className="stack-10">
      <Suspense fallback={<MarketContent market={null} loading />}>
        <Await
          resolve={loaderData.market}
          errorElement={<MarketContent market={null} />}
        >
          {(market) => <MarketContent market={market} />}
        </Await>
      </Suspense>

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

      <DolarFooter />
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="stack-10">
      <MarketContent market={null} loading />
      <IndicatorGroups groups={INDICATOR_GROUPS_SHOWN} />
      <DolarFooter />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const detail = isRouteErrorResponse(error)
    ? error.data || error.statusText
    : "Error inesperado al procesar las cotizaciones.";

  return (
    <div className="border border-base-700 bg-surface-950 p-8">
      <p className="mb-3 font-mono text-label-caps text-tertiary-text-400 uppercase">
        Feed interrumpido
      </p>
      <h1 className="mb-2 font-heading text-headline-md text-text-100">
        Sin datos de mercado.
      </h1>
      <p className="max-w-prose text-body-sm text-text-200">{detail}</p>
    </div>
  );
}
