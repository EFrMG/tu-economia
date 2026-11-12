import { Suspense, useMemo } from "react";
import { Await } from "react-router";

import type { Route } from "./+types/indicadores";
import { CopyableCard } from "~/components/features/CopyableCard";
import { RouteError } from "~/components/layout/RouteError";
import { RouteFooter } from "~/components/ui/RouteFooter";
import { Skeleton } from "~/components/ui/Skeleton";
import {
  ActivityLoading,
  EconomicActivitySection,
} from "~/components/features/EconomicActivitySection";
import { getEconomicActivity } from "~/lib/economic-activity.server";
import { IndecTables } from "~/components/features/IndecTables";
import { UNAVAILABLE_INDEC_DATA } from "~/lib/indec";
import { getIndecData } from "~/lib/indec.server";
import { indicatorCardId } from "~/lib/indicator-search";
import { getIndicators } from "~/lib/indicators.server";
import { isUnavailablePreview } from "~/lib/data-preview";
import {
  formatIndicatorCardText,
  formatIndicatorPeriod,
  formatIndicatorValue,
  INDICATOR_DEFINITIONS,
  INDICATOR_GROUPS,
  type IndicatorDefinition,
  type IndicatorResult,
} from "~/lib/indicators";
import { pageMeta } from "~/lib/meta";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { workerEnvContext } from "~/lib/worker-context";

export function meta() {
  return pageMeta({
    title: "Indicadores",
    description:
      "Inflación, canasta básica, salarios, tasas de interés, reservas, tipo de cambio, dinero, UVA, riesgo país y actividad económica, con períodos y fuentes.",
    path: "/indicadores",
  });
}

export function loader({ request, context }: Route.LoaderArgs) {
  const previewUnavailable = isUnavailablePreview(
    new URL(request.url).searchParams,
  );

  const indicators = previewUnavailable
    ? Promise.resolve(
        INDICATOR_DEFINITIONS.map((definition): IndicatorResult => ({
          id: definition.id,
          point: null,
        })),
      )
    : getIndicators();

  const activity = previewUnavailable
    ? Promise.resolve(null)
    : getEconomicActivity().catch(() => null);

  const indec = previewUnavailable
    ? Promise.resolve(UNAVAILABLE_INDEC_DATA)
    : getIndecData(context.get(workerEnvContext).INDEC_API_TOKEN);

  return { indicators, activity, indec };
}

interface IndicatorCardProps {
  definition: IndicatorDefinition;
  result?: IndicatorResult;
  loading?: boolean;
}

const IndicatorCard = ({
  definition,
  result,
  loading = false,
}: IndicatorCardProps) => (
  <CopyableCard
    id={indicatorCardId(definition.id)}
    copyLabel={`Copiar indicador ${definition.title}`}
    text={
      result?.point ? formatIndicatorCardText(definition, result.point) : null
    }
    ariaHidden={loading}
    className={`stack-4 border border-base-700 bg-surface-950 p-5 ${result?.point ? "transition-colors duration-200 focus-within:border-primary-500/50 focus-within:bg-surface-900/80 hover:border-primary-500/50" : ""}`}
  >
    <div className="stack-2">
      <p className="font-mono text-label-caps text-text-200 uppercase">
        {definition.cadence}
      </p>
      <h3 className="font-heading text-body-lg font-semibold text-text-100">
        {definition.title}
      </h3>
      <p className="text-body-sm text-text-300">{definition.description}</p>
    </div>

    {loading ? (
      <div className="stack-2" aria-hidden="true">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    ) : result?.point ? (
      <div className="stack-2">
        <p className="font-mono text-data-display text-text-100">
          {formatIndicatorValue(result.point.value, definition.unit)}
        </p>
        <p className="font-mono text-data-label text-text-200">
          Período: {formatIndicatorPeriod(result.point.date, definition.period)}
        </p>
      </div>
    ) : (
      <p
        className="font-mono text-label-caps text-tertiary-text-400 uppercase"
        role="status"
      >
        Esta serie no está disponible en este momento.
      </p>
    )}

    <div className="mt-auto flex justify-end border-t border-base-700 pt-4">
      <a
        href={definition.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={loading ? -1 : undefined}
        className="relative z-40 block w-fit font-mono text-data-label text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
      >
        Ver la serie en la fuente ↗
      </a>
    </div>
  </CopyableCard>
);

interface IndicatorGroupsProps {
  results?: IndicatorResult[];
  loading?: boolean;
}

/** Renders one section per subject, in `INDICATOR_GROUPS` order, so the loading and loaded states share a layout. */
const IndicatorGroups = ({
  results = [],
  loading = false,
}: IndicatorGroupsProps) => {
  const byId = new Map(results.map((result) => [result.id, result]));

  return (
    <div className="stack-8" aria-busy={loading || undefined}>
      {loading ? (
        <span className="sr-only" role="status">
          Cargando indicadores
        </span>
      ) : null}

      {INDICATOR_GROUPS.map((group) => (
        <section
          key={group.id}
          className="stack-4"
          aria-labelledby={`indicadores-${group.id}`}
        >
          <h2
            id={`indicadores-${group.id}`}
            className="font-heading text-headline-md text-text-100"
          >
            {group.title}
          </h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {INDICATOR_DEFINITIONS.filter(
              (definition) => definition.group === group.id,
            ).map((definition) => (
              <IndicatorCard
                key={definition.id}
                definition={definition}
                result={byId.get(definition.id)}
                loading={loading}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

const IndicatorResults = ({ results }: { results: IndicatorResult[] }) => (
  <IndicatorGroups results={results} />
);

const IndicatorsLoading = () => <IndicatorGroups loading />;

/** Shared by the page, its hydration fallback and its error state, so the page keeps its title in all three. */
const IndicadoresHeader = () => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">Indicadores</h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      Precios, ingresos, tasas de interés, dólar, dinero, unidades de
      actualización y actividad económica, con la fecha y unidad de cada dato.
      Las series se publican con diferentes frecuencias y demoras.
    </p>
  </header>
);

const IndicadoresFooter = () => (
  <RouteFooter>
    <p>
      Fuentes: BCRA; INDEC, Catálogo API-INDEC (canastas básicas, índice de
      salarios e IPC); Ámbito vía ArgentinaDatos; INDEC vía Datos Argentina
      (EMAE).
    </p>
  </RouteFooter>
);

export default function Indicadores({ loaderData }: Route.ComponentProps) {
  const retryNeeded = useMemo(
    () =>
      Promise.all([
        loaderData.indicators,
        loaderData.activity,
        loaderData.indec,
      ]).then(
        ([results, activity, indec]) =>
          results.some((result) => result.point === null) ||
          activity === null ||
          Object.values(indec).some((part) => part === null),
        () => true,
      ),
    [loaderData.indicators, loaderData.activity, loaderData.indec],
  );

  useFailedDataRetry(retryNeeded);

  return (
    <div className="stack-10">
      <IndicadoresHeader />

      <Suspense fallback={<IndicatorsLoading />}>
        <Await
          resolve={loaderData.indicators}
          errorElement={<IndicatorResults results={[]} />}
        >
          {(results) => <IndicatorResults results={results} />}
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

      <Suspense fallback={<ActivityLoading />}>
        <Await
          resolve={loaderData.activity}
          errorElement={<EconomicActivitySection activity={null} />}
        >
          {(activity) => <EconomicActivitySection activity={activity} />}
        </Await>
      </Suspense>

      <IndicadoresFooter />
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="stack-10">
      <IndicadoresHeader />
      <IndicatorsLoading />
      <IndecTables />
      <ActivityLoading />
      <IndicadoresFooter />
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="stack-10">
      <IndicadoresHeader />
      <RouteError
        title="Indicadores no disponibles"
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
    </div>
  );
}
