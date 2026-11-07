export const NEWS_SOURCES = [
  {
    id: "iprofesional",
    name: "iProfesional",
    url: "https://www.iprofesional.com/rss/economia",
  },
  {
    id: "clarin",
    name: "Clarín",
    url: "https://www.clarin.com/rss/economia/",
  },
  {
    id: "pagina-12",
    name: "Página/12",
    url: "https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas",
  },
] as const;

export type NewsSource = (typeof NEWS_SOURCES)[number];
export type NewsSourceId = NewsSource["id"];

export interface NewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  link: string;
  summary?: string;
}

export interface EconomicNews {
  items: NewsItem[];
  unavailableSources: NewsSourceId[];
}
