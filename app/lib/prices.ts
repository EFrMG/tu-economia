import basketData from "~/lib/price-basket.generated.json";

export interface PriceLocation {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

/** Cities offered in the location picker. scripts/build-price-basket.py reads this list to choose each city's nearby branches, so keep every entry in the `{ id, label, lat, lng }` shape. */
export const PRICE_LOCATIONS: readonly PriceLocation[] = [
  { id: "caba", label: "Buenos Aires (CABA)", lat: -34.6037, lng: -58.3816 },
  {
    id: "la-plata",
    label: "La Plata, Buenos Aires",
    lat: -34.9205,
    lng: -57.9536,
  },
  {
    id: "mar-del-plata",
    label: "Mar del Plata, Buenos Aires",
    lat: -38.0055,
    lng: -57.5426,
  },
  {
    id: "bahia-blanca",
    label: "Bahía Blanca, Buenos Aires",
    lat: -38.7196,
    lng: -62.2724,
  },
  {
    id: "conurbano-norte",
    label: "Conurbano norte, Buenos Aires",
    lat: -34.47,
    lng: -58.52,
  },
  {
    id: "conurbano-oeste",
    label: "Conurbano oeste, Buenos Aires",
    lat: -34.65,
    lng: -58.62,
  },
  {
    id: "conurbano-sur",
    label: "Conurbano sur, Buenos Aires",
    lat: -34.72,
    lng: -58.27,
  },
  { id: "cordoba", label: "Córdoba", lat: -31.4201, lng: -64.1888 },
  { id: "rosario", label: "Rosario, Santa Fe", lat: -32.9442, lng: -60.6505 },
  { id: "santa-fe", label: "Santa Fe", lat: -31.6333, lng: -60.7 },
  { id: "mendoza", label: "Mendoza", lat: -32.8895, lng: -68.8458 },
  { id: "san-juan", label: "San Juan", lat: -31.5375, lng: -68.5364 },
  { id: "san-luis", label: "San Luis", lat: -33.295, lng: -66.3356 },
  {
    id: "tucuman",
    label: "San Miguel de Tucumán",
    lat: -26.8083,
    lng: -65.2176,
  },
  { id: "salta", label: "Salta", lat: -24.7821, lng: -65.4232 },
  { id: "jujuy", label: "San Salvador de Jujuy", lat: -24.1858, lng: -65.2995 },
  {
    id: "santiago-del-estero",
    label: "Santiago del Estero",
    lat: -27.7951,
    lng: -64.2615,
  },
  {
    id: "catamarca",
    label: "San Fernando del Valle de Catamarca",
    lat: -28.4696,
    lng: -65.7852,
  },
  { id: "la-rioja", label: "La Rioja", lat: -29.4131, lng: -66.8558 },
  { id: "parana", label: "Paraná, Entre Ríos", lat: -31.7413, lng: -60.5115 },
  { id: "corrientes", label: "Corrientes", lat: -27.4806, lng: -58.8341 },
  {
    id: "resistencia",
    label: "Resistencia, Chaco",
    lat: -27.4511,
    lng: -58.9867,
  },
  { id: "posadas", label: "Posadas, Misiones", lat: -27.3671, lng: -55.8961 },
  { id: "formosa", label: "Formosa", lat: -26.1775, lng: -58.1781 },
  {
    id: "santa-rosa",
    label: "Santa Rosa, La Pampa",
    lat: -36.6167,
    lng: -64.2833,
  },
  { id: "neuquen", label: "Neuquén", lat: -38.9516, lng: -68.0591 },
  {
    id: "bariloche",
    label: "San Carlos de Bariloche, Río Negro",
    lat: -41.1335,
    lng: -71.3103,
  },
  { id: "viedma", label: "Viedma, Río Negro", lat: -40.8135, lng: -62.9967 },
  { id: "trelew", label: "Trelew, Chubut", lat: -43.2489, lng: -65.3051 },
  {
    id: "comodoro",
    label: "Comodoro Rivadavia, Chubut",
    lat: -45.8641,
    lng: -67.4966,
  },
  {
    id: "rio-gallegos",
    label: "Río Gallegos, Santa Cruz",
    lat: -51.6226,
    lng: -69.2181,
  },
  {
    id: "ushuaia",
    label: "Ushuaia, Tierra del Fuego",
    lat: -54.8019,
    lng: -68.303,
  },
];

export const DEFAULT_PRICE_LOCATION_ID = "caba";

export const locationById = (id: string) =>
  PRICE_LOCATIONS.find((location) => location.id === id);

export const locationByLabel = (label: string) => {
  const wanted = label.trim().toLowerCase();

  return PRICE_LOCATIONS.find(
    (location) => location.label.toLowerCase() === wanted,
  );
};

export type PriceUnit = "docena" | "kg";

/** A reference-basket entry. `product` is one GTIN priced live; `group` prices each chain's cheapest member per unit, live; `fresh` is an archive median per kg. */
export interface BasketCategory {
  id: string;
  section: string;
  kind: "product" | "group" | "fresh";
  name: string;
  unit?: PriceUnit;
  gtin?: string;
}

/** Written by scripts/build-price-basket.py; see docs/product-price-feed.md. */
interface BasketData {
  archive: string;
  sourceDate: string;
  searchIndex: string;
  defaults: string[];
  categories: BasketCategory[];
}

const basket = basketData as BasketData;

/** The SEPA archive day the basket, the search index and the fresh prices were built from. */
export const PRICE_SOURCE_DATE = basket.sourceDate;

export const PRICE_SEARCH_INDEX_URL = basket.searchIndex;

export const BASKET_CATEGORIES: readonly BasketCategory[] = basket.categories;

export const BASKET_SECTIONS = [
  ...new Set(BASKET_CATEGORIES.map((category) => category.section)),
];

/** A saved item is a GTIN for single products and the category id for groups and fresh food. */
export const basketItemId = (category: BasketCategory) =>
  category.kind === "product" && category.gtin ? category.gtin : category.id;

export const basketItem = (id: string) =>
  BASKET_CATEGORIES.find((category) => basketItemId(category) === id);

export const isGtin = (id: string) => /^\d{8,14}$/.test(id);

/** Whether an id names something the prices endpoint can answer: any GTIN, or a basket group or fresh item. */
export const isPriceItemId = (id: string) =>
  isGtin(id) ||
  basketItem(id)?.kind === "group" ||
  basketItem(id)?.kind === "fresh";

export interface PriceProduct {
  id: string;
  name: string;
}

/** The same four everyday buys for every new visitor; they can be removed. */
export const DEFAULT_PRICE_PRODUCTS: readonly PriceProduct[] =
  basket.defaults.map((id) => ({ id, name: basketItem(id)?.name ?? id }));

/** Each saved item costs up to one upstream call per nearby chain, so the list stays short enough for one Worker invocation. */
export const MAX_PRICE_FAVORITES = 8;

export interface PricePreferences {
  locationId: string;
  products: PriceProduct[];
}

export const defaultPricePreferences = (): PricePreferences => ({
  locationId: DEFAULT_PRICE_LOCATION_ID,
  products: DEFAULT_PRICE_PRODUCTS.map((product) => ({ ...product })),
});

const STORAGE_KEY = "tu-economia:price-preferences:v1";

const isProduct = (value: unknown): value is PriceProduct =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as PriceProduct).id === "string" &&
  typeof (value as PriceProduct).name === "string";

/** Reads the saved choices, falling back to the defaults when storage is empty, blocked or malformed. */
export function loadPricePreferences(): PricePreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPricePreferences();

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null)
      return defaultPricePreferences();

    const { locationId, products } = parsed as Partial<PricePreferences>;

    return {
      locationId:
        typeof locationId === "string" && locationById(locationId)
          ? locationId
          : DEFAULT_PRICE_LOCATION_ID,
      products: Array.isArray(products)
        ? products.filter(isProduct).slice(0, MAX_PRICE_FAVORITES)
        : defaultPricePreferences().products,
    };
  } catch {
    return defaultPricePreferences();
  }
}

export function savePricePreferences(preferences: PricePreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be blocked; the choices then last only for this visit.
  }
}

/** Display names by SEPA commerce id, or by `commerce-banner` where one company runs stores people know apart. Formats of one brand (Carrefour Express, Market, Maxi) share a name. */
const CHAIN_LABELS: Readonly<Record<string, string>> = {
  "2": "La Anónima",
  "5": "California",
  "6": "Comodín",
  "8": "Mariano Max",
  "9-1": "Vea",
  "9-2": "Disco",
  "9-3": "Jumbo",
  "10": "Carrefour",
  "11": "Changomas",
  "12": "Coto",
  "13": "Cooperativa Obrera",
  "15": "DIA",
  "20": "La Agrícola Regional",
  "21": "Toledo",
};

/** The name shown for a `commerce-banner` pair, falling back to the source's own banner name. */
export const chainLabel = (banner: string, fallback?: string) =>
  CHAIN_LABELS[banner] ??
  CHAIN_LABELS[banner.split("-")[0]] ??
  fallback ??
  banner;

export interface ChainPrice {
  chain: string;
  /** The cheapest list price among the chain's nearby branches, in pesos. */
  price: number;
  /** Nearby branches of the chain that carry the product. */
  branches: number;
}

export interface BranchQuote {
  chain: string;
  price: number;
}

/** One row per chain at its cheapest nearby branch, cheapest first, so the reader never has to pick a branch. */
export function summarizeChains(quotes: BranchQuote[]): ChainPrice[] {
  const byChain = new Map<string, ChainPrice>();

  for (const quote of quotes) {
    const current = byChain.get(quote.chain);

    if (!current) {
      byChain.set(quote.chain, {
        chain: quote.chain,
        price: quote.price,
        branches: 1,
      });
    } else {
      current.branches += 1;
      current.price = Math.min(current.price, quote.price);
    }
  }

  return [...byChain.values()].sort(
    (a, b) => a.price - b.price || a.chain.localeCompare(b.chain, "es"),
  );
}

export interface ProductPrices {
  id: string;
  /** Null when the upstream request for this item failed. */
  chains: ChainPrice[] | null;
  /** Set for groups and fresh food, whose prices are per dozen or per kilogram. */
  unit: PriceUnit | null;
  /** True for fresh food, and for basket items whose live request failed, priced from the archive of PRICE_SOURCE_DATE instead of live. */
  snapshot: boolean;
}

export interface PricesResponse {
  /** The location id the prices belong to, so the client can keep showing them while it adds an item. */
  location: string;
  products: ProductPrices[];
}

/** One search-index row: GTIN, display name, brand, size, and other chains' description words. */
export type CatalogEntry = [
  gtin: string,
  name: string,
  brand: string | null,
  size: string | null,
  aliases: string,
];

export interface PriceCatalog {
  sourceDate: string;
  products: CatalogEntry[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string | null;
  size: string | null;
  /** Folded name, brand and aliases, each word preceded by a space. */
  haystack: string;
}

export const MAX_CATALOG_MATCHES = 20;

const foldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-AR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Folds the index once after download, so each keystroke only scans prepared strings. */
export const prepareCatalog = (catalog: PriceCatalog): CatalogProduct[] =>
  catalog.products.map(([id, name, brand, size, aliases]) => ({
    id,
    name,
    brand,
    size,
    haystack: ` ${foldText(`${name} ${brand ?? ""} ${aliases}`)}`,
  }));

/** Products where every typed word starts a word of the name, brand or another chain's description. The index is ordered by how many chains carry each product, so the first matches are the most widely available. */
export function searchCatalog(
  products: readonly CatalogProduct[],
  query: string,
  limit = MAX_CATALOG_MATCHES,
): CatalogProduct[] {
  const terms = foldText(query).split(" ").filter(Boolean);
  if (!terms.length) return [];

  const matches: CatalogProduct[] = [];

  for (const product of products) {
    if (!terms.every((term) => product.haystack.includes(` ${term}`))) continue;

    matches.push(product);

    if (matches.length === limit) break;
  }

  return matches;
}
