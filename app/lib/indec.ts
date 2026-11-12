/** The Catálogo API-INDEC portal; data requests go to `v1/` and need a token. */
export const INDEC_API_URL = "https://api.indec.gob.ar/";

export const INDEC_DATA_URL = `${INDEC_API_URL}v1/`;

export const BASKETS_SERVICE = "valorizacion_canastas_cba_cbt";
export const WAGES_SERVICE = "indice_salarios";
export const PRICES_SERVICE = "ipc_nacional";

/** The catalogue page of a service, where its columns and methodology are described. */
export const indecServiceUrl = (service: string) =>
  `${INDEC_API_URL}datasets/${service}`;

export const BASKETS = [
  {
    id: "CBA",
    label: "Canasta básica alimentaria",
    line: "Línea de indigencia",
  },
  { id: "CBT", label: "Canasta básica total", line: "Línea de pobreza" },
] as const;

export type BasketId = (typeof BASKETS)[number]["id"];

/** `codigo` in `indice_salarios`. */
export const WAGE_SECTORS = [
  { code: "0", label: "Nivel general" },
  { code: "110", label: "Privado registrado" },
  { code: "120", label: "Público" },
  { code: "200", label: "Privado no registrado" },
] as const;

/** `codigo` of the IPC categories at national level, in reading order. */
export const PRICE_CATEGORY_CODES = ["N", "R", "E", "B", "S"] as const;

/** `region` in `ipc_nacional`, without "Nacional", which is the general level. */
export const PRICE_REGIONS = [
  { id: "GBA", label: "Gran Buenos Aires" },
  { id: "Pampeana", label: "Pampeana" },
  { id: "Noreste", label: "Noreste" },
  { id: "Noroeste", label: "Noroeste" },
  { id: "Cuyo", label: "Cuyo" },
  { id: "Patagonia", label: "Patagonia" },
] as const;

export interface BasketRow {
  id: BasketId;
  /** Monthly value per adult equivalent, in pesos. */
  perAdult: number | null;
  /** Monthly value for INDEC's household 2: four members (35, 31, 8 and 6 years old). */
  household: number | null;
  monthly: number | null;
  yearly: number | null;
}

export interface BasketsData {
  /** First day of the reference month, `YYYY-MM-01`. */
  period: string;
  rows: BasketRow[];
}

export interface WageRow {
  code: (typeof WAGE_SECTORS)[number]["code"];
  label: string;
  monthly: number | null;
  yearly: number | null;
  /** Yearly change discounting the IPC's yearly change for the same month. */
  realYearly: number | null;
}

export interface WagesData {
  period: string;
  /** The national IPC's yearly change for the wage month, or `null` when it is not in the window read. */
  inflationYearly: number | null;
  rows: WageRow[];
}

export interface PriceRow {
  code: string;
  label: string;
  monthly: number | null;
  yearly: number | null;
}

export interface ConsumerPricesData {
  period: string;
  general: PriceRow;
  /** The twelve COICOP divisions at national level. */
  divisions: PriceRow[];
  /** Core, regulated and seasonal prices, then goods and services. */
  categories: PriceRow[];
  regions: PriceRow[];
}

/** Each part fails on its own: `null` means its service could not be read. */
export interface IndecData {
  baskets: BasketsData | null;
  wages: WagesData | null;
  prices: ConsumerPricesData | null;
}

export const UNAVAILABLE_INDEC_DATA: IndecData = {
  baskets: null,
  wages: null,
  prices: null,
};

/** A nominal change net of inflation over the same span, both in percent. */
export const realChange = (nominal: number, inflation: number) =>
  ((1 + nominal / 100) / (1 + inflation / 100) - 1) * 100;

const percent = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const month = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const formatChange = (value: number) => `${percent.format(value)}%`;

export const formatPesos = (value: number) => `$ ${pesos.format(value)}`;

export const formatIndecPeriod = (period: string) =>
  month.format(new Date(`${period}T12:00:00.000Z`));
