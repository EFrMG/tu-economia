import { INDICATOR_DEFINITIONS, type IndicatorId } from "~/lib/indicators";
import type { SearchEntity } from "~/lib/search-entities";

export type IndicatorSearchResult = SearchEntity<"indicator">;

/** The element id of an `/indicadores` card, which search scrolls to. */
export const indicatorCardId = (id: IndicatorId) => `indicador-${id}`;

/** Common names a visitor may type for each card, beyond its title. */
const CARD_ALIASES: Record<IndicatorId, readonly string[]> = {
  "inflation-monthly": ["inflacion", "ipc", "precios"],
  "inflation-yearly": ["inflacion anual", "ipc interanual"],
  "inflation-expected": ["rem", "expectativas de inflacion"],
  "deposits-30-days": ["plazo fijo", "tasa de depositos"],
  badlar: ["tasa badlar"],
  tamar: ["tasa tamar"],
  "personal-loans": ["tasa de prestamos"],
  reserves: ["reservas", "reservas del bcra"],
  "dollar-retail": ["dolar minorista"],
  "dollar-wholesale": ["dolar mayorista", "a3500", "comunicacion a 3500"],
  "country-risk": ["riesgo pais", "embi"],
  "monetary-base": ["base monetaria", "emision"],
  "private-m2-yearly": ["m2", "agregados monetarios"],
  uva: ["uva", "unidad de valor adquisitivo"],
  uvi: ["uvi", "unidad de vivienda"],
  cer: ["cer", "coeficiente de estabilizacion de referencia"],
  icl: ["icl", "alquileres", "contratos de locacion"],
};

/** Tables and panels of `/indicadores`, by the id of their section. */
const SECTIONS: readonly {
  id: string;
  title: string;
  aliases: readonly string[];
}[] = [
  {
    id: "canasta-basica",
    title: "Canasta básica",
    aliases: [
      "cba",
      "cbt",
      "canasta basica alimentaria",
      "canasta basica total",
      "linea de pobreza",
      "linea de indigencia",
      "pobreza",
      "indigencia",
    ],
  },
  {
    id: "salarios",
    title: "Salarios",
    aliases: [
      "salario",
      "sueldos",
      "indice de salarios",
      "salario real",
      "ingresos",
    ],
  },
  {
    id: "inflacion-por-rubro",
    title: "Inflación por rubro y región",
    aliases: [
      "ipc por rubro",
      "inflacion por region",
      "divisiones del ipc",
      "inflacion nucleo",
      "regulados",
      "estacionales",
      "alimentos",
      "transporte",
      "vivienda",
      "servicios",
      "bienes",
    ],
  },
  {
    id: "activity-title",
    title: "Actividad económica (EMAE)",
    aliases: ["emae", "actividad", "estimador mensual de actividad economica"],
  },
];

const entity = (
  id: string,
  title: string,
  aliases: readonly string[],
): IndicatorSearchResult => ({
  kind: "indicator",
  id,
  title,
  aliases,
  target: { pathname: "/indicadores", hash: id, focusId: id },
});

/** Cards first, in page order, so a broad term such as "inflación" lists the headline figure before the breakdown tables. */
export const INDICATOR_SEARCH_RESULTS: readonly IndicatorSearchResult[] = [
  ...INDICATOR_DEFINITIONS.map((definition) =>
    entity(
      indicatorCardId(definition.id),
      definition.title,
      CARD_ALIASES[definition.id],
    ),
  ),
  ...SECTIONS.map(({ id, title, aliases }) => entity(id, title, aliases)),
];
