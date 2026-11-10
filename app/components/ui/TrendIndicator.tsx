import { MdArrowDownward, MdArrowUpward, MdRemove } from "react-icons/md";

import { formatChange, formatSignedChange, trendOf } from "~/lib/format";

interface TrendIndicatorProps {
  /** Variation in percent, or `null` when it could not be computed. */
  value: number | null;
  /** Prefix a `+` or `-` so the direction does not rest on the arrow and colour alone; for tables where values are compared or added up. */
  signed?: boolean;
  className?: string;
}

const trendStyles = {
  up: "text-secondary-text-100",
  down: "text-red-text-400",
  flat: "text-text-200",
} as const;

const trendIcons = {
  up: MdArrowUpward,
  down: MdArrowDownward,
  flat: MdRemove,
} as const;

/** Arrow plus magnitude, as used in the footer row of every data card. */
const TrendIndicator = ({
  value,
  signed = false,
  className = "",
}: TrendIndicatorProps) => {
  const trend = trendOf(value);
  const Icon = trendIcons[trend];

  const label =
    value === null
      ? "s/d"
      : signed && trend !== "flat"
        ? formatSignedChange(value)
        : formatChange(value);

  return (
    <span
      className={`flex items-center gap-0.5 font-mono text-data-label ${trendStyles[trend]} ${className}`}
    >
      <Icon className="text-xs" aria-hidden="true" />
      {label}
    </span>
  );
};

export { TrendIndicator };
