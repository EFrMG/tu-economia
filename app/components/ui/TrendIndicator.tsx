import { MdArrowDownward, MdArrowUpward, MdRemove } from "react-icons/md";

import { formatChange, trendOf } from "~/lib/format";

interface TrendIndicatorProps {
  /** Variation in percent, or `null` when it could not be computed. */
  value: number | null;
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
const TrendIndicator = ({ value, className = "" }: TrendIndicatorProps) => {
  const trend = trendOf(value);
  const Icon = trendIcons[trend];

  return (
    <span
      className={`flex items-center gap-0.5 font-mono text-data-label ${trendStyles[trend]} ${className}`}
    >
      <Icon className="text-xs" aria-hidden="true" />
      {value === null ? "s/d" : formatChange(value)}
    </span>
  );
};

export { TrendIndicator };
