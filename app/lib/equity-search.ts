import { equityPanelSource, type EquityPanelId } from "~/lib/acciones-panels";
import { searchEntities, type SearchEntity } from "~/lib/search-entities";

export interface EquityPanelSearchResult extends SearchEntity<"equity-panel"> {
  id: EquityPanelId;
}

/** Every Acciones panel, the calculator included; single instruments and companies are not indexed, so a ticker never leads to a row the page does not show. */
export const EQUITY_PANEL_SEARCH_RESULTS: readonly EquityPanelSearchResult[] = [
  panelEntity("acciones", "CEDEARs y acciones líderes", [
    "cedear",
    "etf",
    "acciones extranjeras",
    "merval",
    "s&p merval",
    "panel lider",
    "acciones argentinas",
    "indices",
  ]),
  panelEntity("empresas", "Empresas argentinas en la SEC", [
    "empresas",
    "sec",
    "edgar",
    "balances",
    "estados contables",
    "informe anual",
    "20-f",
    "adr",
    "acciones argentinas en estados unidos",
  ]),
  panelEntity("calculadora", "Calculadora de precio teórico de CEDEAR", [
    "calculadora",
    "calculadora cedear",
    "precio teorico",
    "valor teorico",
    "ratio",
    "ratio de conversion",
    "prima o descuento",
  ]),
];

function panelEntity(
  id: EquityPanelId,
  title: string,
  aliases: readonly string[],
): EquityPanelSearchResult {
  return {
    kind: "equity-panel",
    id,
    title,
    aliases,
    target: { pathname: "/acciones", searchParams: { panel: id } },
  };
}

/** The panel entries the top-bar search may offer: the BYMA panels only while `EQUITIES_BYMA_ENABLED` is on, so search never leads to a redirect. */
export function equityPanelSearchResults(
  bymaEnabled: boolean,
): readonly EquityPanelSearchResult[] {
  return EQUITY_PANEL_SEARCH_RESULTS.filter(
    (result) => bymaEnabled || equityPanelSource(result.id) !== "byma",
  );
}

/** Matches an entered term against the names and common aliases of the panels available in the current flag state. */
export function searchEquityPanels(query: string, bymaEnabled: boolean) {
  return searchEntities(query, equityPanelSearchResults(bymaEnabled));
}
