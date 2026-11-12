/**
 * How long the bold border holds before it fades to the baseline.
 * A call to act ("Crear cuenta", "Activar suscripción") holds longer than a search destination, which only needs to be found.
 */
export const HIGHLIGHT_HOLD_MS = { invitation: 5000, search: 2000 } as const;

export type HighlightKind = keyof typeof HIGHLIGHT_HOLD_MS;

/** The fade from bold to the baseline; matches `duration-1000` in the fading classes. */
export const HIGHLIGHT_FADE_MS = 1000;

/**
 * `arrival` holds the bold border, `fading` transitions it down to the baseline, and `settled` keeps the baseline with the element's own transition.
 * `idle` is any element the URL does not point at.
 */
export type HighlightPhase = "idle" | "arrival" | "fading" | "settled";

/** Whether the URL hash, as `useLocation` reports it, names this element id; an element without an id is never targeted. */
export function anchorTargeted(
  hash: string,
  anchor: string | undefined,
): boolean {
  if (!anchor || !hash.startsWith("#")) return false;

  try {
    return decodeURIComponent(hash.slice(1)) === anchor;
  } catch {
    return false;
  }
}

/** The phases that follow `arrival`, with their delay from arrival. */
export function highlightSchedule(
  kind: HighlightKind,
): readonly { phase: HighlightPhase; at: number }[] {
  const hold = HIGHLIGHT_HOLD_MS[kind];

  return [
    { phase: "fading", at: hold },
    { phase: "settled", at: hold + HIGHLIGHT_FADE_MS },
  ];
}

/**
 * Border colour classes for each phase; the element supplies `border` and `motion-safe:transition-colors`.
 * The bold border is `!important` so the hover and `focus-within` baselines of the cards, which match the settled state, do not dim it while it holds.
 * The fade runs only without `prefers-reduced-motion`; otherwise the border steps straight to the baseline.
 * The baseline is the cards' hover border, so a settled destination reads as the hovered card.
 */
export function highlightBorderClassName(phase: HighlightPhase): string {
  switch (phase) {
    case "arrival":
      return "border-primary-500!";
    case "fading":
      return "border-primary-500/50 motion-safe:duration-1000 motion-reduce:transition-none";
    case "settled":
      return "border-primary-500/50";
    case "idle":
      return "border-base-700";
  }
}
