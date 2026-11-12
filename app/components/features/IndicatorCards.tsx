import { CopyableCard } from "~/components/features/CopyableCard";
import { Skeleton } from "~/components/ui/Skeleton";
import { indicatorCardId } from "~/lib/indicator-search";
import {
  formatIndicatorCardText,
  formatIndicatorPeriod,
  formatIndicatorValue,
  INDICATOR_DEFINITIONS,
  INDICATOR_GROUPS,
  type IndicatorDefinition,
  type IndicatorGroupId,
  type IndicatorResult,
} from "~/lib/indicators";

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
  /** The groups to show, in this order. */
  groups: readonly IndicatorGroupId[];
  /** Omitted while loading; an empty list shows every card as unavailable. */
  results?: IndicatorResult[];
}

/** One section per group, so the loading and loaded states share a layout. */
export const IndicatorGroups = ({ groups, results }: IndicatorGroupsProps) => {
  const loading = results === undefined;
  const byId = new Map(results?.map((result) => [result.id, result]));

  return (
    <div className="stack-8" aria-busy={loading || undefined}>
      {loading ? (
        <span className="sr-only" role="status">
          Cargando indicadores
        </span>
      ) : null}

      {groups.map((groupId) => {
        const group = INDICATOR_GROUPS.find(({ id }) => id === groupId)!;

        return (
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
        );
      })}
    </div>
  );
};
