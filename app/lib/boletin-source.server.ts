import { decode } from "html-entities";
import { z } from "zod";

// Reading the Boletín Oficial's first section. There is no API or feed: the section page and each notice page are server-rendered HTML, read here with a few anchored patterns over the string.

export const BOLETIN_ORIGIN = "https://www.boletinoficial.gob.ar";
export const LISTING_URL = `${BOLETIN_ORIGIN}/seccion/primera`;

export const noticeUrl = (id: string, editionDate: string) =>
  `${BOLETIN_ORIGIN}/detalleAviso/primera/${id}/${editionDate.replaceAll("-", "")}`;

/**
 * The section page's contingency mode, seen on 2026-11-23: instead of the listing, the whole edition embedded as a base64 PDF of several MB, with no notice links. The iframe that shows it comes about 21 KB into the page, before the PDF.
 */
export const isContingencyPage = (html: string) =>
  html.includes('id="iframeContingencia"');

/** About 5k tokens. The longest operative text on 2026-11-19 was 8,610 characters; a longer one is cut at an article boundary and summarized as partial. */
export const MAX_OPERATIVE_CHARS = 16_000;

export interface ListedNotice {
  id: string;
  /** YYYY-MM-DD */
  editionDate: string;
  position: number;
  rubro: string;
  /** The listing's first line: the issuing agency, or the subject for decrees. */
  heading: string;
  norm: string;
  hasAnnexes: boolean;
}

const listedNoticeSchema = z.object({
  id: z.string().regex(/^\d{1,12}$/),
  editionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  position: z.number().int().nonnegative(),
  rubro: z.string().min(1).max(200),
  heading: z.string().min(1).max(500),
  norm: z.string().max(1000),
  hasAnnexes: z.boolean(),
});

const LISTING_TOKEN =
  /<h5\b[^>]*\bclass="[^"]*\bseccion-rubro\b[^"]*"[^>]*>([\s\S]*?)<\/h5>|<a\b[^>]*\bhref="\/detalleAviso\/primera\/(\d+)\/(\d{8})(\?anexos=1)?"[^>]*>([\s\S]*?)<\/a>/g;

const LISTING_LINE =
  /<p\b[^>]*\bclass="(item|item-detalle)"[^>]*>([\s\S]*?)<\/p>/g;

const plainText = (html: string) =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** The notices of the section page in listing order, each under the rubro heading that precedes it. Entries that fail validation are dropped. */
export function parseListing(html: string): ListedNotice[] {
  let rubro = "";

  const notices = new Map<string, Omit<ListedNotice, "hasAnnexes">>();
  const withAnnexes = new Set<string>();

  for (const match of html.matchAll(LISTING_TOKEN)) {
    const [, heading, id, compactDate, annexes, inner] = match;

    if (heading !== undefined) {
      rubro = plainText(heading);
      continue;
    }

    // The paperclip link (`?anexos=1`) sits next to the notice link and only marks that annexes exist.
    if (annexes) {
      withAnnexes.add(id);
      continue;
    }

    if (notices.has(id)) continue;

    const lines = [...inner.matchAll(LISTING_LINE)];
    const first = lines.find(([, kind]) => kind === "item");

    const details = lines
      .filter(([, kind]) => kind === "item-detalle")
      .map(([, , text]) => plainText(text))
      .filter(Boolean);

    notices.set(id, {
      id,
      editionDate: `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6)}`,
      position: notices.size,
      rubro,
      heading: first ? plainText(first[2]) : "",
      norm: details.join(" · "),
    });
  }

  return [...notices.values()].flatMap((notice) => {
    const parsed = listedNoticeSchema.safeParse({
      ...notice,
      hasAnnexes: withAnnexes.has(notice.id),
    });

    return parsed.success ? [parsed.data] : [];
  });
}

/** Decrees are kept whatever their subject; the other rubros only from the agencies below. Collective agreements and repeated earlier notices ("Avisos oficiales - Anterior") are left out. */
const RUBROS_ANY_HEADING = new Set(["DECRETOS"]);

const RUBROS_BY_AGENCY = new Set([
  "RESOLUCIONES",
  "RESOLUCIONES GENERALES",
  "RESOLUCIONES CONJUNTAS",
  "RESOLUCIONES SINTETIZADAS",
  "DISPOSICIONES",
  "AVISOS OFICIALES",
]);

/** Agencies whose norms tend to affect households: ARCA, Economía and its secretariats, Energía, the electricity and gas regulators, the BCRA, Capital Humano and ANSES, Comercio. */
const HOUSEHOLD_AGENCIES = [
  "AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO",
  "MINISTERIO DE ECONOMÍA",
  "SECRETARÍA DE ENERGÍA",
  "ENTE NACIONAL REGULADOR DEL GAS Y LA ELECTRICIDAD",
  "ENTE NACIONAL REGULADOR DE LA ELECTRICIDAD",
  "ENTE NACIONAL REGULADOR DEL GAS",
  "BANCO CENTRAL DE LA REPÚBLICA ARGENTINA",
  "MINISTERIO DE CAPITAL HUMANO",
  "ADMINISTRACIÓN NACIONAL DE LA SEGURIDAD SOCIAL",
  "SECRETARÍA DE INDUSTRIA Y COMERCIO",
  "SECRETARÍA DE COMERCIO",
];

/** Customs offices and regional directorates publish edicts that cite named people; Capital Humano's labour directorate publishes collective agreements. */
const EXCLUDED_AGENCY_PARTS = [
  "- ADUANA ",
  "DIRECCIÓN REGIONAL",
  "RELACIONES Y REGULACIONES DEL TRABAJO",
];

/** The listing-level filter, applied when an edition is collected. The notice text gets a second, stricter look in `exclusionReason`. */
export function isRelevantListing(notice: ListedNotice) {
  const rubro = notice.rubro.toUpperCase();
  const heading = notice.heading.toUpperCase();

  if (RUBROS_ANY_HEADING.has(rubro)) return true;
  if (!RUBROS_BY_AGENCY.has(rubro)) return false;
  if (EXCLUDED_AGENCY_PARTS.some((part) => `${heading} `.includes(part)))
    return false;

  return HOUSEHOLD_AGENCIES.some((agency) => heading.includes(agency));
}

/** The text of `div#cuerpoDetalleAviso`, one line per paragraph, without its inline style block. Null when the page has no such element. */
export function parseNoticeBody(html: string): string | null {
  const start = html.search(/<div\b[^>]*\bid="cuerpoDetalleAviso"[^>]*>/);
  if (start < 0) return null;

  const open = html.indexOf(">", start) + 1;
  const divTag = /<\/?div\b[^>]*>/gi;
  divTag.lastIndex = open;

  let depth = 1;
  let end = html.length;

  for (let tag = divTag.exec(html); tag; tag = divTag.exec(html)) {
    depth += tag[0][1] === "/" ? -1 : 1;

    if (depth === 0) {
      end = tag.index;
      break;
    }
  }

  const text = decode(
    html
      .slice(open, end)
      .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(?:p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );

  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** A DNI number next to its label, or a CUIT/CUIL with a natural person's prefix (20, 23, 24, 27); companies' CUITs start with 30, 33 or 34. A bare 12.345.678 cannot be told from an amount, so it does not count. */
const PERSONAL_DATA = [
  /\b(?:D\.?\s?N\.?\s?I\.?|documento nacional de identidad)\s*(?:N(?:ro\.?|[°º.])?\s*)?:?\s*\d{1,2}\.?\d{3}\.?\d{3}\b/i,
  /\bCUI[TL]\s*(?:N(?:ro\.?|[°º.])?\s*)?:?\s*(?:20|23|24|27)-?\d{8}-?\d\b/i,
  /(?<![\d.-])(?:20|23|24|27)-\d{8}-\d(?![\d-])/,
];

export const containsPersonalData = (text: string) =>
  PERSONAL_DATA.some((pattern) => pattern.test(text));

/** Words in a first article that mark an act about a person: appointments, resignations, appeals, disciplinary proceedings, individual benefits. Most of these acts also carry a DNI, which `containsPersonalData` catches first; words like "recursos" or "a cargo de" are too common in ordinary norms to count. */
const INDIVIDUAL_ACT =
  /\b(?:des[ií]gn\w*|renuncia\w*|recurso (?:jer[áa]rquico|de reconsideraci[oó]n|de alzada)|sumario\w*|cesant[ií]a\w*|ap[ée]rcib\w*|llamado de atenci[oó]n|licencia sin goce|pensi[oó]n graciable)\b/i;

const EDICT = /\bEDICTO\b|\bc[íi]tase\b|\bempl[áa]zase\b/i;

const OPERATIVE_MARKER =
  /\b(?:RESUELVE|RESUELVEN|DECRETA|DISPONE|DISPONEN|ACUERDA|ACUERDAN|ORDENA)\s*:/;

const ARTICLE_START = /^ART[ÍI]CULO\s+\d/gm;

/** The closing article ("Comuníquese, publíquese...") and the signatures after it. */
const CLOSING_ARTICLE =
  /^ART[ÍI]CULO\s+\d+\s*[°º]?\s*\.?\s*-?\s*Comun[íi]quese\b[\s\S]*$/im;

/** Signature lines of summarized notices ("Fdo. … – Superintendente…"). */
const SIGNATURE_LINE = /^Fdo\..*$/gim;

/** The publication stamp at the end of a notice: "e. 19/11/2026 N° 12345/26 v. 19/11/2026". */
const PUBLICATION_STAMP = /\n\s*e\.\s*\d{2}\/\d{2}\/\d{4}\s*N[°º][\s\S]*$/;

const firstArticle = (operative: string) => {
  const starts = [...operative.matchAll(ARTICLE_START)].map(
    (match) => match.index,
  );

  return starts.length > 0
    ? operative.slice(starts[0], starts[1] ?? starts[0] + 600)
    : operative.slice(0, 600);
};

/** Why a notice is left out entirely (never shown), or null to summarize it. */
export function exclusionReason(
  body: string,
): "personal-data" | "individual-act" | "edict" | null {
  if (containsPersonalData(body)) return "personal-data";
  if (EDICT.test(body)) return "edict";

  const { text } = operativeText(body);
  if (INDIVIDUAL_ACT.test(firstArticle(text))) return "individual-act";

  return null;
}

/** The last article start within the limit; else the last line break past half of it; else the limit itself. */
function cutPoint(text: string, limit: number) {
  const articles = [...text.matchAll(ARTICLE_START)]
    .map((match) => match.index)
    .filter((index) => index > 0 && index <= limit);

  if (articles.length > 0) return articles.at(-1)!;

  const lineBreak = text.lastIndexOf("\n", limit);

  return lineBreak > limit / 2 ? lineBreak : limit;
}

export interface OperativeText {
  text: string;
  /** Cut before the article that would cross the limit; the summary is then partial. */
  truncated: boolean;
  /** Length of the whole operative part, before any cut. */
  fullLength: number;
}

/** The articles after RESUELVE:/DECRETA:/…, without the closing article, the signatures and the publication stamp. Notices without that marker (summaries, notices) keep their whole body. */
export function operativeText(
  body: string,
  limit = MAX_OPERATIVE_CHARS,
): OperativeText {
  const marker = OPERATIVE_MARKER.exec(body);

  const text = (marker ? body.slice(marker.index) : body)
    .replace(PUBLICATION_STAMP, "")
    .replace(CLOSING_ARTICLE, "")
    .replace(SIGNATURE_LINE, "")
    .trim();

  if (text.length <= limit)
    return { text, truncated: false, fullLength: text.length };

  return {
    text: text.slice(0, cutPoint(text, limit)).trimEnd(),
    truncated: true,
    fullLength: text.length,
  };
}
