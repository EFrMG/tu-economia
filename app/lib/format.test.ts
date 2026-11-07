import { describe, expect, it } from "vitest";

import {
  formatAmount,
  formatChange,
  formatGap,
  formatSignedChange,
  trendOf,
} from "~/lib/format";

describe("financial formatting", () => {
  it("formats amounts and variations for Argentina", () => {
    expect(formatAmount(1250)).toBe("1.250,00");
    expect(formatChange(-1.25)).toBe("1,25%");
    expect(formatSignedChange(1.25)).toBe("+1,25%");
    expect(formatSignedChange(-1.25)).toBe("-1,25%");
    expect(formatGap(36.25)).toBe("36,3%");
  });

  it("maps unavailable, positive, negative, and flat changes to trends", () => {
    expect(trendOf(null)).toBe("flat");
    expect(trendOf(0)).toBe("flat");
    expect(trendOf(0.01)).toBe("up");
    expect(trendOf(-0.01)).toBe("down");
  });
});
