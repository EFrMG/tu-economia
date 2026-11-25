import { SITE_URL } from "~/lib/site";
import { CARD_PARAMS, LOAN_PARAMS } from "~/lib/transparency-rates";

/**
 * Every filter and page of the Tasas panels is its own URL, each a full server render, while the page's canonical is the bare path.
 * Crawlers keep to the two panels (`?panel=` alone), which list the same lenders the filtered and later pages do.
 */
const TASAS_VARIANTS = [...new Set([...LOAN_PARAMS, ...CARD_PARAMS])].map(
  (param) => `Disallow: /tasas?*${param}=`,
);

export const ROBOTS_TXT = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /api/",
  ...TASAS_VARIANTS,
  `Sitemap: ${SITE_URL}/sitemap.xml`,
  "",
].join("\n");

export function loader() {
  return new Response(ROBOTS_TXT, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
