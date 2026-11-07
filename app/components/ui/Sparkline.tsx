interface SparklineProps {
  /** Values oldest first. Fewer than two points renders nothing. */
  points: number[];
  className?: string;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 40;

/**
 * Unfilled trend line, per the design system: thin stroke, no area gradient. Inherits its color from `currentColor`.
 * Uses a Catmull-Rom spline for smooth curves matching the ChartSkeleton aesthetic.
 */
const Sparkline = ({ points, className = "" }: SparklineProps) => {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const coords = points.map((value, index) => ({
    x: (index / (points.length - 1)) * VIEWBOX_WIDTH,
    y: VIEWBOX_HEIGHT - ((value - min) / span) * VIEWBOX_HEIGHT,
  }));

  // Catmull-Rom spline for smooth curves
  const getControlPoints = (points: { x: number; y: number }[]) => {
    const n = points.length;
    if (n < 3) return points;

    const result: { x: number; y: number }[] = [points[0]];

    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(n - 1, i + 2)];

      const tension = 0.5;

      // First control point
      const cp1x = p1.x + ((p2.x - p0.x) * tension) / 6;
      const cp1y = p1.y + ((p2.y - p0.y) * tension) / 6;

      // Second control point
      const cp2x = p2.x - ((p3.x - p1.x) * tension) / 6;
      const cp2y = p2.y - ((p3.y - p1.y) * tension) / 6;

      result.push({ x: cp1x, y: cp1y });
      result.push({ x: cp2x, y: cp2y });
      result.push(p2);
    }

    return result;
  };

  const curvePoints = getControlPoints(coords);

  const path = curvePoints
    .map((point, index) => {
      if (index === 0) {
        return `M${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      }
      if (index % 3 === 1) {
        // First control point - part of cubic bezier
        return `C${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      }
      if (index % 3 === 2) {
        // Second control point
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      }
      // End point
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");

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
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export { Sparkline };
