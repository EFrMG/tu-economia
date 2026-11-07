import { z } from "zod";

import basketServerData from "~/lib/price-basket-server.generated.json";
import {
  basketItem,
  chainLabel,
  isGtin,
  summarizeChains,
  type BranchQuote,
  type PriceLocation,
  type PriceUnit,
  type ProductPrices,
} from "~/lib/prices";
import { SITE_URL } from "~/lib/site";
import { createPromiseCache } from "~/lib/promise-cache.server";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import type { SourceHealth } from "~/lib/exchange-rates.server";

const API_BASE = "https://d3e6htiiul5ek9.cloudfront.net/prod";

/** The public key embedded in the preciosclaros.gob.ar frontend. The API is undocumented; see docs/product-price-feed.md. */
const API_KEY = "zIgFou7Gta7g87VFGL9dZ4BEEs19gNYS1SOQZt96";

/** The CDN in front of the API rejects requests with no User-Agent, which is how a Worker's fetch arrives. We identify ourselves rather than imitate a browser. */
const USER_AGENT = `TuEconomia/1.0 (+${SITE_URL})`;

const REQUEST_TIMEOUT_MS = 8_000;
const PRICES_TTL_MS = 30 * 60_000;

interface GroupMember {
  gtin: string;
  /** How many of the group's unit one package holds: 2.5 dozen for a 30-egg tray, 0.315 kg for a 315 g loaf. */
  per: number;
  /** SEPA commerce ids that carried the GTIN in the archive; members with no nearby commerce are skipped. */
  commerces: string[];
}

/** Server-only output of scripts/build-price-basket.py. */
interface BasketServerData {
  sourceDate: string;
  /** Branch ids (`commerce-banner-branch`) answering each location, at most 50. */
  branches: Record<string, string[]>;
  groups: Record<string, { unit: PriceUnit; members: GroupMember[] }>;
  /** Median price per kg by location, fresh item and `commerce-banner`. */
  fresh: Record<string, Record<string, { banner: string; price: number }[]>>;
  /**
   * Shown when the live API fails: the archive's median list price per `commerce-banner` for each basket GTIN and group member, and the banners with a live branch near each location.
   * Absent until the basket is rebuilt with per-banner prices.
   */
  archive?: {
    banners: Record<string, string[]>;
    prices: Record<string, Record<string, number>>;
  };
}

const basket = basketServerData as BasketServerData;

const id = z.union([z.string(), z.number()]).transform(String);

const envelopeSchema = z.object({
  status: z.number(),
  errorDescription: z.string().optional(),
});

const branchQuoteSchema = z.object({
  comercioId: id.optional(),
  banderaId: id.optional(),
  banderaDescripcion: z.string().optional(),
  preciosProducto: z
    .object({ precioLista: z.union([z.number(), z.string()]).optional() })
    .optional(),
});

const productSchema = envelopeSchema.extend({
  sucursales: z.array(branchQuoteSchema),
});

const cache = createPromiseCache();

interface PriceHealthStats {
  successes: number;
  failures: number;
  lastSuccess: string | null;
  lastFailure: string | null;
}

const priceHealthStats: PriceHealthStats = {
  successes: 0,
  failures: 0,
  lastSuccess: null,
  lastFailure: null,
};

function recordPriceSuccess() {
  const now = new Date().toISOString();
  priceHealthStats.successes += 1;
  priceHealthStats.lastSuccess = now;
}

function recordPriceFailure() {
  const now = new Date().toISOString();
  priceHealthStats.failures += 1;
  priceHealthStats.lastFailure = now;
}

export function getPricesSourceHealth(): SourceHealth {
  const { successes, failures, lastSuccess, lastFailure } = priceHealthStats;
  const status =
    successes === 0 && failures === 0
      ? "not-checked"
      : failures === 0
        ? "fetched"
        : successes === 0
          ? "failed"
          : "partial";

  return {
    status,
    lastSuccessfulFetchAt: lastSuccess,
    lastFailureAt: lastFailure,
  };
}

async function fetchEnvelope(path: string, params: Record<string, string>) {
  try {
    const result = await withUpstreamTimeout(
      REQUEST_TIMEOUT_MS,
      async (signal) => {
        const response = await fetch(
          `${API_BASE}${path}?${new URLSearchParams(params)}`,
          {
            headers: {
              accept: "application/json",
              "user-agent": USER_AGENT,
              "x-api-key": API_KEY,
            },
            signal,
          },
        );

        if (!response.ok)
          throw new Error(`Precios Claros respondió con ${response.status}.`);

        return (await response.json()) as unknown;
      },
    );
    recordPriceSuccess();
    return result;
  } catch (error) {
    recordPriceFailure();
    throw error;
  }
}

const branchIds = (location: PriceLocation) =>
  basket.branches[location.id] ?? [];

const toPesos = (value: number | string | undefined) => {
  const price = typeof value === "string" ? Number(value) : value;

  return price !== undefined && Number.isFinite(price) && price > 0
    ? price
    : null;
};

/** List-price quotes for one GTIN at a location's branches, one per branch that carries it. Promotions are left out because they can depend on a card or membership. */
function getQuotes(
  gtin: string,
  location: PriceLocation,
): Promise<BranchQuote[]> {
  return cache.get(`quotes:${location.id}:${gtin}`, PRICES_TTL_MS, async () => {
    const ids = branchIds(location);
    if (!ids.length) return [];

    const payload = await fetchEnvelope("/producto", {
      id_producto: gtin,
      array_sucursales: ids.join(","),
      limit: String(ids.length),
    });

    const parsed = productSchema.parse(payload);
    if (parsed.status !== 200)
      throw new Error("El producto no está disponible.");

    const quotes: BranchQuote[] = [];

    for (const branch of parsed.sucursales) {
      const price = toPesos(branch.preciosProducto?.precioLista);
      if (price === null) continue;

      const chain = branch.comercioId
        ? chainLabel(
            `${branch.comercioId}-${branch.banderaId ?? ""}`,
            branch.banderaDescripcion,
          )
        : branch.banderaDescripcion;

      if (chain) quotes.push({ chain, price });
    }

    return quotes;
  });
}

/** Only members sold by a commerce near the location are requested; each costs one upstream call. */
function nearbyMembers(
  group: BasketServerData["groups"][string],
  location: PriceLocation,
) {
  const nearby = new Set(
    branchIds(location).map((branch) => branch.split("-")[0]),
  );

  return group.members.filter((member) =>
    member.commerces.some((commerce) => nearby.has(commerce)),
  );
}

/** Upstream calls (Worker subrequests) a cold cache needs to price one saved item at a location. */
export function upstreamCallsFor(itemId: string, location: PriceLocation) {
  if (isGtin(itemId)) return branchIds(location).length ? 1 : 0;

  const group = basket.groups[itemId];

  return group ? nearbyMembers(group, location).length : 0;
}

/** Archive prices for a basket GTIN at the chains near a location, or null when the archive has none to offer. */
function archiveQuotes(
  gtin: string,
  location: PriceLocation,
): BranchQuote[] | null {
  const prices = basket.archive?.prices[gtin];
  const banners = basket.archive?.banners[location.id];
  if (!prices || !banners) return null;

  const quotes = banners.flatMap((banner) =>
    banner in prices
      ? [{ chain: chainLabel(banner), price: prices[banner] }]
      : [],
  );

  return quotes.length ? quotes : null;
}

/** Each chain's cheapest member of a group, per unit. */
async function getGroupPrices(
  itemId: string,
  group: BasketServerData["groups"][string],
  location: PriceLocation,
): Promise<ProductPrices> {
  const members = nearbyMembers(group, location);

  const settled = await Promise.allSettled(
    members.map(async (member) =>
      (await getQuotes(member.gtin, location)).map((quote) => ({
        chain: quote.chain,
        price: Math.round(quote.price / member.per),
      })),
    ),
  );

  const failed =
    settled.length > 0 &&
    settled.every((result) => result.status === "rejected");

  if (failed) {
    const archived = group.members.flatMap((member) =>
      (archiveQuotes(member.gtin, location) ?? []).map((quote) => ({
        chain: quote.chain,
        price: Math.round(quote.price / member.per),
      })),
    );

    return {
      id: itemId,
      chains: archived.length ? summarizeChains(archived) : null,
      unit: group.unit,
      snapshot: archived.length > 0,
    };
  }

  const quotes = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  return {
    id: itemId,
    chains: summarizeChains(quotes),
    unit: group.unit,
    snapshot: false,
  };
}

/** Fresh food from the archive snapshot; no upstream call. */
function getFreshPrices(
  itemId: string,
  location: PriceLocation,
): ProductPrices {
  const entries = basket.fresh[location.id]?.[itemId] ?? [];

  return {
    id: itemId,
    chains: summarizeChains(
      entries.map((entry) => ({
        chain: chainLabel(entry.banner),
        price: entry.price,
      })),
    ),
    unit: basketItem(itemId)?.unit ?? "kg",
    snapshot: true,
  };
}

/** Prices for a saved item near a location: a GTIN, a basket group, or a fresh item. */
export async function getItemPrices(
  itemId: string,
  location: PriceLocation,
): Promise<ProductPrices> {
  if (isGtin(itemId)) {
    try {
      return {
        id: itemId,
        chains: summarizeChains(await getQuotes(itemId, location)),
        unit: null,
        snapshot: false,
      };
    } catch (error) {
      const archived = archiveQuotes(itemId, location);
      if (!archived) throw error;

      return {
        id: itemId,
        chains: summarizeChains(archived),
        unit: null,
        snapshot: true,
      };
    }
  }

  const group = basket.groups[itemId];
  if (group) return getGroupPrices(itemId, group, location);

  if (basketItem(itemId)?.kind === "fresh")
    return getFreshPrices(itemId, location);

  throw new Error("Producto desconocido.");
}
