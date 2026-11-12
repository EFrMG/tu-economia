import { Suspense, useEffect, useMemo } from "react";
import {
  Await,
  isRouteErrorResponse,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import type { Route } from "./+types/dashboard";
import {
  EconomicNewsSection,
  NewsLoading,
} from "~/components/features/EconomicNews";
import { KeyFigures } from "~/components/features/KeyFigures";
import {
  MarketRates,
  marketRatesIncomplete,
} from "~/components/features/MarketRates";
import { RouteFooter } from "~/components/ui/RouteFooter";
import { getEconomicNews } from "~/lib/economic-news.server";
import { isUnavailablePreview } from "~/lib/data-preview";
import { getDashboardRates } from "~/lib/exchange-rates.server";
import { rateCardId, searchableRateCasa } from "~/lib/exchange-rate-search";
import { UNAVAILABLE_INDEC_DATA } from "~/lib/indec";
import { getIndecData } from "~/lib/indec.server";
import { INDICATOR_DEFINITIONS, type IndicatorResult } from "~/lib/indicators";
import { getIndicators } from "~/lib/indicators.server";
import { pageMeta } from "~/lib/meta";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import { workerEnvContext } from "~/lib/worker-context";

export function meta() {
  return pageMeta({
    title: "Resumen",
    description:
      "Cotizaciones del dólar, inflación, canasta básica, salario real, riesgo país y las últimas noticias económicas.",
    path: "/dashboard",
  });
}

export function loader({ request, context }: Route.LoaderArgs) {
  if (isUnavailablePreview(new URL(request.url).searchParams)) {
    return {
      rates: Promise.resolve(null),
      indicators: Promise.resolve(
        INDICATOR_DEFINITIONS.map((definition): IndicatorResult => ({
          id: definition.id,
          point: null,
        })),
      ),
      indec: Promise.resolve(UNAVAILABLE_INDEC_DATA),
      news: Promise.resolve(null),
    };
  }

  return {
    rates: withUpstreamTimeout(10_000, () => getDashboardRates()).catch(
      () => null,
    ),
    indicators: getIndicators(),
    indec: getIndecData(context.get(workerEnvContext).INDEC_API_TOKEN),
    news: getEconomicNews().catch(() => null),
  };
}

/** `?rate=` only selects a card already on the page. */
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

  current.delete("rate");
  next.delete("rate");

  return current.toString() === next.toString()
    ? false
    : defaultShouldRevalidate;
}

const ResumenRates = ({
  rates,
  loading = false,
}: {
  rates: Parameters<typeof MarketRates>[0]["rates"];
  loading?: boolean;
}) => (
  <MarketRates
    rates={rates}
    loading={loading}
    title="Resumen."
    lead="Cotizaciones y cifras clave del mercado argentino. Datos claros, sin ruido."
  />
);

const ResumenFooter = () => (
  <RouteFooter>
    <p>Fuentes: Dólar API; BCRA; INDEC; Ámbito vía ArgentinaDatos.</p>
  </RouteFooter>
);

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const retryNeeded = useMemo(
    () =>
      Promise.all([
        loaderData.rates,
        loaderData.indicators,
        loaderData.indec,
        loaderData.news,
      ]).then(
        ([rates, , , news]) =>
          marketRatesIncomplete(rates) ||
          news === null ||
          news.unavailableSources.length > 0,
        () => true,
      ),
    [
      loaderData.rates,
      loaderData.indicators,
      loaderData.indec,
      loaderData.news,
    ],
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

  const keyFigures = useMemo(
    () => Promise.all([loaderData.indicators, loaderData.indec]),
    [loaderData.indicators, loaderData.indec],
  );

  return (
    <div className="stack-10">
      <Suspense fallback={<ResumenRates rates={null} loading />}>
        <Await
          resolve={loaderData.rates}
          errorElement={<ResumenRates rates={null} />}
        >
          {(rates) => <ResumenRates rates={rates} />}
        </Await>
      </Suspense>

      <Suspense fallback={<KeyFigures />}>
        <Await
          resolve={keyFigures}
          errorElement={
            <KeyFigures indicators={[]} indec={UNAVAILABLE_INDEC_DATA} />
          }
        >
          {([indicators, indec]) => (
            <KeyFigures indicators={indicators} indec={indec} />
          )}
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

      <ResumenFooter />
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="stack-10">
      <ResumenRates rates={null} loading />
      <KeyFigures />
      <NewsLoading />
      <ResumenFooter />
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
