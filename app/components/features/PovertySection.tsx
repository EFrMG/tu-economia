import { useSearchParams } from "react-router";

import { ChartSkeleton } from "~/components/ui/ChartSkeleton";
import { ExternalLinkIcon } from "~/components/ui/ExternalLinkIcon";
import {
  HistoryChart,
  type HistoryPoint,
  type HistorySeries,
} from "~/components/ui/HistoryChart";
import { Skeleton } from "~/components/ui/Skeleton";
import { UnavailableNotice } from "~/components/ui/UnavailableNotice";
import { indecServiceUrl } from "~/lib/indec";
import { formatReleaseDate, nextRelease } from "~/lib/indec-calendar";
import {
  POVERTY_RECENT_YEARS,
  POVERTY_SERVICE,
  POVERTY_UNIT_PARAM,
  POVERTY_UNITS,
  POVERTY_YEARS_PARAM,
  formatPovertyChange,
  formatPovertyRate,
  formatSemester,
  formatSemesterShort,
  povertyPointsForYears,
  povertySummary,
  povertyUnitFromParam,
  povertyYearsFromParam,
  type PovertyData,
  type PovertyPoint,
  type PovertyUnit,
} from "~/lib/poverty";
import { useAnchorHighlight } from "~/lib/use-anchor-highlight";

const SERIES: readonly HistorySeries[] = [
  {
    key: "poverty",
    label: "Pobreza",
    stroke: "var(--color-primary-500)",
    textClassName: "text-primary-text-100",
  },
  {
    key: "indigence",
    label: "Indigencia",
    stroke: "var(--color-text-200)",
    textClassName: "text-text-200",
  },
];

const RANGES = [
  { years: null, label: "Serie completa" },
  {
    years: POVERTY_RECENT_YEARS,
    label: `Últimos ${POVERTY_RECENT_YEARS} años`,
  },
] as const;

const PROVISIONAL_REMARK = "Dato provisorio.";

/** Poverty going up reads as a negative movement; going down, as a positive one. */
const changeColor = (value: number | null) =>
  value === null || value === 0
    ? "text-text-200"
    : value > 0
      ? "text-red-text-400"
      : "text-secondary-text-400";

const remarksOf = (point: PovertyPoint) => [
  ...(point.provisional ? [PROVISIONAL_REMARK] : []),
  ...(point.note ? [point.note] : []),
];

const chartPoints = (points: PovertyPoint[], unit: PovertyUnit) =>
  points.map((point): HistoryPoint => ({
    x: point.period,
    values: { ...point[unit] },
    remarks: remarksOf(point),
  }));

interface SegmentedProps<Value> {
  label: string;
  options: readonly { value: Value; label: string }[];
  selected: Value;
  disabled: boolean;
  onSelect: (value: Value) => void;
}

const Segmented = <Value,>({
  label,
  options,
  selected,
  disabled,
  onSelect,
}: SegmentedProps<Value>) => (
  <div
    className="flex w-fit border border-base-700"
    role="group"
    aria-label={label}
  >
    {options.map((option) => (
      <button
        key={option.label}
        type="button"
        disabled={disabled}
        onClick={() => onSelect(option.value)}
        aria-pressed={selected === option.value}
        className={`btn-click-soft px-3 py-2 font-mono text-data-label transition-colors disabled:cursor-not-allowed ${selected === option.value ? "bg-primary-500 text-base-950" : "text-text-200 focus-visible:outline-none disabled:opacity-50 hocus:bg-surface-900/80 hocus:text-text-100"}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

interface RateTileProps {
  label: string;
  /** `undefined` while loading, `null` when unavailable. */
  value: number | null | undefined;
  /** Percentage points against the same semester a year earlier. */
  change: number | null | undefined;
  period: string | null;
  provisional: boolean;
}

/** Renders the same three lines in every state, so the chart below never moves. */
const RateTile = ({
  label,
  value,
  change,
  period,
  provisional,
}: RateTileProps) => (
  <div className="stack-2 border border-base-700 bg-base-900 p-4">
    <p className="font-mono text-label-caps text-text-200 uppercase">{label}</p>
    {value === undefined ? (
      <>
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-40" />
      </>
    ) : (
      <>
        <p className="font-mono text-data-display text-text-100">
          {value === null ? "s/d" : formatPovertyRate(value)}
        </p>
        <p className="min-h-[1lh] font-mono text-data-label text-text-400">
          {period
            ? `${formatSemester(period)}${provisional ? " · provisorio" : ""}`
            : ""}
        </p>
        <p className="min-h-[1lh] font-mono text-data-label text-text-400">
          {change != null ? (
            <>
              <span className={changeColor(change)}>
                {formatPovertyChange(change)}
              </span>{" "}
              interanual
            </>
          ) : (
            ""
          )}
        </p>
      </>
    )}
  </div>
);

interface PovertySectionProps {
  /** `undefined` while loading, `null` when the service could not be read. */
  data?: PovertyData | null;
}

const PovertySection = ({ data }: PovertySectionProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const unit = povertyUnitFromParam(searchParams.get(POVERTY_UNIT_PARAM));
  const years = povertyYearsFromParam(searchParams.get(POVERTY_YEARS_PARAM));

  const loading = data === undefined;
  const points = data?.points ?? [];
  const summary = povertySummary(points, unit);
  const visible = povertyPointsForYears(points, years);
  const release = nextRelease("pobreza");

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);

    if (value === null) next.delete(key);
    else next.set(key, value);

    setSearchParams(next, { preventScrollReset: true });
  };

  // Search opens at the heading; the bordered section around it carries the highlight.
  const borderClassName = useAnchorHighlight("pobreza");

  const tile = (rate: "poverty" | "indigence", label: string) => (
    <RateTile
      label={`${label} · ${unit}`}
      value={loading ? undefined : (summary?.latest[unit][rate] ?? null)}
      change={loading ? undefined : (summary?.change[rate] ?? null)}
      period={summary?.latest.period ?? null}
      provisional={summary?.latest.provisional ?? false}
    />
  );

  return (
    <section
      className={`stack-6 border bg-surface-950 p-4 motion-safe:transition-colors sm:p-5 ${borderClassName}`}
      aria-labelledby="pobreza"
      aria-busy={loading || undefined}
    >
      <div className="stack-2">
        <p className="font-mono text-label-caps text-text-200 uppercase">
          EPH · INDEC
        </p>
        <h2
          id="pobreza"
          className="font-heading text-headline-md text-text-100"
        >
          Pobreza e indigencia
        </h2>
        <p className="max-w-2xl text-body-sm text-text-300">
          Porcentaje de {unit} con ingresos por debajo de la línea de pobreza
          (la canasta básica total) y de la de indigencia (la canasta
          alimentaria), por semestre, en los 31 aglomerados urbanos que releva
          la Encuesta Permanente de Hogares.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tile("poverty", "Pobreza")}
        {tile("indigence", "Indigencia")}
      </div>

      <div className="stack-4 border-t border-base-700 pt-4">
        <div className="flex flex-wrap justify-between gap-2">
          <Segmented
            label="Unidad"
            options={POVERTY_UNITS.map(({ id, label }) => ({
              value: id,
              label,
            }))}
            selected={unit}
            disabled={!data}
            onSelect={(value) =>
              update(POVERTY_UNIT_PARAM, value === "personas" ? null : value)
            }
          />

          <Segmented
            label="Período del gráfico"
            options={RANGES.map(({ years: value, label }) => ({
              value,
              label,
            }))}
            selected={years}
            disabled={!data}
            onSelect={(value) =>
              update(POVERTY_YEARS_PARAM, value === null ? null : String(value))
            }
          />
        </div>

        {loading ? (
          <>
            <Skeleton className="mb-3 h-4 w-40" />
            <ChartSkeleton lines={2} />
          </>
        ) : visible.length > 0 ? (
          <HistoryChart
            points={chartPoints(visible, unit)}
            series={SERIES}
            formatValue={formatPovertyRate}
            formatAxis={(value) => `${value}%`}
            formatX={formatSemester}
            formatTick={formatSemesterShort}
            caption={`Pobreza e indigencia de ${unit} por semestre`}
            xHeader="Semestre"
            fromZero
          />
        ) : (
          <>
            {/* Keeps the legend's line, so the notice takes the plot's place and nothing below moves. */}
            <div className="mb-3 min-h-[1lh] font-mono text-data-label" />
            <div className="flex h-64 w-full items-center justify-center px-4">
              <UnavailableNotice>
                No fue posible consultar la serie de pobreza del INDEC en este
                momento.
              </UnavailableNotice>
            </div>
          </>
        )}
      </div>

      {/* A fixed line in every state: the observations themselves live in the tooltip and the screen-reader table. */}
      <p className="text-body-sm text-text-400">
        Los puntos huecos marcan semestres con una observación del INDEC, como
        un dato provisorio o un aglomerado no relevado; se leen al señalarlos.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-base-700 pt-4 font-mono text-data-label text-text-400">
        <span>
          {release
            ? `Próxima publicación: ${formatReleaseDate(release.releaseDate)}`
            : ""}
        </span>
        <a
          href={indecServiceUrl(POVERTY_SERVICE)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
        >
          Ver el servicio en el INDEC
          <ExternalLinkIcon />
        </a>
      </div>
    </section>
  );
};

export { PovertySection };
