import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import {
  anchorTargeted,
  highlightBorderClassName,
  highlightSchedule,
  type HighlightKind,
  type HighlightPhase,
} from "~/lib/anchor-highlight";

/**
 * Border classes for an element that links or search results point at with `#anchor`: bold on arrival, fading to the cards' hover border, and the standard hairline otherwise.
 * The router's hash is read instead of CSS `:target`, which client-side navigation does not update. A new navigation to the same anchor restarts the highlight.
 * The phase starts `idle` and arrives in an effect, so the server render, which has no hash, matches hydration.
 */
export function useAnchorHighlight(
  anchor: string | undefined,
  kind: HighlightKind = "search",
) {
  const location = useLocation();
  const targeted = anchorTargeted(location.hash, anchor);
  const [phase, setPhase] = useState<HighlightPhase>("idle");

  useEffect(() => {
    if (!targeted) {
      setPhase("idle");

      return;
    }

    setPhase("arrival");

    const timers = highlightSchedule(kind).map(({ phase, at }) =>
      window.setTimeout(() => setPhase(phase), at),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [targeted, kind, location.key]);

  return highlightBorderClassName(targeted ? phase : "idle");
}
