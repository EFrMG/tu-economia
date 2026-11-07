import { describe, expect, it } from "vitest";

import {
  formatIndicatorCardText,
  formatIndicatorValue,
  INDICATOR_DEFINITIONS,
} from "./indicators";

describe("indicator units", () => {
  it("formats reported values in their own units", () => {
    expect(formatIndicatorValue(1.7, "percent")).toBe("1,7%");
    expect(formatIndicatorValue(1650.25, "ars")).toBe("$ 1.650,25");
    expect(formatIndicatorValue(640, "basis-points")).toBe("640 pb");
  });

  it("copies a card with its value, period, and source", () => {
    expect(
      formatIndicatorCardText(INDICATOR_DEFINITIONS[3], {
        date: "2026-09-30",
        value: 1650.25,
      }),
    ).toBe(
      "Valor UVA\nValor: $ 1.650,25\nPeríodo: 30/09/2026\nFuente: BCRA vía ArgentinaDatos",
    );
  });
});
