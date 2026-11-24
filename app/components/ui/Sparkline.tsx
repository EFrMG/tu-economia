import { curveMonotoneX, line } from "d3-shape";

interface SparklineProps {
  /** Values oldest first. Fewer than two points renders nothing. */
  points: number[];
  className?: string;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 40;

/**
 * Unfilled trend line, per the design system: thin stroke, no area gradient. Inherits its color from `currentColor`.
 * Uses d3's `curveMonotoneX`, the curve behind the charts' `type="monotone"`: it passes through every point and never overshoots them.
 */
const Sparkline = ({ points, className = "" }: SparklineProps) => {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const path = line<number>()
    .x((_, index) => (index / (points.length - 1)) * VIEWBOX_WIDTH)
    .y((value) => VIEWBOX_HEIGHT - ((value - min) / span) * VIEWBOX_HEIGHT)
    .curve(curveMonotoneX)
    .digits(2)(points);

  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={path ?? undefined}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export { Sparkline };
