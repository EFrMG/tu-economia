import { Suspense, useMemo } from "react";
import { Await, type ShouldRevalidateFunctionArgs } from "react-router";

import type { Route } from "./+types/precios";
import { IndecTables } from "~/components/features/IndecTables";
import { IndicatorGroups } from "~/components/features/IndicatorCards";
import {
  PurchasingPowerLoading,
  PurchasingPowerSection,
} from "~/components/features/PurchasingPowerSection";
import { RouteError } from "~/components/layout/RouteError";
import { RouteFooter } from "~/components/ui/RouteFooter";
import { isUnavailablePreview } from "~/lib/data-preview";
import { UNAVAILABLE_INDEC_DATA } from "~/lib/indec";
import { getIndecData } from "~/lib/indec.server";
import { INDICATOR_DEFINITIONS, type IndicatorResult } from "~/lib/indicators";
import {
  getIndicators,
  getMonthlyInflationHistory,
} from "~/lib/indicators.server";
import { pageMeta } from "~/lib/meta";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import { workerEnvContext } from "~/lib/worker-context";

const INDICATOR_GROUPS_SHOWN = ["prices"] as const;

export function meta() {
  return pageMeta({
    title: "Precios e ingresos",
    description:
      "Inflación mensual, interanual y esperada, canasta básica, salarios, inflación por rubro y región, y el poder adquisitivo de un monto.",
    path: "/precios",
  });
}

export function loader({ request, context }: Route.LoaderArgs) {
  if (isUnavailablePreview(new URL(request.url).searchParams)) {
    return {
      indicators: Promise.resolve(
        INDICATOR_DEFINITIONS.map((definition): IndicatorResult => ({
          id: definition.id,
          point: null,
        })),
      ),
      indec: Promise.resolve(UNAVAILABLE_INDEC_DATA),
      inflationHistory: Promise.resolve(null),
    };
  }

  return {
    indicators: getIndicators(),
    indec: getIndecData(context.get(workerEnvContext).INDEC_API_TOKEN),
    inflationHistory: withUpstreamTimeout(10_000, () =>
      getMonthlyInflationHistory(),
    ).catch(() => null),
  };
}

/** The calculator's inputs live in the URL but only recompute on the client. */
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

  for (const key of ["ppAmount", "ppFrom"]) {
    current.delete(key);
    next.delete(key);
  }

  return current.toString() === next.toString()
    ? false
    : defaultShouldRevalidate;
}

/** Shared by the page, its hydration fallback and its error state, so the page keeps its title in all three. */
const PreciosHeader = () => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">
      Precios e ingresos
    </h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      Inflación, canasta básica y salarios, con el período de cada dato, y el
      poder adquisitivo de un monto a lo largo del tiempo.
    </p>
  </header>
);

const PreciosFooter = () => (
  <RouteFooter>
    <p>Fuentes: BCRA; INDEC, Catálogo API-INDEC.</p>
  </RouteFooter>
);

export default function Precios({ loaderData }: Route.ComponentProps) {
  const retryNeeded = useMemo(
    () =>
      Promise.all([
        loaderData.indicators,
        loaderData.indec,
        loaderData.inflationHistory,
      ]).then(
        ([indicators, indec, inflation]) =>
          indicators.some(
            (result) =>
              result.point === null &&
              INDICATOR_DEFINITIONS.some(
                (definition) =>
                  definition.id === result.id && definition.group === "prices",
              ),
          ) ||
          Object.values(indec).some((part) => part === null) ||
          inflation === null,
        () => true,
      ),
    [loaderData.indicators, loaderData.indec, loaderData.inflationHistory],
  );

  useFailedDataRetry(retryNeeded);

  return (
    <div className="stack-10">
      <PreciosHeader />

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

      <Suspense fallback={<IndecTables />}>
        <Await
          resolve={loaderData.indec}
          errorElement={<IndecTables data={UNAVAILABLE_INDEC_DATA} />}
        >
          {(indec) => <IndecTables data={indec} />}
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

      <PreciosFooter />
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="stack-10">
      <PreciosHeader />
      <IndicatorGroups groups={INDICATOR_GROUPS_SHOWN} />
      <IndecTables />
      <PurchasingPowerLoading />
      <PreciosFooter />
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="stack-10">
      <PreciosHeader />
      <RouteError
        title="Precios e ingresos no disponible"
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
    </div>
  );
}
