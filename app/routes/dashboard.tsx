import { Suspense, useMemo } from "react";
import { Await, isRouteErrorResponse } from "react-router";

import type { Route } from "./+types/dashboard";
import {
  BoletinLoading,
  BoletinResumenCard,
} from "~/components/features/BoletinDigest";
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
import { isBoletinDigestEnabled } from "~/lib/boletin";
import { getBoletinDigest } from "~/lib/boletin.server";
import { getEconomicNews } from "~/lib/economic-news.server";
import { isUnavailablePreview } from "~/lib/data-preview";
import { getDashboardRates } from "~/lib/exchange-rates.server";
import { UNAVAILABLE_INDEC_DATA } from "~/lib/indec";
import { getIndecData } from "~/lib/indec.server";
import { INDICATOR_DEFINITIONS, type IndicatorResult } from "~/lib/indicators";
import { getIndicators } from "~/lib/indicators.server";
import { pageMeta } from "~/lib/meta";
import { useBoletinDigestEnabled } from "~/lib/use-equities-byma-enabled";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import { workerEnvContext } from "~/lib/worker-context";

export function meta({ loaderData }: Route.MetaArgs) {
  const boletinEnabled = loaderData?.boletinEnabled ?? false;

  return pageMeta({
    title: "Resumen",
    description: boletinEnabled
      ? "Cotizaciones del dólar, inflación, canasta básica, salario real, riesgo país, las últimas noticias económicas y las normas del Boletín Oficial."
      : "Cotizaciones del dólar, inflación, canasta básica, salario real, riesgo país y las últimas noticias económicas.",
    path: "/dashboard",
  });
}

export function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(workerEnvContext);
  const boletinEnabled = isBoletinDigestEnabled(env);

  if (isUnavailablePreview(new URL(request.url).searchParams)) {
    return {
      boletinEnabled,
      rates: Promise.resolve(null),
      indicators: Promise.resolve(
        INDICATOR_DEFINITIONS.map((definition): IndicatorResult => ({
          id: definition.id,
          point: null,
        })),
      ),
      indec: Promise.resolve(UNAVAILABLE_INDEC_DATA),
      news: Promise.resolve(null),
      boletin: Promise.resolve(null),
    };
  }

  return {
    boletinEnabled,
    rates: withUpstreamTimeout(10_000, () => getDashboardRates(env)).catch(
      () => null,
    ),
    indicators: getIndicators(env),
    indec: getIndecData(env),
    news: getEconomicNews().catch(() => null),
    boletin: boletinEnabled
      ? getBoletinDigest(env).catch(() => null)
      : Promise.resolve(null),
  };
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
    withConverter
    withGrid={false}
  />
);

const ResumenFooter = ({ boletinEnabled }: { boletinEnabled: boolean }) => (
  <RouteFooter>
    <p>
      Fuentes: Dólar API; BCRA; INDEC; Ámbito vía ArgentinaDatos
      {boletinEnabled
        ? "; Boletín Oficial de la República Argentina, con resúmenes automáticos."
        : "."}
    </p>
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
        loaderData.boletin,
      ]).then(
        ([rates, , , news, boletin]) =>
          marketRatesIncomplete(rates) ||
          news === null ||
          news.unavailableSources.length > 0 ||
          (loaderData.boletinEnabled && boletin === null),
        () => true,
      ),
    [
      loaderData.rates,
      loaderData.indicators,
      loaderData.indec,
      loaderData.news,
      loaderData.boletin,
      loaderData.boletinEnabled,
    ],
  );

  useFailedDataRetry(retryNeeded);

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

      {loaderData.boletinEnabled ? (
        <Suspense fallback={<BoletinLoading compact />}>
          <Await
            resolve={loaderData.boletin}
            errorElement={<BoletinResumenCard digest={null} />}
          >
            {(digest) => <BoletinResumenCard digest={digest} />}
          </Await>
        </Suspense>
      ) : null}

      <Suspense fallback={<NewsLoading />}>
        <Await
          resolve={loaderData.news}
          errorElement={<EconomicNewsSection news={null} />}
        >
          {(news) => <EconomicNewsSection news={news} />}
        </Await>
      </Suspense>

      <ResumenFooter boletinEnabled={loaderData.boletinEnabled} />
    </div>
  );
}

export function HydrateFallback() {
  const boletinEnabled = useBoletinDigestEnabled();

  return (
    <div className="stack-10">
      <ResumenRates rates={null} loading />
      <KeyFigures />
      {boletinEnabled ? <BoletinLoading compact /> : null}
      <NewsLoading />
      <ResumenFooter boletinEnabled={boletinEnabled} />
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
