import { searchEntities, type SearchEntity } from "~/lib/search-entities";

export type SearchableRateCasa =
  "blue" | "oficial" | "bolsa" | "contadoconliqui" | "cripto";

export interface ExchangeRateSearchResult extends SearchEntity<"exchange-rate"> {
  id: SearchableRateCasa;
}

/** The first, intentionally small search index: the quotations on the Dólar page. */
export const EXCHANGE_RATE_SEARCH_RESULTS: readonly ExchangeRateSearchResult[] =
  [
    rateEntity("blue", "USD Blue", ["blue", "dolar blue", "usd blue"]),
    rateEntity("oficial", "Oficial BNA", ["oficial", "bna", "dolar oficial"]),
    rateEntity("bolsa", "Dólar MEP", ["mep", "dolar mep", "bolsa"]),
    rateEntity("contadoconliqui", "Contado c/ Liqui", [
      "ccl",
      "contado con liqui",
      "dolar ccl",
      "liqui",
    ]),
    rateEntity("cripto", "USDT Cripto", ["cripto", "usdt", "dolar cripto"]),
  ];

function rateEntity(
  id: SearchableRateCasa,
  title: string,
  aliases: readonly string[],
): ExchangeRateSearchResult {
  return {
    kind: "exchange-rate",
    id,
    title,
    aliases,
    target: {
      pathname: "/dolar",
      hash: rateCardId(id),
    },
  };
}

/** Matches an entered term against names and common quotation names without UI concerns. */
export function searchExchangeRates(query: string) {
  return searchEntities(query, EXCHANGE_RATE_SEARCH_RESULTS);
}

export function rateCardId(casa: SearchableRateCasa) {
  return `exchange-rate-${casa}`;
}
