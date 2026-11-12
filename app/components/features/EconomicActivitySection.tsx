import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { UnavailableNotice } from "~/components/ui/UnavailableNotice";
import { Skeleton } from "~/components/ui/Skeleton";
import { ChartSkeleton } from "~/components/ui/ChartSkeleton";
import {
  ACTIVITY_CSV_URL,
  ACTIVITY_METHOD_URL,
  activityRateDifference,
  formatActivityChange,
  formatActivityMonth,
  formatActivityShortMonth,
  type EconomicActivity,
} from "~/lib/economic-activity";
import { useAnchorHighlight } from "~/lib/use-anchor-highlight";
import { formatReleaseDate, nextRelease } from "~/lib/indec-calendar";

interface EconomicActivitySectionProps {
  activity: EconomicActivity | null;
}

const activityValueColor = (value: number | null) =>
  value === null
    ? "text-text-200"
    : value < 0
      ? "text-red-text-400"
      : value > 0
        ? "text-secondary-text-400"
        : "text-text-100";

const ActivityTooltip = ({ active, label, payload }: TooltipContentProps) => {
  if (!active || typeof label !== "string") return null;

  const value = payload?.find(
    (entry) => entry.dataKey === "yearOverYear",
  )?.value;

  return (
    <div className="border border-base-700 bg-surface-900 px-3 py-2">
      <p className="font-mono text-data-label text-text-200">
        {formatActivityMonth(label)}
      </p>
      <p className="mt-1 font-mono text-data-label text-text-100">
        Variación interanual:{" "}
        {formatActivityChange(typeof value === "number" ? value : null)}
      </p>
    </div>
  );
};

const ActivityLoading = () => {
  const borderClassName = useAnchorHighlight("activity-title");

  return (
    <section
      className={`stack-6 border bg-surface-950 p-4 motion-safe:transition-colors sm:p-5 ${borderClassName}`}
      aria-busy="true"
      aria-labelledby="activity-title"
    >
      <div className="stack-2">
        <p className="font-mono text-label-caps text-text-200 uppercase">
          EMAE · INDEC
        </p>
        <h2
          id="activity-title"
          className="font-heading text-headline-md text-text-100"
        >
          Actividad económica
        </h2>
        <p className="max-w-2xl text-body-sm text-text-300">
          Evolución mensual de la actividad económica. Las comparaciones
          interanual y mensual usan series diferentes.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          "Variación interanual · serie original",
          "Variación mensual · desestacionalizada",
        ].map((label) => (
          <div
            key={label}
            className="stack-2 border border-base-700 bg-base-900 p-4"
          >
            <p className="font-mono text-label-caps text-text-200 uppercase">
              {label}
            </p>
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="border-t border-base-700 pt-4">
        <Skeleton className="mb-5 h-4 w-48" />
        <ChartSkeleton className="h-56" />
      </div>
      <div className="flex justify-end gap-x-6 border-t border-base-700 pt-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-36" />
      </div>
    </section>
  );
};

const EconomicActivitySection = ({
  activity,
}: EconomicActivitySectionProps) => {
  const latest = activity?.latest;
  const observations = activity?.observations ?? [];
  const previous = observations.at(-2);

  const difference =
    latest && previous
      ? activityRateDifference(latest.yearOverYear, previous.yearOverYear)
      : null;

  const yearOverYearCount = observations.filter(
    (point) => point.yearOverYear !== null,
  ).length;

  // Search opens at the heading; the bordered section around it carries the highlight.
  const borderClassName = useAnchorHighlight("activity-title");

  return (
    <section
      className={`stack-6 border bg-surface-950 p-4 motion-safe:transition-colors sm:p-5 ${borderClassName}`}
      aria-labelledby="activity-title"
    >
      <div className="stack-2">
        <p className="font-mono text-label-caps text-text-200 uppercase">
          EMAE · INDEC
        </p>
        <h2
          id="activity-title"
          className="font-heading text-headline-md text-text-100"
        >
          Actividad económica
        </h2>
        <p className="max-w-2xl text-body-sm text-text-300">
          Evolución mensual de la actividad económica. Las comparaciones
          interanual y mensual usan series diferentes.
        </p>
      </div>

      {latest ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="stack-2 border border-base-700 bg-base-900 p-4">
              <p className="font-mono text-label-caps text-text-200 uppercase">
                Variación interanual · serie original
              </p>
              <p
                className={`font-mono text-data-display ${activityValueColor(latest.yearOverYear)}`}
              >
                {formatActivityChange(latest.yearOverYear)}
              </p>
              <p className="font-mono text-data-label text-text-400">
                Período: {formatActivityMonth(latest.date)}
                {nextRelease("emae")
                  ? ` (Próxima: ${formatReleaseDate(nextRelease("emae")!.releaseDate)})`
                  : null}
              </p>
            </div>
            <div className="stack-2 border border-base-700 bg-base-900 p-4">
              <p className="font-mono text-label-caps text-text-200 uppercase">
                Variación mensual · desestacionalizada
              </p>
              <p
                className={`font-mono text-data-display ${activityValueColor(latest.monthOverMonth)}`}
              >
                {formatActivityChange(latest.monthOverMonth)}
              </p>
              <p className="font-mono text-data-label text-text-400">
                Período: {formatActivityMonth(latest.date)}
              </p>
            </div>
          </div>

          {difference && previous ? (
            <p className="text-body-sm text-text-300">
              La variación interanual {difference}. Referencia anterior:{" "}
              {formatActivityMonth(previous.date)}.
            </p>
          ) : null}

          {yearOverYearCount > 1 ? (
            <div className="border-t border-base-700 pt-4">
              <p className="mb-5 font-mono text-label-caps text-text-200 uppercase">
                Variación interanual · últimos {observations.length} meses
              </p>
              <div className="h-56 w-full" aria-hidden="true">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  initialDimension={{ width: 320, height: 224 }}
                >
                  <LineChart
                    data={observations}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    accessibilityLayer={false}
                  >
                    <CartesianGrid
                      stroke="var(--color-base-700)"
                      strokeDasharray="2 4"
                      vertical={false}
                    />
                    <ReferenceLine y={0} stroke="var(--color-base-700)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatActivityShortMonth}
                      stroke="var(--color-text-400)"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                      tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                    />
                    <YAxis
                      tickFormatter={(value: number) => `${value}%`}
                      stroke="var(--color-text-400)"
                      tickLine={false}
                      axisLine={false}
                      width="auto"
                      tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                    />
                    <Tooltip
                      content={(props) => <ActivityTooltip {...props} />}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="yearOverYear"
                      name="Variación interanual"
                      stroke="var(--color-primary-500)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, fill: "var(--color-primary-500)" }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* `sr-only` goes on a wrapper: a table ignores its 1px height and overflow clip, so its rows would still extend the page's scroll area. */}
              <div className="sr-only">
                <table>
                  <caption>Variación interanual del EMAE por mes</caption>
                  <thead>
                    <tr>
                      <th scope="col">Mes</th>
                      <th scope="col">Variación interanual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observations.map((point) => (
                      <tr key={point.date}>
                        <th scope="row">{formatActivityMonth(point.date)}</th>
                        <td>{formatActivityChange(point.yearOverYear)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <UnavailableNotice>
          No fue posible consultar la serie de actividad económica en este
          momento.
        </UnavailableNotice>
      )}

      <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 border-t border-base-700 pt-4 font-mono text-data-label text-text-400">
        <a
          href={ACTIVITY_METHOD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
        >
          Ver metodología del EMAE ↗
        </a>
        <a
          href={ACTIVITY_CSV_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
        >
          Descargar serie publicada ↗
        </a>
      </div>
    </section>
  );
};

export { ActivityLoading, EconomicActivitySection };
