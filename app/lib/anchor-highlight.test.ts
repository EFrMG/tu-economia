import { describe, expect, it } from "vitest";

import {
  anchorTargeted,
  HIGHLIGHT_FADE_MS,
  HIGHLIGHT_HOLD_MS,
  highlightBorderClassName,
  highlightSchedule,
} from "./anchor-highlight";

describe("anchor highlight", () => {
  it("matches the decoded hash against the element id", () => {
    expect(anchorTargeted("#canasta-basica", "canasta-basica")).toBe(true);
    expect(anchorTargeted("#inflaci%C3%B3n", "inflación")).toBe(true);
    expect(anchorTargeted("#salarios", "canasta-basica")).toBe(false);
    expect(anchorTargeted("", "canasta-basica")).toBe(false);
    expect(anchorTargeted("#", undefined)).toBe(false);
    expect(anchorTargeted("#%E0%A4%A", "canasta-basica")).toBe(false);
  });

  it("holds an invitation longer than a search destination, then fades", () => {
    expect(HIGHLIGHT_HOLD_MS.invitation).toBeGreaterThan(
      HIGHLIGHT_HOLD_MS.search,
    );

    expect(highlightSchedule("search")).toEqual([
      { phase: "fading", at: HIGHLIGHT_HOLD_MS.search },
      { phase: "settled", at: HIGHLIGHT_HOLD_MS.search + HIGHLIGHT_FADE_MS },
    ]);

    expect(highlightSchedule("invitation")[0]).toEqual({
      phase: "fading",
      at: HIGHLIGHT_HOLD_MS.invitation,
    });
  });

  it("settles every kind on the cards' hover border", () => {
    expect(highlightBorderClassName("arrival")).toBe("border-primary-500!");
    expect(highlightBorderClassName("fading")).toMatch(
      /^border-primary-500\/50 /,
    );
    expect(highlightBorderClassName("fading")).toContain(
      "motion-reduce:transition-none",
    );
    expect(highlightBorderClassName("settled")).toBe("border-primary-500/50");
    expect(highlightBorderClassName("idle")).toBe("border-base-700");
  });
});
