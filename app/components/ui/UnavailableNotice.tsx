import type { ReactNode } from "react";

interface UnavailableNoticeProps {
  children: ReactNode;
  className?: string;
}

/** The same restrained notice treatment as the marketing footer, in the degraded-data amber. */
const UnavailableNotice = ({
  children,
  className = "",
}: UnavailableNoticeProps) => (
  <p
    className={`mx-auto max-w-md border border-tertiary-500/20 bg-tertiary-500/5 p-4 font-mono text-label-caps text-tertiary-text-400 uppercase ${className}`}
    role="status"
  >
    {children}
  </p>
);

/**
 * The same tone without the panel, for a notice that inherits a slot with its own height: a helper line,
 * a card footer, a status cell. It is a `span` so it stays valid inside a paragraph and can size as a flex item.
 */
const UnavailableStatus = ({
  children,
  className = "",
}: UnavailableNoticeProps) => (
  <span
    className={`font-mono text-label-caps text-tertiary-text-400 uppercase ${className}`}
    role="status"
  >
    {children}
  </span>
);

export { UnavailableNotice, UnavailableStatus };
