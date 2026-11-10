import { describe, expect, it } from "vitest";

import {
  CEDEAR_ROW_LIMIT,
  accionesHref,
  accionesLabel,
  availableEquityPanels,
  defaultEquityPanel,
  isEquitiesBymaEnabled,
  isEquityPanel,
  panelNeedsRetry,
  resolveEquityPanel,
  unavailablePanel,
  visibleCedearRows,
} from "~/lib/acciones-panels";
import {
  buildCedearRows,
  type CedearPanelData,
  type EquityFreshness,
  type EquityPanel,
  type SecurityRecord,
} from "~/lib/equities";

const freshness = (status: EquityFreshness["status"]): EquityFreshness => ({
  status,
  fetchedAt: "2026-10-16T16:45:00.000Z",
  fetchedAtLabel: "16/10/2026, 13:45",
});

const pesos = (symbol: string, amount: number): SecurityRecord => ({
  symbol,
  denominationCcy: "ARS",
  trade: amount ? 1000 : 0,
  previousClosingPrice: 990,
  volumeAmount: amount,
});

describe("Acciones panels", () => {
  it("reads the BYMA flag as on only for the literal string true", () => {
    expect(isEquitiesBymaEnabled({ EQUITIES_BYMA_ENABLED: "true" })).toBe(true);
    expect(isEquitiesBymaEnabled({ EQUITIES_BYMA_ENABLED: "false" })).toBe(
      false,
    );
    expect(isEquitiesBymaEnabled({ EQUITIES_BYMA_ENABLED: "TRUE" })).toBe(
      false,
    );
    expect(isEquitiesBymaEnabled({})).toBe(false);
    expect(isEquitiesBymaEnabled(undefined)).toBe(false);
  });

  it("offers only the SEC panel and the calculator while BYMA is off", () => {
    expect(availableEquityPanels(false).map((panel) => panel.id)).toEqual([
      "empresas",
      "calculadora",
    ]);

    expect(isEquityPanel("empresas", false)).toBe(true);
    expect(isEquityPanel("calculadora", false)).toBe(true);
    expect(isEquityPanel("acciones", false)).toBe(false);
  });

  it("offers every panel while BYMA is on, the quotations in one panel", () => {
    expect(availableEquityPanels(true).map((panel) => panel.id)).toEqual([
      "acciones",
      "empresas",
      "calculadora",
    ]);

    expect(isEquityPanel("acciones", true)).toBe(true);
    expect(isEquityPanel("calculadora", true)).toBe(true);
    expect(isEquityPanel("empresas", true)).toBe(true);
    expect(isEquityPanel("merval", true)).toBe(false);
    expect(isEquityPanel(null, true)).toBe(false);

    // The former CEDEAR and leaders panels are unknown ids now and redirect.
    expect(isEquityPanel("cedears", true)).toBe(false);
    expect(isEquityPanel("lideres", true)).toBe(false);
  });

  it("defaults to Empresas while BYMA is off, including for the BYMA panel", () => {
    expect(defaultEquityPanel(false)).toBe("empresas");
    expect(resolveEquityPanel(null, false)).toBe("empresas");
    expect(resolveEquityPanel("acciones", false)).toBe("empresas");
    expect(resolveEquityPanel("cedears", false)).toBe("empresas");
    expect(resolveEquityPanel("x", false)).toBe("empresas");
    expect(resolveEquityPanel("calculadora", false)).toBe("calculadora");
  });

  it("defaults to the quotations while BYMA is on", () => {
    expect(defaultEquityPanel(true)).toBe("acciones");
    expect(resolveEquityPanel("lideres", true)).toBe("acciones");
    expect(resolveEquityPanel("empresas", true)).toBe("empresas");
    expect(resolveEquityPanel(null, true)).toBe("acciones");
    expect(resolveEquityPanel("", true)).toBe("acciones");
    expect(resolveEquityPanel("x", true)).toBe("acciones");
    expect(resolveEquityPanel("calculadora", true)).toBe("calculadora");
  });

  it("names the page for what it shows", () => {
    expect(accionesLabel(false)).toBe("Empresas");
    expect(accionesLabel(true)).toBe("Empresas y acciones");
  });

  it("builds links that keep the company and the dev preview flag", () => {
    expect(accionesHref("acciones")).toBe("/acciones?panel=acciones");

    expect(accionesHref("calculadora", { previewUnavailable: true })).toBe(
      "/acciones?panel=calculadora&preview=unavailable",
    );

    expect(
      accionesHref("empresas", { empresa: "YPF", previewUnavailable: true }),
    ).toBe("/acciones?panel=empresas&empresa=YPF&preview=unavailable");
  });
});

describe("visibleCedearRows", () => {
  it("keeps the most traded rows first and caps the table", () => {
    const records = Array.from({ length: CEDEAR_ROW_LIMIT + 10 }, (_, index) =>
      pesos(`T${String(index).padStart(2, "0")}`, (index + 1) * 1000),
    );

    const rows = visibleCedearRows(buildCedearRows(records, []));

    expect(rows).toHaveLength(CEDEAR_ROW_LIMIT);
    expect(rows[0].symbol).toBe(`T${CEDEAR_ROW_LIMIT + 9}`);
    expect(rows.every((row) => row.tradedAmount > 0)).toBe(true);
  });

  it("fills with untraded rows after the traded ones when few traded", () => {
    const rows = visibleCedearRows(
      buildCedearRows([pesos("ZZZ", 0), pesos("AAA", 0), pesos("MMM", 5)], []),
    );

    expect(rows.map((row) => row.symbol)).toEqual(["MMM", "AAA", "ZZZ"]);
  });
});

describe("panelNeedsRetry", () => {
  const cedears = (
    status: EquityFreshness["status"],
    missingSources: CedearPanelData["missingSources"] = [],
  ): EquityPanel<CedearPanelData> => ({
    status: "available",
    data: { rows: [], latestTradeTime: null, missingSources },
    freshness: freshness(status),
  });

  it("retries unavailable, stale and partial panels only", () => {
    expect(panelNeedsRetry(unavailablePanel())).toBe(true);
    expect(panelNeedsRetry(cedears("stale"))).toBe(true);
    expect(panelNeedsRetry(cedears("current", ["etf"]))).toBe(true);
    expect(panelNeedsRetry(cedears("current"))).toBe(false);

    expect(
      panelNeedsRetry({
        status: "available",
        data: true,
        freshness: freshness("current"),
      }),
    ).toBe(false);
  });
});
