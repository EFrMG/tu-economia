interface ChartSkeletonProps {
  className?: string;
  lines?: 1 | 2;
}

/** Keeps the chart's plotting area, axes, and line shapes in place while data loads. */
export const ChartSkeleton = ({
  className = "h-64",
  lines = 1,
}: ChartSkeletonProps) => (
  <svg
    className={`block w-full motion-safe:animate-pulse ${className}`}
    viewBox="0 0 800 256"
    preserveAspectRatio="none"
    role="presentation"
    aria-hidden="true"
  >
    <g stroke="var(--color-base-700)" strokeDasharray="2 4">
      {[32, 80, 128, 176, 224].map((y) => (
        <line key={y} x1="64" y1={y} x2="792" y2={y} />
      ))}
    </g>
    <g fill="var(--color-surface-900)">
      {[40, 88, 136, 184].map((y) => (
        <rect key={y} x="0" y={y} width="48" height="9" />
      ))}
      {[80, 240, 400, 560, 720].map((x) => (
        <rect key={x} x={x} y="240" width="40" height="9" />
      ))}
    </g>
    <path
      d="M64 183 C120 175 150 164 198 170 S285 136 335 144 S425 120 480 132 S580 91 635 101 S735 69 792 80"
      fill="none"
      stroke="var(--color-primary-500)"
      strokeWidth="3"
      opacity="0.45"
    />
    {lines === 2 ? (
      <path
        d="M64 210 C125 204 162 190 210 195 S300 177 352 180 S450 156 505 165 S610 136 660 142 S748 121 792 125"
        fill="none"
        stroke="var(--color-text-400)"
        strokeWidth="3"
        opacity="0.6"
      />
    ) : null}
  </svg>
);
