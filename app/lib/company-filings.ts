/**
 * Client-safe half of the SEC EDGAR data layer behind the Acciones "Empresas" panel: the issuer table, the shapes the page consumes, and the pure helpers over EDGAR records.
 * Figures are carried exactly as each company filed them, in its own unit; nothing here converts currencies or compares periods.
 */

import type { EquityPanel, EquitySector } from "~/lib/equities";

export interface Issuer {
  /** The US ticker, as `company_tickers.json` and the submissions `tickers` array list it. */
  ticker: string;
  name: string;
  sector: EquitySector;
}

/**
 * Argentine companies with shares or ADRs listed in the United States, in display order.
 * Tickers only: the CIK is resolved at run time from the SEC's ticker file and never written here.
 */
export const ISSUERS: readonly Issuer[] = [
  { ticker: "YPF", name: "YPF", sector: "Energía" },
  { ticker: "PAM", name: "Pampa Energía", sector: "Energía" },
  { ticker: "TGS", name: "Transportadora de Gas del Sur", sector: "Energía" },
  { ticker: "CEPU", name: "Central Puerto", sector: "Servicios públicos" },
  { ticker: "EDN", name: "Edenor", sector: "Servicios públicos" },
  { ticker: "GGAL", name: "Grupo Financiero Galicia", sector: "Financiero" },
  { ticker: "BMA", name: "Banco Macro", sector: "Financiero" },
  { ticker: "BBAR", name: "BBVA Argentina", sector: "Financiero" },
  { ticker: "SUPV", name: "Grupo Supervielle", sector: "Financiero" },
  { ticker: "TEO", name: "Telecom Argentina", sector: "Telecomunicaciones" },
  { ticker: "LOMA", name: "Loma Negra", sector: "Materiales" },
  { ticker: "IRS", name: "IRSA", sector: "Inmobiliario" },
  { ticker: "CRESY", name: "Cresud", sector: "Agropecuario" },
];

/** The issuer for a `?empresa=` value, matched without regard to case; `null` for a ticker outside the table. */
export function findIssuer(ticker: string | null): Issuer | null {
  if (!ticker) return null;

  const wanted = ticker.trim().toUpperCase();

  return ISSUERS.find((issuer) => issuer.ticker === wanted) ?? null;
}

/** Annual reports: 20-F for foreign private issuers, 10-K for domestic filers, 40-F for Canadian ones. Amendments are not treated as the annual report. */
export const ANNUAL_REPORT_FORMS: readonly string[] = ["20-F", "10-K", "40-F"];

export const isAnnualReportForm = (form: string) =>
  ANNUAL_REPORT_FORMS.includes(form);

/** Filings listed in the company view, newest first. */
export const RECENT_FILINGS_LIMIT = 12;

/** One filing from the submissions `recent` arrays, with the link to its primary document. */
export interface FilingRef {
  accessionNumber: string;
  form: string;
  /** `YYYY-MM-DD`. */
  filingDate: string;
  /** Period of the report (`YYYY-MM-DD`); `null` when EDGAR sends an empty string. */
  reportDate: string | null;
  primaryDocument: string;
  /** The filer's own description of the primary document; `null` when empty. */
  description: string | null;
  url: string;
}

/** The SEC's ten-digit, zero-padded CIK, as the `data.sec.gov` paths expect it. */
export function paddedCik(cik: number): string {
  return String(cik).padStart(10, "0");
}

/** `https://www.sec.gov/Archives/edgar/data/<cik without padding>/<accession without dashes>/<primary document>`. */
export function filingDocumentUrl(
  cik: number,
  accessionNumber: string,
  primaryDocument: string,
): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replaceAll("-", "")}/${encodeURI(primaryDocument)}`;
}

/** The company's EDGAR page with every filing, for the links out of the company view. */
export function companyFilingsUrl(cik: number): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik(cik)}&type=&dateb=&owner=include&count=40`;
}

/** The submissions `filings.recent` block: parallel arrays, newest first. */
export interface RecentFilingArrays {
  accessionNumber: string[];
  filingDate: string[];
  form: string[];
  primaryDocument: string[];
  reportDate?: (string | null)[];
  primaryDocDescription?: (string | null)[];
}

/**
 * Zips the parallel arrays into filings, newest first as EDGAR sends them.
 * Only indices present in every required array are kept, and an entry without an accession number, form, date or document is skipped, so a short array cannot shift one filing's fields onto another.
 */
export function parseRecentFilings(
  cik: number,
  recent: RecentFilingArrays,
): FilingRef[] {
  const length = Math.min(
    recent.accessionNumber.length,
    recent.filingDate.length,
    recent.form.length,
    recent.primaryDocument.length,
  );

  const filings: FilingRef[] = [];

  for (let index = 0; index < length; index++) {
    const accessionNumber = recent.accessionNumber[index].trim();
    const form = recent.form[index].trim();
    const filingDate = recent.filingDate[index].trim();
    const primaryDocument = recent.primaryDocument[index].trim();
    if (!accessionNumber || !form || !filingDate || !primaryDocument) continue;

    const reportDate = recent.reportDate?.[index]?.trim() || null;
    const description = recent.primaryDocDescription?.[index]?.trim() || null;

    filings.push({
      accessionNumber,
      form,
      filingDate,
      reportDate,
      primaryDocument,
      description,
      url: filingDocumentUrl(cik, accessionNumber, primaryDocument),
    });
  }

  return filings;
}

/** The newest annual report among the filings, which EDGAR lists newest first; compared by date so the order is not assumed. */
export function latestAnnualReport(filings: FilingRef[]): FilingRef | null {
  return filings
    .filter((filing) => isAnnualReportForm(filing.form))
    .reduce<FilingRef | null>(
      (latest, filing) =>
        latest === null || filing.filingDate > latest.filingDate
          ? filing
          : latest,
      null,
    );
}

/** Whether the submissions record lists the ticker the issuer table expects; a CIK that resolves to another company must not be shown under this name. */
export function listsTicker(tickers: readonly string[], expected: string) {
  return tickers.some((ticker) => ticker.trim().toUpperCase() === expected);
}

export type FigureId = "revenue" | "profit" | "assets" | "equity";

export type Taxonomy = "ifrs-full" | "us-gaap";

/** How a concept is measured: over a period (revenue, profit) or at a date (assets, equity). */
export type FigureKind = "duration" | "instant";

export interface FigureDefinition {
  id: FigureId;
  label: string;
  kind: FigureKind;
  tags: Record<Taxonomy, string>;
}

/** The four figures of the company view, in display order, with the XBRL tag each taxonomy uses. */
export const FIGURES: readonly FigureDefinition[] = [
  {
    id: "revenue",
    label: "Ingresos",
    kind: "duration",
    tags: { "ifrs-full": "Revenue", "us-gaap": "Revenues" },
  },
  {
    id: "profit",
    label: "Resultado del ejercicio",
    kind: "duration",
    tags: { "ifrs-full": "ProfitLoss", "us-gaap": "NetIncomeLoss" },
  },
  {
    id: "assets",
    label: "Activo total",
    kind: "instant",
    tags: { "ifrs-full": "Assets", "us-gaap": "Assets" },
  },
  {
    id: "equity",
    label: "Patrimonio neto",
    kind: "instant",
    tags: { "ifrs-full": "Equity", "us-gaap": "StockholdersEquity" },
  },
];

/** `ifrs-full` first: most of these issuers report under IFRS; `us-gaap` is asked only when no IFRS tag exists for the company. */
export const TAXONOMIES: readonly Taxonomy[] = ["ifrs-full", "us-gaap"];

/** One fact of a `companyconcept` response, after validation. */
export interface ConceptFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number | null;
  fp?: string | null;
  form: string;
  filed: string;
  frame?: string;
}

/** A figure as the company reported it, with everything needed to read it correctly. */
export interface ReportedFigure {
  value: number;
  /** The XBRL unit, e.g. `ARS` or `USD`; shown as is. */
  unit: string;
  /** `YYYY-MM-DD`; `null` for a value at a date. */
  periodStart: string | null;
  periodEnd: string;
  fiscalYear: number | null;
  form: string;
  /** `YYYY-MM-DD` on which the report carrying the fact was filed. */
  filed: string;
  /** Accession number of that report. */
  accession: string;
  taxonomy: Taxonomy;
  tag: string;
}

/** A fiscal year spans 52 or 53 weeks or twelve calendar months; anything shorter is a quarter or a part-year. */
const MIN_YEAR_DAYS = 350;
const MAX_YEAR_DAYS = 380;

const DAY_MS = 86_400_000;

function daysBetween(start: string, end: string): number | null {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;

  return Math.round((to - from) / DAY_MS) + 1;
}

/** Whether a fact can stand for the figure of an annual report: from an annual form, a full year for flows, a single date for balances. */
export function isAnnualFact(fact: ConceptFact, kind: FigureKind): boolean {
  if (!isAnnualReportForm(fact.form)) return false;
  if (kind === "instant") return fact.start === undefined;
  if (fact.start === undefined) return false;

  const days = daysBetween(fact.start, fact.end);

  return days !== null && days >= MIN_YEAR_DAYS && days <= MAX_YEAR_DAYS;
}

/**
 * The latest annual fact across every unit: the latest period end, then the latest filing (a later report that repeats the year wins), then the unit with more facts (the company's reporting currency over an incidental one).
 * `null` when the company reports the tag only in quarterly or non-annual filings.
 */
export function latestAnnualFact(
  units: Record<string, ConceptFact[]>,
  kind: FigureKind,
): { unit: string; fact: ConceptFact } | null {
  let best: { unit: string; fact: ConceptFact; weight: number } | null = null;

  for (const [unit, facts] of Object.entries(units)) {
    for (const fact of facts) {
      if (!isAnnualFact(fact, kind)) continue;

      const better =
        best === null ||
        fact.end > best.fact.end ||
        (fact.end === best.fact.end &&
          (fact.filed > best.fact.filed ||
            (fact.filed === best.fact.filed && facts.length > best.weight)));

      if (better) best = { unit, fact, weight: facts.length };
    }
  }

  return best && { unit: best.unit, fact: best.fact };
}

/** The annual report the figures come from: the period they close and the filing that carries them. */
export interface FigureReport {
  periodEnd: string;
  form: string;
  filed: string;
}

/**
 * Keeps only the figures of one report: the latest period end, as carried by the latest filing for it. Any other figure becomes `null`, as if not reported.
 * Each tag's latest annual fact can come from a different year (TGS's latest `ProfitLoss` is from 2017, its other figures from 2024) or a different filing of the same year, and Argentine issuers restate for inflation, so mixed figures would not be comparable. One report also lets the page state its period, form and date once.
 */
export function alignToOneReport<Id extends string>(
  figures: Record<Id, ReportedFigure | null>,
): Record<Id, ReportedFigure | null> {
  const reference = Object.values<ReportedFigure | null>(
    figures,
  ).reduce<ReportedFigure | null>(
    (best, figure) =>
      figure &&
      (best === null ||
        figure.periodEnd > best.periodEnd ||
        (figure.periodEnd === best.periodEnd && figure.filed > best.filed))
        ? figure
        : best,
    null,
  );

  return Object.fromEntries(
    Object.entries<ReportedFigure | null>(figures).map(([id, figure]) => [
      id,
      figure &&
      reference &&
      figure.periodEnd === reference.periodEnd &&
      figure.accession === reference.accession
        ? figure
        : null,
    ]),
  ) as Record<Id, ReportedFigure | null>;
}

/** The report shared by figures that went through `alignToOneReport`; `null` when none is reported. */
export function figureReport(
  figures: Record<string, ReportedFigure | null>,
): FigureReport | null {
  const first = Object.values(figures).find((figure) => figure !== null);

  return first
    ? { periodEnd: first.periodEnd, form: first.form, filed: first.filed }
    : null;
}

export function toReportedFigure(
  taxonomy: Taxonomy,
  tag: string,
  { unit, fact }: { unit: string; fact: ConceptFact },
): ReportedFigure {
  return {
    value: fact.val,
    unit,
    periodStart: fact.start ?? null,
    periodEnd: fact.end,
    fiscalYear: fact.fy ?? null,
    form: fact.form,
    filed: fact.filed,
    accession: fact.accn,
    taxonomy,
    tag,
  };
}

/** A company resolved through the ticker file and confirmed by its submissions. */
export type IssuerRow =
  | {
      issuer: Issuer;
      status: "available";
      cik: number;
      /** The registrant name on EDGAR. */
      secName: string;
      latestAnnual: FilingRef | null;
    }
  /** The request failed; worth a retry. */
  | { issuer: Issuer; status: "unavailable" }
  /** The ticker is not in the SEC's file, or the CIK it maps to does not list it; a retry will not change that. */
  | { issuer: Issuer; status: "unresolved" };

export interface IssuerListData {
  /** One row per issuer, in table order; each one resolves on its own. */
  rows: IssuerRow[];
}

export interface CompanyFilingsData {
  issuer: Issuer;
  cik: number;
  secName: string;
  /** Listed forms only (`isListedFiling`), newest first, at most `RECENT_FILINGS_LIMIT`. */
  filings: FilingRef[];
  latestAnnual: FilingRef | null;
}

export interface CompanyFiguresData {
  /** The taxonomy the figures came from; `null` when no tag was found in either. */
  taxonomy: Taxonomy | null;
  /** `null` when the company does not report the tag in an annual filing. */
  figures: Record<FigureId, ReportedFigure | null>;
  /** Figures whose request failed (as opposed to a tag the company does not report). */
  missing: FigureId[];
}

/** An `EquityPanel` that can also be `unresolved`: the company could not be identified on EDGAR, which no retry will change. */
export type CompanyPanel<T> =
  EquityPanel<T> | { status: "unresolved"; data: null; freshness: null };

export const unresolvedPanel = <T>(): CompanyPanel<T> => ({
  status: "unresolved",
  data: null,
  freshness: null,
});

/** Whether the filings panel should trigger a background retry: a request failed. A company that could not be identified does not. */
export function filingsNeedRetry(
  panel:
    | EquityPanel<IssuerListData>
    | CompanyPanel<CompanyFilingsData | CompanyFiguresData>,
): boolean {
  if (panel.status === "unresolved") return false;
  if (panel.status === "unavailable") return true;

  const { data } = panel;

  if ("rows" in data)
    return data.rows.some((row) => row.status === "unavailable");

  if ("missing" in data) return data.missing.length > 0;

  return false;
}

/** `2026-04-28` → `28/04/2026`; `s/d` when missing. */
export function formatFilingDate(date: string | null): string {
  if (!date) return "s/d";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

const millions = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const smallMillions = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/**
 * A reported amount in its own unit, in millions when large: `ARS 1.234.567 M`, `USD 12,5 M`, `ARS -3.210 M`.
 * The unit code is kept as filed rather than mapped to a symbol, so a figure in pesos of one year is never mistaken for dollars.
 */
export function formatReportedAmount(value: number, unit: string): string {
  const magnitude = Math.abs(value);

  if (magnitude >= 1e7) return `${unit} ${millions.format(value / 1e6)} M`;
  if (magnitude >= 1e6) return `${unit} ${smallMillions.format(value / 1e6)} M`;

  return `${unit} ${whole.format(value)}`;
}

/** Spanish names of the forms the company view lists (`isListedFiling`), amendments included. */
const FORM_DESCRIPTIONS: Record<string, string> = {
  "20-F": "Informe anual",
  "20-F/A": "Modificación del informe anual",
  "10-K": "Informe anual",
  "10-K/A": "Modificación del informe anual",
  "40-F": "Informe anual",
  "40-F/A": "Modificación del informe anual",
  "10-Q": "Informe trimestral",
  "10-Q/A": "Modificación del informe trimestral",
  "6-K": "Informe de emisor extranjero",
  "6-K/A": "Modificación de informe de emisor extranjero",
  "8-K": "Hecho relevante",
  "8-K/A": "Modificación de hecho relevante",
};

/**
 * The forms an investor reads: annual and quarterly reports and current reports, with their amendments.
 * Insider holdings (Forms 3, 4 and 5), specialized disclosures (SD) and registrations are left out; they crowd out the reports for most of these issuers.
 */
export const isListedFiling = (form: string) => form in FORM_DESCRIPTIONS;

/** A filer description that only restates the form (`6-K`, `FORM 6-K`) or names the file (`PRIMARY DOCUMENT`) says nothing more than the form's name. */
function isGenericDescription(description: string, form: string): boolean {
  const text = description.trim().toUpperCase();

  return (
    text === form ||
    text === `FORM ${form}` ||
    /^(PRIMARY|MAIN) DOCUMENT$/.test(text) ||
    /^(EX|EXHIBIT)[\s-]/.test(text)
  );
}

/** The filer's own description when it says more than the form (e.g. `MATERIAL FACT`, as filed, in English), otherwise the form's Spanish name. */
export function describeFiling(filing: FilingRef): string {
  if (
    filing.description &&
    !isGenericDescription(filing.description, filing.form)
  )
    return filing.description;

  return FORM_DESCRIPTIONS[filing.form] ?? filing.form;
}
