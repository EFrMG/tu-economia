import { SITE_URL } from "~/lib/site";
import {
  CARD_PARAMS,
  LOAN_PARAMS,
  MORTGAGE_PARAMS,
} from "~/lib/transparency-rates";

/**
 * Every filter and page of the Tasas panels is its own URL, each a full server render, while the page's canonical is the bare path.
 * Crawlers keep to the three panels (`?panel=` alone), which list the same lenders the filtered and later pages do.
 */
const TASAS_VARIANTS = [
  ...new Set([...LOAN_PARAMS, ...MORTGAGE_PARAMS, ...CARD_PARAMS]),
].map((param) => `Disallow: /tasas?*${param}=`);

/**
 * Mi economía links each month to the one before and after it, so its `?month=` and `?tab=` variants have no end, and each is a full server render.
 * The bare path stays crawlable so crawlers can still read its `noindex`.
 */
const MI_ECONOMIA_VARIANTS = "Disallow: /mi-economia?";

export const ROBOTS_TXT = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /resources/",
  ...TASAS_VARIANTS,
  MI_ECONOMIA_VARIANTS,
  `Sitemap: ${SITE_URL}/sitemap.xml`,
  "",
].join("\n");

export function loader() {
  return new Response(ROBOTS_TXT, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
