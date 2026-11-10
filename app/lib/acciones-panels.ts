import type { CedearRow, EquityPanel } from "~/lib/equities";

/**
 * `byma` is the quotations panel (index strip, CEDEARs and S&P Merval leaders together) and exists only while `EQUITIES_BYMA_ENABLED` is on; `sec` reads SEC EDGAR.
 * `dolarapi` is the CEDEAR calculator: the visitor types the security's figures, and only the CCL and MEP from Dólar API are supplied.
 * Everything a panel shows, its disclosure included, sits below the tab line, so switching panels never moves the page header.
 * The former `cedears` and `lideres` panels are unknown ids now and redirect to the default panel; their tables keep the `#cedears` and `#lideres` anchors.
 */
export const EQUITY_PANELS = [
  { id: "acciones", label: "Acciones", source: "byma" },
  { id: "empresas", label: "Empresas", source: "sec" },
  { id: "calculadora", label: "Calculadora", source: "dolarapi" },
] as const;

export type EquityPanelId = (typeof EQUITY_PANELS)[number]["id"];

export type EquityPanelSource = (typeof EQUITY_PANELS)[number]["source"];

/**
 * Whether the BYMA quotations may be shown and requested. Only the literal `"true"` turns them on, so a missing or mistyped variable keeps them off.
 * The same check runs in every loader that could reach BYMA and in the loaders that pass the state to the client.
 */
export function isEquitiesBymaEnabled(
  env: Pick<CloudflareEnvironment, "EQUITIES_BYMA_ENABLED"> | undefined,
): boolean {
  return env?.EQUITIES_BYMA_ENABLED === "true";
}

/** The section's name in the sidebar, the heading and the page title: it names stock quotations only while BYMA's are shown. The path stays `/acciones` either way. */
export const accionesLabel = (bymaEnabled: boolean) =>
  bymaEnabled ? "Empresas y acciones" : "Empresas";

/** The panels a visitor can open: the BYMA ones only while the flag is on. */
export function availableEquityPanels(bymaEnabled: boolean) {
  return EQUITY_PANELS.filter(
    (panel) => bymaEnabled || panel.source !== "byma",
  );
}

/** The quotations while BYMA is on, as the page behaved before the SEC panel existed; Empresas otherwise. */
export function defaultEquityPanel(bymaEnabled: boolean): EquityPanelId {
  return bymaEnabled ? "acciones" : "empresas";
}

export function equityPanelSource(id: EquityPanelId): EquityPanelSource {
  return EQUITY_PANELS.find((panel) => panel.id === id)!.source;
}

/** Whether `value` names a panel that can be opened in the current flag state. */
export const isEquityPanel = (
  value: string | null,
  bymaEnabled: boolean,
): value is EquityPanelId =>
  availableEquityPanels(bymaEnabled).some((panel) => panel.id === value);

/** A missing, unknown or switched-off `?panel=` resolves to the default panel. */
export const resolveEquityPanel = (
  requested: string | null,
  bymaEnabled: boolean,
): EquityPanelId =>
  isEquityPanel(requested, bymaEnabled)
    ? requested
    : defaultEquityPanel(bymaEnabled);

/** Rows shown in the CEDEAR table; the loading and unavailable states reserve the same number. */
export const CEDEAR_ROW_LIMIT = 30;

/** The S&P Merval leaders panel has 20 stocks; the loading and unavailable states reserve that many rows. */
export const LEADER_SKELETON_ROWS = 20;

interface AccionesHrefOptions {
  /** Keeps the dev-only `?preview=unavailable` flag. */
  previewUnavailable?: boolean;
  /** The company selected in the Empresas panel. */
  empresa?: string;
}

/** Builds an Acciones URL that keeps the panel, the selected company and the dev preview flag together. */
export function accionesHref(
  panel: EquityPanelId,
  { previewUnavailable = false, empresa }: AccionesHrefOptions = {},
) {
  const params = new URLSearchParams({ panel });
  if (empresa) params.set("empresa", empresa);
  if (previewUnavailable) params.set("preview", "unavailable");

  return `/acciones?${params.toString()}`;
}

/**
 * The most traded CEDEARs, as ranked by the data layer: every row with a traded amount comes first, so the cap keeps the most active ones.
 * Untraded rows (alphabetical, after the traded ones) fill the table only when fewer than `CEDEAR_ROW_LIMIT` traded, so the table keeps its height before the session opens.
 */
export function visibleCedearRows(rows: CedearRow[]): CedearRow[] {
  return rows.slice(0, CEDEAR_ROW_LIMIT);
}

/** The shape the data layers return for a failed panel, used by the dev preview without calling upstream. */
export function unavailablePanel<T>(): EquityPanel<T> {
  return { status: "unavailable", data: null, freshness: null };
}

/** Whether a panel should trigger a background retry: it failed, it is showing a stale snapshot, or one of its lists is missing. */
export function panelNeedsRetry(panel: EquityPanel<unknown>): boolean {
  if (panel.status === "unavailable") return true;
  if (panel.freshness.status === "stale") return true;

  const { data } = panel;

  return (
    typeof data === "object" &&
    data !== null &&
    "missingSources" in data &&
    Array.isArray(data.missingSources) &&
    data.missingSources.length > 0
  );
}
