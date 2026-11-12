/**
 * Client-safe half of the Tasas page: the filters, their URL form, the per-lender comparison and the formatting.
 * The data is built ahead of time by `scripts/build-transparency-rates.py` from the BCRA Régimen de Transparencia and read by `transparency-rates.server.ts`.
 */

/** Jurisdictions in the build script's `PROVINCES` order; the ids must match it. */
export const PROVINCES = [
  { id: "caba", label: "Ciudad Autónoma de Buenos Aires" },
  { id: "buenos-aires", label: "Buenos Aires" },
  { id: "catamarca", label: "Catamarca" },
  { id: "cordoba", label: "Córdoba" },
  { id: "corrientes", label: "Corrientes" },
  { id: "chaco", label: "Chaco" },
  { id: "chubut", label: "Chubut" },
  { id: "entre-rios", label: "Entre Ríos" },
  { id: "formosa", label: "Formosa" },
  { id: "jujuy", label: "Jujuy" },
  { id: "la-pampa", label: "La Pampa" },
  { id: "la-rioja", label: "La Rioja" },
  { id: "mendoza", label: "Mendoza" },
  { id: "misiones", label: "Misiones" },
  { id: "neuquen", label: "Neuquén" },
  { id: "rio-negro", label: "Río Negro" },
  { id: "salta", label: "Salta" },
  { id: "san-juan", label: "San Juan" },
  { id: "san-luis", label: "San Luis" },
  { id: "santa-cruz", label: "Santa Cruz" },
  { id: "santa-fe", label: "Santa Fe" },
  { id: "santiago-del-estero", label: "Santiago del Estero" },
  { id: "tierra-del-fuego", label: "Tierra del Fuego" },
  { id: "tucuman", label: "Tucumán" },
] as const;

export type ProvinceId = (typeof PROVINCES)[number]["id"];

/** The build script's `BENEFICIARIES` values. `todos` marks a product open to anyone, so it matches every profile. */
export const LOAN_BENEFICIARIES = [
  { id: "todos", label: "Sin restricción" },
  { id: "relacion-de-dependencia", label: "Relación de dependencia" },
  { id: "monotributistas", label: "Monotributistas" },
  { id: "responsables-inscriptos", label: "Responsables inscriptos" },
  { id: "empleados-publicos", label: "Empleados públicos" },
  { id: "seguridad-social", label: "Cuentas de la seguridad social" },
  { id: "clientes", label: "Clientes de la entidad" },
  { id: "clientes-con-sueldo", label: "Cobran el sueldo en la entidad" },
] as const;

export type LoanBeneficiaryId = (typeof LOAN_BENEFICIARIES)[number]["id"];

/** The profiles a visitor can choose: every beneficiary but `todos`, which is not a profile. */
export const LOAN_PROFILES = LOAN_BENEFICIARIES.filter(
  (
    item,
  ): item is Exclude<(typeof LOAN_BENEFICIARIES)[number], { id: "todos" }> =>
    item.id !== "todos",
);

export type LoanProfileId = (typeof LOAN_PROFILES)[number]["id"];

/** The build script's `SEGMENTS` values. */
export const CARD_SEGMENTS = [
  { id: "nacional", label: "Nacional" },
  { id: "internacional", label: "Internacional" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  { id: "signature-black", label: "Signature, Black o similar" },
] as const;

export type CardSegmentId = (typeof CARD_SEGMENTS)[number]["id"];

/** Minimum terms offered in the filter, in months; a product matches when its maximum term reaches the one chosen. */
export const LOAN_TERMS = [6, 12, 18, 24, 36, 48, 60] as const;

export type LoanTerm = (typeof LOAN_TERMS)[number];

/** The largest amount the filter accepts, above any amount a lender reports. */
export const MAX_LOAN_AMOUNT = 10_000_000_000;

export const RATES_PAGE_SIZE = 20;

export interface LoanProduct {
  entityCode: number;
  entity: string;
  product: string;
  beneficiary: LoanBeneficiaryId;
  rateType: "fija" | "variable" | "mixta" | null;
  termMonths: number;
  amountMin: number;
  amountMax: number;
  incomeMin: number | null;
  tea: number;
  cft: number;
  /** The lender's `fechaInformacion`, `YYYY-MM-DD`. */
  date: string;
  /** Empty for the whole country. */
  provinces: ProvinceId[];
}

export interface CardProduct {
  entityCode: number;
  entity: string;
  product: string;
  segment: CardSegmentId | null;
  financingTea: number;
  cashAdvanceTea: number | null;
  /** Monthly account fee at list price, without discounts. */
  maintenanceFee: number | null;
  /** Yearly renewal fee at list price, without discounts. */
  renewalFee: number | null;
  date: string;
  provinces: ProvinceId[];
}

export interface TransparencyDataset {
  builtOn: string;
  loans: LoanProduct[];
  cards: CardProduct[];
}

/** A loan CFT below this percentage is far under any peso lending rate and is shown with a note. */
export const UNUSUALLY_LOW_CFT = 10;

export const isUnusuallyLowCft = (loan: LoanProduct) =>
  loan.cft < UNUSUALLY_LOW_CFT;

export const RATES_PANELS = [
  { id: "prestamos", label: "Préstamos personales" },
  { id: "tarjetas", label: "Tarjetas de crédito" },
] as const;

export type RatesPanelId = (typeof RATES_PANELS)[number]["id"];

export const DEFAULT_RATES_PANEL: RatesPanelId = "prestamos";

export interface LoanFilters {
  perfil: LoanProfileId | null;
  plazo: LoanTerm | null;
  monto: number | null;
  provincia: ProvinceId | null;
  pagina: number;
}

export interface CardFilters {
  segmento: CardSegmentId | null;
  provincia: ProvinceId | null;
  pagina: number;
}

/** Every parameter the page reads; the loader removes any other one panel does not use. */
export const LOAN_PARAMS = [
  "perfil",
  "plazo",
  "monto",
  "provincia",
  "pagina",
] as const;
export const CARD_PARAMS = ["segmento", "provincia", "pagina"] as const;

const isOneOf = <Id extends string>(
  list: readonly { id: Id }[],
  value: string | null,
): value is Id => list.some((item) => item.id === value);

export const isRatesPanel = (value: string | null): value is RatesPanelId =>
  isOneOf(RATES_PANELS, value);

function parsePage(value: string | null): number {
  if (value === null || !/^\d{1,4}$/.test(value)) return 1;

  return Math.max(1, Number(value));
}

/** Whole pesos, with or without thousands dots (`2.000.000`); anything else, zero or above the bound reads as no amount. */
function parseAmount(value: string | null): number | null {
  if (value === null) return null;

  const digits = value.trim().replace(/\./g, "");
  if (!/^\d{1,11}$/.test(digits)) return null;

  const amount = Number(digits);

  return amount > 0 && amount <= MAX_LOAN_AMOUNT ? amount : null;
}

export function parseLoanFilters(params: URLSearchParams): LoanFilters {
  const perfil = params.get("perfil");
  const plazo = Number(params.get("plazo"));
  const provincia = params.get("provincia");

  return {
    perfil: isOneOf(LOAN_PROFILES, perfil) ? perfil : null,
    plazo: LOAN_TERMS.find((term) => term === plazo) ?? null,
    monto: parseAmount(params.get("monto")),
    provincia: isOneOf(PROVINCES, provincia) ? provincia : null,
    pagina: parsePage(params.get("pagina")),
  };
}

export function parseCardFilters(params: URLSearchParams): CardFilters {
  const segmento = params.get("segmento");
  const provincia = params.get("provincia");

  return {
    segmento: isOneOf(CARD_SEGMENTS, segmento) ? segmento : null,
    provincia: isOneOf(PROVINCES, provincia) ? provincia : null,
    pagina: parsePage(params.get("pagina")),
  };
}

/** The canonical query for a panel: the panel first, then each set filter in a fixed order; page 1 is omitted. */
export function ratesSearch(
  panel: RatesPanelId,
  filters: LoanFilters | CardFilters,
): URLSearchParams {
  const params = new URLSearchParams({ panel });

  for (const [key, value] of Object.entries(filters))
    if (value !== null && !(key === "pagina" && value === 1))
      params.set(key, String(value));

  return params;
}

const coversProvince = (
  provinces: readonly ProvinceId[],
  provincia: ProvinceId | null,
) => provincia === null || !provinces.length || provinces.includes(provincia);

export function loanMatches(row: LoanProduct, filters: LoanFilters): boolean {
  return (
    (filters.perfil === null ||
      row.beneficiary === "todos" ||
      row.beneficiary === filters.perfil) &&
    (filters.plazo === null || row.termMonths >= filters.plazo) &&
    (filters.monto === null ||
      (row.amountMin <= filters.monto && filters.monto <= row.amountMax)) &&
    coversProvince(row.provinces, filters.provincia)
  );
}

export function cardMatches(row: CardProduct, filters: CardFilters): boolean {
  return (
    (filters.segmento === null || row.segment === filters.segmento) &&
    coversProvince(row.provinces, filters.provincia)
  );
}

/** Code-point order for tie-breaks: deterministic, and without the collator a locale-aware comparison initializes on a cold Worker's first request. */
const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

export interface LenderRow<Product> {
  /** The lender's lowest-cost product among those matching the filters. */
  best: Product;
  /** How many of the lender's products match the filters, the best one included. */
  matches: number;
}

/**
 * One row per lender: its cheapest matching product by `rate`, ties going to the lower `tiebreak` and then the product name.
 * Lenders are ordered by that product's rate, then by name, so a lender with hundreds of products never fills the table.
 */
export function bestPerLender<
  Product extends { entityCode: number; entity: string; product: string },
>(
  rows: readonly Product[],
  rate: (row: Product) => number,
  tiebreak: (row: Product) => number,
): LenderRow<Product>[] {
  const byLender = new Map<number, LenderRow<Product>>();

  const better = (left: Product, right: Product) =>
    rate(left) - rate(right) ||
    tiebreak(left) - tiebreak(right) ||
    compareText(left.product, right.product);

  for (const row of rows) {
    const current = byLender.get(row.entityCode);

    if (!current) byLender.set(row.entityCode, { best: row, matches: 1 });
    else {
      current.matches += 1;
      if (better(row, current.best) < 0) current.best = row;
    }
  }

  return [...byLender.values()].sort(
    (left, right) =>
      rate(left.best) - rate(right.best) ||
      compareText(left.best.entity, right.best.entity),
  );
}

export interface RatesPage<Product> {
  rows: LenderRow<Product>[];
  /** Lenders matching the filters, across every page. */
  lenders: number;
  /** Products matching the filters, across every lender. */
  products: number;
  page: number;
  pages: number;
}

/** The requested page of lenders; a page past the last reads as the last, and an empty result has one empty page. */
export function paginate<Product>(
  lenders: LenderRow<Product>[],
  page: number,
): RatesPage<Product> {
  const pages = Math.max(1, Math.ceil(lenders.length / RATES_PAGE_SIZE));
  const current = Math.min(page, pages);

  return {
    rows: lenders.slice(
      (current - 1) * RATES_PAGE_SIZE,
      current * RATES_PAGE_SIZE,
    ),
    lenders: lenders.length,
    products: lenders.reduce((total, lender) => total + lender.matches, 0),
    page: current,
    pages,
  };
}

const percent = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const day = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export const formatRate = (value: number) => `${percent.format(value)}%`;

export const formatPesos = (value: number) => `$ ${pesos.format(value)}`;

export const formatRatesDate = (date: string) =>
  day.format(new Date(`${date}T12:00:00.000Z`));

export const labelOf = <Id extends string>(
  list: readonly { id: Id; label: string }[],
  id: Id | null,
) => list.find((item) => item.id === id)?.label ?? null;
