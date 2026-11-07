import { describe, expect, it } from "vitest";

import {
  adjacentMonth,
  financeHref,
  isFinanceTab,
  resolveFinanceTab,
} from "~/lib/finance-tabs";

describe("Mi economía tabs", () => {
  it("accepts only declared tabs", () => {
    expect(isFinanceTab("planificacion")).toBe(true);
    expect(isFinanceTab("login")).toBe(false);
    expect(isFinanceTab(null)).toBe(false);
  });

  it("keeps an explicit tab and defaults by visitor state", () => {
    expect(resolveFinanceTab("precios", true)).toBe("precios");
    expect(resolveFinanceTab("usuario", false)).toBe("usuario");
    expect(resolveFinanceTab(null, true)).toBe("usuario");
    expect(resolveFinanceTab(null, false)).toBe("presupuesto");
    expect(resolveFinanceTab("desconocida", false)).toBe("presupuesto");
  });

  it("builds links that keep the tab and month together", () => {
    expect(financeHref("presupuesto", "2026-10")).toBe(
      "/mi-economia?tab=presupuesto&month=2026-10",
    );

    expect(financeHref("usuario")).toBe("/mi-economia?tab=usuario");
  });

  it("steps across year boundaries", () => {
    expect(adjacentMonth("2026-01", -1)).toBe("2025-12");
    expect(adjacentMonth("2026-12", 1)).toBe("2027-01");
  });
});
