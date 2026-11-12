import { describe, expect, it } from "vitest";

import {
  formatIndicatorCardText,
  formatIndicatorValue,
  INDICATOR_DEFINITIONS,
  INDICATOR_GROUPS,
} from "./indicators";

describe("indicator definitions", () => {
  it("gives every BCRA variable and every id to one card only", () => {
    const ids = INDICATOR_DEFINITIONS.map(({ id }) => id);

    const variables = INDICATOR_DEFINITIONS.flatMap(({ bcraVariable }) =>
      bcraVariable === null ? [] : [bcraVariable],
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(variables).size).toBe(variables.length);
  });

  it("uses the nominal annual BADLAR and TAMAR series, not the effective ones", () => {
    const variable = (id: string) =>
      INDICATOR_DEFINITIONS.find((definition) => definition.id === id)
        ?.bcraVariable;

    expect(variable("badlar")).toBe(7);
    expect(variable("tamar")).toBe(44);
  });

  it("places every card in a listed group", () => {
    const groups = new Set(INDICATOR_GROUPS.map(({ id }) => id));

    for (const definition of INDICATOR_DEFINITIONS)
      expect(groups.has(definition.group)).toBe(true);
  });
});

describe("indicator units", () => {
  it("formats reported values in their own units", () => {
    expect(formatIndicatorValue(1.7, "percent")).toBe("1,7%");
    expect(formatIndicatorValue(1650.25, "ars")).toBe("$ 1.650,25");
    expect(formatIndicatorValue(640, "basis-points")).toBe("640 pb");
    expect(formatIndicatorValue(50437, "usd-millions")).toBe("US$ 50.437 M");
    expect(formatIndicatorValue(46845363, "ars-millions")).toBe(
      "$ 46.845.363 M",
    );
    expect(formatIndicatorValue(869.10883943433, "index")).toBe("869,1088");
    expect(formatIndicatorValue(37.44, "index")).toBe("37,44");
  });

  it("copies a card with its value, period, and source", () => {
    const uva = INDICATOR_DEFINITIONS.find(({ id }) => id === "uva")!;

    expect(
      formatIndicatorCardText(uva, {
        date: "2026-09-30",
        value: 1650.25,
      }),
    ).toBe("Valor UVA\nValor: $ 1.650,25\nPeríodo: 30/09/2026\nFuente: BCRA");
  });
});
