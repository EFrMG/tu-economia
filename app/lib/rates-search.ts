import type { RatesPanelId } from "~/lib/transparency-rates";
import type { SearchEntity } from "~/lib/search-entities";

export interface RatesPanelSearchResult extends SearchEntity<"rates-panel"> {
  id: RatesPanelId;
}

/** Both Tasas panels; single lenders are not indexed, since a lender's row depends on the filters. */
export const RATES_PANEL_SEARCH_RESULTS: readonly RatesPanelSearchResult[] = [
  panelEntity("prestamos", "Tasas de préstamos personales", [
    "prestamo",
    "prestamos personales",
    "credito",
    "cft",
    "costo financiero total",
    "tea",
    "tasa de interes",
  ]),
  panelEntity("tarjetas", "Tasas y comisiones de tarjetas de crédito", [
    "tarjeta",
    "tarjeta de credito",
    "financiacion",
    "adelanto en efectivo",
    "comision",
    "renovacion",
    "visa",
    "mastercard",
  ]),
];

function panelEntity(
  id: RatesPanelId,
  title: string,
  aliases: readonly string[],
): RatesPanelSearchResult {
  return {
    kind: "rates-panel",
    id,
    title,
    aliases,
    target: { pathname: "/tasas", searchParams: { panel: id } },
  };
}
