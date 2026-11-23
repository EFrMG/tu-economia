import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

export interface HistorySeries {
  key: string;
  label: string;
  /** A palette CSS variable for the line, such as `var(--color-primary-500)`. */
  stroke: string;
  /** The text utility for the series' label in the legend and tooltip. */
  textClassName: string;
}

export interface HistoryPoint {
  x: string;
  /** One value per series key; `null` leaves a gap. */
  values: Record<string, number | null>;
  /** Lines shown under the values in the tooltip, such as a provisional mark; a point with any is drawn with a hollow dot. */
  remarks?: readonly string[];
}

interface HistoryChartProps {
  points: HistoryPoint[];
  series: readonly HistorySeries[];
  formatValue: (value: number) => string;
  /** The value axis' labels; `formatValue` when omitted. */
  formatAxis?: (value: number) => string;
  /** The full period label, for the tooltip and the accessible table. */
  formatX: (x: string) => string;
  formatTick: (x: string) => string;
  /** Caption and first column of the screen-reader table. */
  caption: string;
  xHeader: string;
  /** `linear` for discrete observations such as survey semesters, where a curve would suggest values in between. */
  curve?: "monotone" | "linear";
  /** Starts the value axis at zero, for rates whose size matters as much as their movement. */
  fromZero?: boolean;
  className?: string;
}

type ChartRow = Record<string, string | number | null | readonly string[]> & {
  x: string;
  remarks: readonly string[];
};

const remarksOf = (payload: TooltipContentProps["payload"]) => {
  const row = payload?.[0]?.payload as ChartRow | undefined;

  return row?.remarks ?? [];
};

interface HistoryTooltipProps
  extends
    TooltipContentProps,
    Pick<HistoryChartProps, "series" | "formatValue" | "formatX"> {}

const HistoryTooltip = ({
  active,
  label,
  payload,
  series,
  formatValue,
  formatX,
}: HistoryTooltipProps) => {
  if (!active || typeof label !== "string") return null;

  const values = new Map(payload?.map((entry) => [entry.dataKey, entry.value]));

  return (
    <div className="stack-2 border border-base-700 bg-surface-900 px-3 py-2">
      <p className="font-mono text-data-label text-text-200">
        {formatX(label)}
      </p>
      <div>
        {series.map((entry) => {
          const value = values.get(entry.key);

          return (
            <p
              key={entry.key}
              className={`font-mono text-data-label ${entry.textClassName}`}
            >
              {entry.label}:{" "}
              {typeof value === "number" ? formatValue(value) : "s/d"}
            </p>
          );
        })}
      </div>
      {remarksOf(payload).map((remark) => (
        <p
          key={remark}
          className="max-w-64 text-body-sm leading-snug text-text-400"
        >
          {remark}
        </p>
      ))}
    </div>
  );
};

/** A line chart of a dated series, with its legend, a tooltip per point and the same values as a table for screen readers. */
const HistoryChart = ({
  points,
  series,
  formatValue,
  formatX,
  formatTick,
  caption,
  xHeader,
  formatAxis = formatValue,
  curve = "monotone",
  fromZero = false,
  className = "h-64",
}: HistoryChartProps) => {
  const rows: ChartRow[] = points.map((point) => ({
    ...point.values,
    x: point.x,
    remarks: point.remarks ?? [],
  }));

  return (
    <div>
      <div
        className="mb-3 flex flex-wrap gap-x-4 gap-y-2"
        role="group"
        aria-label="Series del gráfico"
      >
        {series.map((entry) => (
          <span
            key={entry.key}
            className={`font-mono text-data-label ${entry.textClassName}`}
          >
            {entry.label}
          </span>
        ))}
      </div>

      <div className={`w-full ${className}`} aria-hidden="true">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 320, height: 256 }}
        >
          <LineChart
            data={rows}
            margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
            accessibilityLayer={false}
          >
            <CartesianGrid
              stroke="var(--color-base-700)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="x"
              tickFormatter={formatTick}
              stroke="var(--color-text-400)"
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
            />
            <YAxis
              domain={fromZero ? [0, "auto"] : ["auto", "auto"]}
              tickFormatter={formatAxis}
              stroke="var(--color-text-400)"
              tickLine={false}
              axisLine={false}
              width="auto"
              tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
            />
            <Tooltip
              content={(props) => (
                <HistoryTooltip
                  {...props}
                  series={series}
                  formatValue={formatValue}
                  formatX={formatX}
                />
              )}
              cursor={{ stroke: "var(--color-base-700)", strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {series.map((entry) => (
              <Line
                key={entry.key}
                type={curve}
                dataKey={entry.key}
                name={entry.label}
                stroke={entry.stroke}
                strokeWidth={2}
                dot={({ cx, cy, payload, index }) =>
                  (payload as ChartRow).remarks.length > 0 &&
                  cx != null &&
                  cy != null ? (
                    <circle
                      key={index}
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill="var(--color-surface-950)"
                      stroke={entry.stroke}
                      strokeWidth={2}
                    />
                  ) : (
                    <g key={index} />
                  )
                }
                activeDot={{ r: 3, fill: entry.stroke }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* `sr-only` goes on a wrapper: a table ignores its 1px height and overflow clip, so its rows would still extend the page's scroll area. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{xHeader}</th>
              {series.map((entry) => (
                <th key={entry.key} scope="col">
                  {entry.label}
                </th>
              ))}
              <th scope="col">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.x}>
                <th scope="row">{formatX(point.x)}</th>
                {series.map((entry) => {
                  const value = point.values[entry.key];

                  return (
                    <td key={entry.key}>
                      {value == null ? "s/d" : formatValue(value)}
                    </td>
                  );
                })}
                <td>{point.remarks?.join(" ") ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export { HistoryChart };
