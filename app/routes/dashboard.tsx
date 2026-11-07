import { Suspense, useEffect, useMemo } from "react";
import {
  Await,
  isRouteErrorResponse,
  redirect,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import type { Route } from "./+types/dashboard";
import { ExchangeRateCard } from "~/components/features/ExchangeRateCard";
import {
  EconomicNewsSection,
  NewsLoading,
} from "~/components/features/EconomicNews";
import { CurrencyConverter } from "~/components/features/CurrencyConverter";
import { HighlightRateCard } from "~/components/features/HighlightRateCard";
import { HistoricalExchangeChart } from "~/components/features/HistoricalExchangeChart";
import { RouteFooter } from "~/components/ui/RouteFooter";
import { getEconomicNews } from "~/lib/economic-news.server";
import { isUnavailablePreview } from "~/lib/data-preview";
import {
  getDashboardHistory,
  getDashboardRates,
  type DashboardRates,
} from "~/lib/exchange-rates.server";
import {
  argentinaCalendarDate,
  chartPeriodFromSearchParam,
} from "~/lib/exchange-rate-history";
import { formatGap } from "~/lib/format";
import { pageMeta } from "~/lib/meta";
import { rateCardId, searchableRateCasa } from "~/lib/exchange-rate-search";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";

export function meta() {
  return pageMeta({
    title: "Dashboard",
    description:
      "Cotizaciones de los principales tipos de cambio del mercado argentino: blue, oficial, MEP, CCL y cripto.",
    path: "/dashboard",
  });
}

export function loader({ request }: Route.LoaderArgs) {
  const searchParams = new URL(request.url).searchParams;

  if (searchParams.get("view") === "gap") {
    const next = new URL("/analisis", request.url);

    next.searchParams.set(
      "period",
      String(chartPeriodFromSearchParam(searchParams.get("period"))),
    );

    if (searchParams.has("preview"))
      next.searchParams.set("preview", searchParams.get("preview") ?? "");

    throw redirect(`${next.pathname}${next.search}`);
  }

  if (isUnavailablePreview(searchParams)) {
    return {
      market: Promise.resolve({
        rates: null,
        history: {
          historicalChart: [],
          historicalAsOf: argentinaCalendarDate(new Date()),
          historicalFailedSeries: ["blue", "oficial"] as ("blue" | "oficial")[],
        },
      }),
      news: Promise.resolve(null),
    };
  }

  const news = getEconomicNews().catch(() => null);

  const unavailableHistory = () => ({
    historicalChart: [],
    historicalAsOf: argentinaCalendarDate(new Date()),
    historicalFailedSeries: ["blue", "oficial"] as ("blue" | "oficial")[],
  });

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

  return { market, news };
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

  current.delete("period");
  next.delete("period");
  current.delete("rate");
  next.delete("rate");

  return current.toString() === next.toString()
    ? false
    : defaultShouldRevalidate;
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const retryNeeded = useMemo(
    () =>
      Promise.all([loaderData.market, loaderData.news]).then(
        ([market, news]) =>
          !market.rates ||
          market.rates.freshness.status === "stale" ||
          dashboardGridCasas.some(
            (casa) => !market.rates?.grid.some((rate) => rate.casa === casa),
          ) ||
          market.history.historicalFailedSeries.length > 0 ||
          news === null ||
          news.unavailableSources.length > 0,
        () => true,
      ),
    [loaderData.market, loaderData.news],
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
    <div className="flex flex-col gap-8">
      <Suspense fallback={<MarketContent market={null} loading />}>
        <Await
          resolve={loaderData.market}
          errorElement={<MarketContent market={null} />}
        >
          {(market) => <MarketContent market={market} />}
        </Await>
      </Suspense>

      <Suspense fallback={<NewsLoading />}>
        <Await
          resolve={loaderData.news}
          errorElement={<EconomicNewsSection news={null} />}
        >
          {(news) => <EconomicNewsSection news={news} />}
        </Await>
      </Suspense>

      <RouteFooter>
        <p>Fuentes: Dólar API; ArgentinaDatos.</p>
      </RouteFooter>
    </div>
  );
}

interface MarketContentProps {
  market: {
    rates: DashboardRates | null;
    history: Awaited<ReturnType<typeof getDashboardHistory>>;
  } | null;
  loading?: boolean;
}

const MarketContent = ({ market, loading = false }: MarketContentProps) => {
  const rates = market?.rates ?? null;
  const history = market?.history;
  const isStale = rates?.freshness.status === "stale";

  const gridByCasa = new Map(
    rates?.grid.map((rate) => [rate.casa, rate]) ?? [],
  );

  return (
    <div className="flex flex-col gap-8" aria-busy={loading}>
      {loading ? (
        <span className="sr-only" role="status">
          Cargando cotizaciones del mercado.
        </span>
      ) : null}

      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="mb-auto">
          <h1 className="mb-2 font-heading text-headline-lg text-text-100">
            Tipos de cambio.
          </h1>
          <p className="max-w-2xl text-body-lg text-text-200">
            {isStale
              ? "Mostramos los últimos datos disponibles mientras se restablece la consulta."
              : "Cotizaciones del mercado argentino. Datos claros, sin ruido."}
          </p>
        </div>

        <HighlightRateCard
          rate={rates?.highlight ?? null}
          id={rateCardId("blue")}
          loading={loading}
        />
      </header>

      <CurrencyConverter
        rates={rates ? [rates.highlight, ...rates.grid] : []}
        loading={loading}
      />

      <section>
        {isStale ? (
          <p
            className="mb-4 border-l-2 border-tertiary-500/30 bg-surface-900 px-4 py-3 text-body-sm text-text-300"
            role="status"
          >
            No fue posible actualizar las cotizaciones. Se muestran los últimos
            valores recibidos. Última consulta exitosa:{" "}
            {rates?.freshness.lastSuccessfulFetchAtLabel} ART.
          </p>
        ) : null}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="border-b border-primary-500/30 pb-1 font-mono text-label-caps text-text-200 uppercase">
            ARS-USD
          </h2>
          {rates ? (
            <span className="font-mono text-data-label text-text-400">
              {rates.updatedAt
                ? `Última actualización: ${rates.updatedAt} ART`
                : "Última actualización: s/d"}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dashboardGridCasas.map((casa) => (
            <ExchangeRateCard
              key={casa}
              casa={casa}
              rate={gridByCasa.get(casa) ?? null}
              footnote={rates ? footnoteFor(casa, rates.brecha) : ""}
              id={rateCardId(casa)}
              loading={loading}
            />
          ))}
        </div>
      </section>

      <HistoricalExchangeChart
        points={history?.historicalChart ?? []}
        asOf={history?.historicalAsOf ?? argentinaCalendarDate(new Date())}
        failedSeries={history?.historicalFailedSeries ?? []}
        view="quotes"
        loading={loading}
      />
    </div>
  );
};

export function HydrateFallback() {
  return (
    <div className="flex flex-col gap-8">
      <MarketContent market={null} loading />
      <NewsLoading />
      <RouteFooter>
        <p>Fuentes: Dólar API; ArgentinaDatos.</p>
      </RouteFooter>
    </div>
  );
}

const dashboardGridCasas = [
  "oficial",
  "bolsa",
  "contadoconliqui",
  "cripto",
] as const;

/** The official rate is the reference, so it is compared against the blue. */
function footnoteFor(casa: string, brecha: Record<string, number>) {
  const gap = casa === "oficial" ? brecha.blue : brecha[casa];
  if (gap === undefined) return "Brecha: s/d";

  return `Brecha${casa === "oficial" ? " blue" : ""}: ${formatGap(gap)}`;
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
