import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStatus,
} from "@floating-ui/react";
import { useState } from "react";

import { ACRONYMS, type AcronymTerm } from "~/lib/acronyms";

const FADE_MS = 120;

interface AcronymProps {
  term: AcronymTerm;
}

/**
 * An acronym with a dotted underline whose full name shows in a tooltip on hover, keyboard focus and tap.
 * The tooltip renders in a portal, so the scrolling table frames do not clip it, and it describes the acronym to screen readers while open.
 * The fade is a CSS transition keyed on the transition status, so `motion-reduce` turns it off without any script.
 */
export const Acronym = ({ term }: AcronymProps) => {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });

  // A tap focuses the term and opens it; `ignoreMouse` leaves the mouse to hover, so a click after hovering does not close it.
  const hover = useHover(context, { move: false, delay: { open: 150 } });
  const focus = useFocus(context);
  const click = useClick(context, { ignoreMouse: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    click,
    dismiss,
    role,
  ]);

  // Keeps the tooltip mounted through the fade out; `FADE_MS` matches `duration-120` below.
  const { isMounted, status } = useTransitionStatus(context, {
    duration: FADE_MS,
  });

  return (
    <>
      <abbr
        ref={refs.setReference}
        tabIndex={0}
        className="cursor-help underline decoration-text-400 decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary-500/50"
        {...getReferenceProps()}
      >
        {term}
      </abbr>
      {isMounted ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50"
            {...getFloatingProps()}
          >
            <div
              data-status={status}
              className="max-w-64 border border-base-700 bg-overlay-950 px-3 py-2 font-sans text-body-sm text-text-200 normal-case transition-opacity duration-120 ease-out data-[status=close]:opacity-0 data-[status=initial]:opacity-0 motion-reduce:transition-none"
            >
              {ACRONYMS[term]}
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
};
