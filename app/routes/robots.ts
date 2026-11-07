import { SITE_URL } from "~/lib/site";

export function loader() {
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}
