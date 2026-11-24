/** The `/noticias` panels: the news feeds and, while the digest is enabled, the Boletín Oficial. */
export const NEWS_PANELS = [
  { id: "medios", label: "Medios" },
  { id: "boletin", label: "Boletín Oficial" },
] as const;

export type NewsPanelId = (typeof NEWS_PANELS)[number]["id"];

export const DEFAULT_NEWS_PANEL: NewsPanelId = "medios";

export const isNewsPanel = (value: string | null): value is NewsPanelId =>
  NEWS_PANELS.some((panel) => panel.id === value);

/** The requested `?panel=`, or the news feeds; the Boletín panel does not exist while the digest is off. */
export const resolveNewsPanel = (
  requested: string | null,
  boletinEnabled: boolean,
): NewsPanelId =>
  isNewsPanel(requested) && (requested !== "boletin" || boletinEnabled)
    ? requested
    : DEFAULT_NEWS_PANEL;

/** `BOLETIN_DIGEST_ENABLED`: the cron collects nothing and pages show no Boletín content until it is "true". */
export const isBoletinDigestEnabled = (env: {
  BOLETIN_DIGEST_ENABLED?: string;
}) => env.BOLETIN_DIGEST_ENABLED === "true";

/** The sidebar and page name once the Boletín panel exists. */
export const newsLabel = (boletinEnabled: boolean) =>
  boletinEnabled ? "Noticias y normativa" : "Noticias";

export type BoletinNoticeStatus = "summarized" | "title_only";

export interface BoletinNotice {
  id: string;
  url: string;
  rubro: string;
  /** The listing's first line: the issuing agency, or the subject for decrees. */
  heading: string;
  /** The norm's number and official reference, as the listing shows them. */
  norm: string;
  hasAnnexes: boolean;
  /** `title_only` when the summary was not generated or did not pass the checks; the card then shows the official reference alone. */
  status: BoletinNoticeStatus;
  title: string | null;
  summary: string | null;
  points: string[];
  affectsHouseholds: boolean;
  /** The summary covers only the first articles of a long notice. */
  partial: boolean;
}

export interface BoletinDigest {
  /** YYYY-MM-DD; null before the first edition is collected. */
  editionDate: string | null;
  notices: BoletinNotice[];
  /** Notices of the edition still waiting for their summary. */
  pending: number;
  /** The kept editions just before and after this one, for the edition bar; null at either end. */
  previous: string | null;
  next: string | null;
}

const EDITION_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/** The `?edicion=` value when it is a date; anything else means the latest edition. */
export const editionParam = (value: string | null) =>
  value !== null && EDITION_PARAM.test(value) ? value : null;

/** The Boletín panel at one edition. */
export const boletinEditionHref = (editionDate: string) =>
  `/noticias?panel=boletin&edicion=${editionDate}`;

/** How many notices the Resumen card shows. */
export const RESUMEN_BOLETIN_LIMIT = 3;

/** The Resumen card's notices: household summaries of every kept edition, newest first, then the latest edition's other summaries. */
export interface BoletinResumen {
  /** The latest edition on screen; null before the first edition is collected. */
  editionDate: string | null;
  notices: BoletinNotice[];
}

/** The card headline: the generated title, or the official reference when there is none. */
export const noticeHeadline = (notice: BoletinNotice) =>
  notice.title ?? `${notice.heading} · ${notice.norm}`;

const editionDateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
  timeZone: "UTC",
});

/** "19 de noviembre de 2026" for "2026-11-19". */
export const formatEditionDate = (date: string) =>
  editionDateFormat.format(new Date(`${date}T12:00:00Z`));
