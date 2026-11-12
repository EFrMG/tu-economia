import { Suspense, useMemo } from "react";
import { Await } from "react-router";

import type { Route } from "./+types/actividad";
import {
  ActivityLoading,
  EconomicActivitySection,
} from "~/components/features/EconomicActivitySection";
import { IndicatorGroups } from "~/components/features/IndicatorCards";
import { RouteError } from "~/components/layout/RouteError";
import { RouteFooter } from "~/components/ui/RouteFooter";
import { isUnavailablePreview } from "~/lib/data-preview";
import { getEconomicActivity } from "~/lib/economic-activity.server";
import { INDICATOR_DEFINITIONS, type IndicatorResult } from "~/lib/indicators";
import { getIndicators } from "~/lib/indicators.server";
import { pageMeta } from "~/lib/meta";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";

const INDICATOR_GROUPS_SHOWN = ["money"] as const;

export function meta() {
  return pageMeta({
    title: "Actividad",
    description:
      "Estimador mensual de actividad económica (EMAE), base monetaria y M2 privado, con períodos y fuentes.",
    path: "/actividad",
  });
}

export function loader({ request }: Route.LoaderArgs) {
  if (isUnavailablePreview(new URL(request.url).searchParams)) {
    return {
      activity: Promise.resolve(null),
      indicators: Promise.resolve(
        INDICATOR_DEFINITIONS.map((definition): IndicatorResult => ({
          id: definition.id,
          point: null,
        })),
      ),
    };
  }

  return {
    activity: getEconomicActivity().catch(() => null),
    indicators: getIndicators(),
  };
}

/** Shared by the page, its hydration fallback and its error state, so the page keeps its title in all three. */
const ActividadHeader = () => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">Actividad</h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      La evolución de la actividad económica y del dinero en circulación, con la
      fecha de cada dato.
    </p>
  </header>
);

const ActividadFooter = () => (
  <RouteFooter>
    <p>Fuentes: INDEC vía Datos Argentina (EMAE); BCRA.</p>
  </RouteFooter>
);

export default function Actividad({ loaderData }: Route.ComponentProps) {
  const retryNeeded = useMemo(
    () =>
      Promise.all([loaderData.activity, loaderData.indicators]).then(
        ([activity, indicators]) =>
          activity === null ||
          indicators.some(
            (result) =>
              result.point === null &&
              INDICATOR_DEFINITIONS.some(
                (definition) =>
                  definition.id === result.id && definition.group === "money",
              ),
          ),
        () => true,
      ),
    [loaderData.activity, loaderData.indicators],
  );

  useFailedDataRetry(retryNeeded);

  return (
    <div className="stack-10">
      <ActividadHeader />

      <Suspense fallback={<ActivityLoading />}>
        <Await
          resolve={loaderData.activity}
          errorElement={<EconomicActivitySection activity={null} />}
        >
          {(activity) => <EconomicActivitySection activity={activity} />}
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

      <ActividadFooter />
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="stack-10">
      <ActividadHeader />
      <ActivityLoading />
      <IndicatorGroups groups={INDICATOR_GROUPS_SHOWN} />
      <ActividadFooter />
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="stack-10">
      <ActividadHeader />
      <RouteError
        title="Actividad no disponible"
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
    </div>
  );
}
