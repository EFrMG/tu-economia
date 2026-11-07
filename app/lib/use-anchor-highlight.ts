import { useEffect, useState } from "react";
import { useLocation } from "react-router";

/** How long the full highlight holds before it settles to half strength. */
const HIGHLIGHT_MS = 5000;

/**
 * Border classes for a card that links point at with `#anchor`: full primary on arrival, half strength after a few seconds, and the standard hairline otherwise.
 * The router's hash is read instead of CSS `:target`, which client-side navigation does not update. A new navigation to the same anchor restarts the highlight.
 */
export function useAnchorHighlight(anchor: string) {
  const location = useLocation();
  const targeted = location.hash === `#${anchor}`;
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);

    if (!targeted) return;

    const timer = window.setTimeout(() => setSettled(true), HIGHLIGHT_MS);

    return () => window.clearTimeout(timer);
  }, [targeted, location.key]);

  if (!targeted) return "border-base-700";

  return settled ? "border-primary-500/50" : "border-primary-500";
}
