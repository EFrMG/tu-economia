import { SITE_URL } from "~/lib/site";

const INDEXED_PATHS = [
  "/",
  "/dashboard",
  "/analisis",
  "/indicadores",
  "/acciones",
  "/noticias",
  "/docs",
  "/terms",
  "/privacy",
] as const;

export function loader() {
  const urls = INDEXED_PATHS.map(
    (path) => `  <url><loc>${SITE_URL}${path}</loc></url>`,
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
