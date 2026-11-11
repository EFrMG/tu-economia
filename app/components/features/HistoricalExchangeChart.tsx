import { useEffect, type ReactNode } from "react";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { Link, useSearchParams } from "react-router";

import {
  CHART_PERIODS,
  chartPeriodFromSearchParam,
  gapPeriodChange,
  historicalGap,
  historyForCalendarDays,
  type HistoricalChartPoint,
  type HistoricalChartView,
} from "~/lib/exchange-rate-history";
import { formatAmount } from "~/lib/format";
import {
  UnavailableNotice,
  UnavailableStatus,
} from "~/components/ui/UnavailableNotice";
import { Skeleton } from "~/components/ui/Skeleton";
import { ChartSkeleton } from "~/components/ui/ChartSkeleton";

interface HistoricalExchangeChartProps {
  points: HistoricalChartPoint[];
  asOf: string;
  failedSeries: ("blue" | "oficial")[];
  view: HistoricalChartView;
  loading?: boolean;
}

const dateLabel = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

const fullDateLabel = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const formatDate = (value: string) =>
  dateLabel.format(new Date(`${value}T00:00:00.000Z`));

const formatTooltipValue = (value: unknown) =>
  value == null ? "s/d" : `$${formatAmount(Number(value))}`;

const formatPercent = (value: number) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)}%`;

const formatPoints = (value: number) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(value)} pp`;

const ChartTooltip = ({ active, label, payload }: TooltipContentProps) => {
  if (!active || !label || !payload?.length) return null;

  const values = new Map(payload.map((entry) => [entry.dataKey, entry.value]));
  return (
    <div
      className="border border-base-700 bg-surface-900 px-3 py-2"
      role="tooltip"
      aria-live="polite"
    >
      <p className="mb-2 font-mono text-data-label text-text-200">
        {fullDateLabel.format(new Date(`${label}T00:00:00.000Z`))}
      </p>
      <p className="font-mono text-data-label text-primary-text-100">
        Blue: {formatTooltipValue(values.get("blue"))}
      </p>
      <p className="font-mono text-data-label text-text-200">
        Oficial: {formatTooltipValue(values.get("oficial"))}
      </p>
    </div>
  );
};

const GapTooltip = ({ active, label, payload }: TooltipContentProps) => {
  if (!active || !label) return null;

  const value = payload?.find((entry) => entry.dataKey === "gap")?.value;
  return (
    <div
      className="border border-base-700 bg-surface-900 px-3 py-2"
      role="tooltip"
      aria-live="polite"
    >
      <p className="mb-2 font-mono text-data-label text-text-200">
        {fullDateLabel.format(new Date(`${label}T00:00:00.000Z`))}
      </p>
      <p className="font-mono text-data-label text-primary-text-100">
        Brecha Blue: {typeof value === "number" ? formatPercent(value) : "s/d"}
      </p>
    </div>
  );
};

interface SeriesLegendProps {
  /** A series with no closes in the period keeps its label, muted, so the row states what the plot contains. */
  blue: boolean;
  oficial: boolean;
}

const SeriesLegend = ({ blue, oficial }: SeriesLegendProps) => (
  <div
    className="mb-3 flex flex-wrap gap-x-4 gap-y-2"
    role="group"
    aria-label="Series del gráfico"
  >
    <span
      className={`font-mono text-data-label ${blue ? "text-primary-text-100" : "text-text-400"}`}
    >
      Blue
    </span>
    <span
      className={`font-mono text-data-label ${oficial ? "text-text-200" : "text-text-400"}`}
    >
      Oficial
    </span>
  </div>
);

type GapSummary = ReturnType<typeof gapPeriodChange>;

interface GapSummaryBlockProps {
  /** `null` while loading or when the period has no comparable closes. */
  summary: GapSummary;
  loading?: boolean;
}

/**
 * The two metrics above the gap chart. The block renders the same three lines in every state so the section below it never moves: values, skeletons, or reserved "s/d" lines.
 */
const GapSummaryBlock = ({
  summary,
  loading = false,
}: GapSummaryBlockProps) => (
  <div className="mb-4 grid gap-4 border-b border-base-700 pb-4 sm:grid-cols-2">
    <div>
      <p className="font-mono text-label-caps text-text-200 uppercase">
        Última brecha del período
      </p>
      {loading ? (
        <>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-20" />
        </>
      ) : (
        <>
          <p
            className={`font-mono text-data-display ${summary && summary.last.gap < 0 ? "text-red-text-400" : "text-text-100"}`}
          >
            {summary ? formatPercent(summary.last.gap) : "s/d"}
          </p>
          <p className="min-h-[0.75rem] font-mono text-data-label text-text-400">
            {summary ? formatDate(summary.last.fecha) : ""}
          </p>
        </>
      )}
    </div>
    <div>
      <p className="font-mono text-label-caps text-text-200 uppercase">
        Cambio entre cierres disponibles
      </p>
      {loading ? (
        <>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-20" />
        </>
      ) : (
        <>
          <p
            className={`font-mono text-data-display ${summary?.change != null && summary.change < 0 ? "text-red-text-400" : "text-text-100"}`}
          >
            {summary?.change === null || summary?.change === undefined
              ? "s/d"
              : formatPoints(summary.change)}
          </p>
          <p className="min-h-[0.75rem] font-mono text-data-label text-text-400">
            {summary
              ? `${formatDate(summary.first.fecha)} a ${formatDate(summary.last.fecha)}`
              : ""}
          </p>
        </>
      )}
    </div>
  </div>
);

/** Stands in for the plotting area when there is nothing to draw, so the card keeps its height. */
const PlotUnavailable = ({ children }: { children: ReactNode }) => (
  <div className="flex h-64 w-full items-center justify-center px-4">
    {children}
  </div>
);

interface PlotFallbackProps {
  /** Set when a series could not be queried at all; it replaces the message about the missing data. */
  notice: string | null;
  message: string;
}

/** The one shape a missing plot takes in both views. */
const PlotFallback = ({ notice, message }: PlotFallbackProps) => (
  <PlotUnavailable>
    {notice ? (
      <UnavailableNotice>{notice}</UnavailableNotice>
    ) : (
      <p className="max-w-prose text-center text-body-sm text-text-200">
        {message}
      </p>
    )}
  </PlotUnavailable>
);

const HistoricalExchangeChart = ({
  points,
  asOf,
  failedSeries,
  view,
  loading = false,
}: HistoricalExchangeChartProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = chartPeriodFromSearchParam(searchParams.get("period"));

  useEffect(() => {
    const raw = searchParams.get("period");
    if (
      raw !== null &&
      !CHART_PERIODS.includes(Number(raw) as (typeof CHART_PERIODS)[number])
    ) {
      const next = new URLSearchParams(searchParams);
      next.set("period", "30");
      setSearchParams(next, { replace: true, preventScrollReset: true });
    }
  }, [searchParams, setSearchParams]);
  const periodPoints = historyForCalendarDays(points, period, asOf);
  const gapPoints = historicalGap(periodPoints);
  const gapSummary = gapPeriodChange(gapPoints);
  const blueCount = periodPoints.filter((point) => point.blue !== null).length;

  const oficialCount = periodPoints.filter(
    (point) => point.oficial !== null,
  ).length;

  const hasBlue = blueCount > 0;
  const hasOficial = oficialCount > 0;

  /**
   * One decision for the plotting area, shared by both views: draw it, or explain why it is missing.
   * `no-gap` is the gap view's own case — points exist but no date has both series.
   */
  const plotState =
    view === "gap"
      ? gapSummary !== null
        ? "ready"
        : periodPoints.length > 0
          ? "no-gap"
          : "empty"
      : periodPoints.length > 0
        ? "ready"
        : "empty";

  const failedSeriesNotice =
    failedSeries.length === 2
      ? "No fue posible consultar los cierres históricos de Blue y Oficial."
      : `No fue posible consultar los cierres históricos de ${failedSeries[0] === "blue" ? "Blue" : "Oficial"}.`;

  const plotFailureNotice = failedSeries.length > 0 ? failedSeriesNotice : null;

  const plotMessage =
    plotState === "no-gap"
      ? "No hay cierres Blue y Oficial para una misma fecha en este período."
      : "La fuente no informó cierres históricos para este período.";

  const quotesNote =
    !hasBlue && !failedSeries.includes("blue")
      ? "No hay cierres Blue disponibles para este período."
      : !hasOficial && !failedSeries.includes("oficial")
        ? "No hay cierres Oficial disponibles para este período."
        : null;

  const selectPeriod = (nextPeriod: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("period", String(nextPeriod));
    setSearchParams(next, { preventScrollReset: true });
  };

  return (
    <section
      className="border border-base-700 bg-surface-950 p-4 sm:p-5"
      aria-labelledby="historical-chart-title"
    >
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2
            id="historical-chart-title"
            className="font-heading text-headline-md text-text-100"
          >
            {view === "gap" ? "Brecha histórica" : "Evolución histórica"}
          </h2>
          <p className="mt-1 text-body-sm text-text-200">
            {view === "gap"
              ? "Brecha entre cierres de venta Blue y Oficial."
              : "Precio de venta en pesos argentinos."}
          </p>
          {/* From `sm` up this status line is reserved in every state and sits beside the selector, so a partial failure explains itself without pushing the plot down. Stacked on mobile, an empty reserved line would only add space above the selector, so it collapses until there is a notice. */}
          <p className="mt-1 min-h-[1.5em] text-body-sm max-sm:empty:hidden">
            {plotState === "ready" && plotFailureNotice ? (
              <UnavailableStatus>{plotFailureNotice}</UnavailableStatus>
            ) : null}
          </p>
        </div>
        {/* The selector stays in place once the source failed: there is no other period to try. */}
        <div
          className="flex w-fit self-center border border-base-700 sm:self-auto"
          role="group"
          aria-label="Período del gráfico"
        >
          {CHART_PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              disabled={loading || failedSeries.length === 2}
              onClick={() => selectPeriod(option)}
              aria-pressed={period === option}
              className={`btn-click-soft px-3 py-2 font-mono text-data-label transition-colors disabled:cursor-not-allowed ${period === option ? "bg-primary-500 text-base-950" : "text-text-200 focus-visible:outline-none disabled:opacity-50 hocus:bg-surface-900/80 hocus:text-text-100"}`}
            >
              {option} días
            </button>
          ))}
        </div>
      </div>

      {view === "gap" ? (
        <>
          <GapSummaryBlock summary={gapSummary} loading={loading} />
          {loading ? (
            <ChartSkeleton lines={1} />
          ) : plotState === "ready" ? (
            <div className="h-64 w-full">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 320, height: 256 }}
              >
                <LineChart
                  data={gapPoints}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid
                    stroke="var(--color-base-700)"
                    strokeDasharray="2 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={formatDate}
                    stroke="var(--color-text-400)"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickFormatter={formatPercent}
                    stroke="var(--color-text-400)"
                    tickLine={false}
                    axisLine={false}
                    width="auto"
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                  />
                  <Tooltip
                    content={(props) => <GapTooltip {...props} />}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="gap"
                    name="Brecha Blue"
                    stroke="var(--color-primary-500)"
                    strokeWidth={2}
                    dot={
                      gapPoints.filter((point) => point.gap !== null).length ===
                      1
                    }
                    activeDot={{ r: 3, fill: "var(--color-primary-500)" }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <PlotFallback notice={plotFailureNotice} message={plotMessage} />
          )}
          {plotState === "ready" ? (
            // `sr-only` goes on a wrapper: a table ignores its 1px height and overflow clip, so its rows would still extend the page's scroll area.
            <div className="sr-only">
              <table>
                <caption>Brecha Blue por fecha</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Brecha</th>
                  </tr>
                </thead>
                <tbody>
                  {gapPoints.map((point) => (
                    <tr key={point.fecha}>
                      <th scope="row">{point.fecha}</th>
                      <td>
                        {point.gap === null ? "s/d" : formatPercent(point.gap)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <SeriesLegend
            blue={loading || hasBlue}
            oficial={loading || hasOficial}
          />
          {loading ? (
            <ChartSkeleton lines={2} />
          ) : plotState === "ready" ? (
            <div className="h-64 w-full">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 320, height: 256 }}
              >
                <LineChart
                  data={periodPoints}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid
                    stroke="var(--color-base-700)"
                    strokeDasharray="2 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={formatDate}
                    stroke="var(--color-text-400)"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickFormatter={(value: number) => `$${formatAmount(value)}`}
                    stroke="var(--color-text-400)"
                    tickLine={false}
                    axisLine={false}
                    width="auto"
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                  />
                  <Tooltip
                    content={(props) => <ChartTooltip {...props} />}
                    cursor={{ stroke: "var(--color-base-700)", strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="blue"
                    name="Blue"
                    stroke="var(--color-primary-500)"
                    strokeWidth={2}
                    dot={blueCount === 1}
                    activeDot={{ r: 3, fill: "var(--color-primary-500)" }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="oficial"
                    name="Oficial"
                    stroke="var(--color-text-200)"
                    strokeWidth={2}
                    dot={oficialCount === 1}
                    activeDot={{ r: 3, fill: "var(--color-text-200)" }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <PlotFallback notice={plotFailureNotice} message={plotMessage} />
          )}
          {plotState === "ready" && quotesNote ? (
            <p className="mt-3 ml-auto text-right text-body-sm text-text-400">
              {quotesNote}
            </p>
          ) : null}
        </>
      )}

      <div className="mt-5 flex justify-end border-t border-base-700 pt-4">
        <Link
          to={`${view === "gap" ? "/dashboard" : "/analisis"}?period=${period}`}
          className="block w-fit font-mono text-data-label text-primary-text-100 focus-visible:outline-none hocus:underline"
        >
          {view === "gap"
            ? "Ver cotizaciones históricas ↗"
            : "Ver análisis de la brecha ↗"}
        </Link>
      </div>
    </section>
  );
};

export { HistoricalExchangeChart };
