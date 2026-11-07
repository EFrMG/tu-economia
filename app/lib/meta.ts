import ogImage from "~/assets/OG-image.png";

import { SITE_NAME, SITE_URL } from "./site";

interface PageMeta {
  /** Page title without the site suffix; omit on the landing page. */
  title?: string;
  description: string;
  path: string;
  /** Pages with no content yet should stay out of the index. */
  noIndex?: boolean;
}

/**
 * Builds the title, canonical and social-card descriptors for a route, so every page ships a consistent card instead of hand-rolling tags per route.
 */
export function pageMeta({ title, description, path, noIndex }: PageMeta) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const url = `${SITE_URL}${path}`;
  const imageUrl = `${SITE_URL}${ogImage}`;

  return [
    { title: fullTitle },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },

    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "es_AR" },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: imageUrl },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "El mercado argentino." },

    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:image:alt", content: "El mercado argentino." },

    ...(noIndex ? [{ name: "robots", content: "noindex, follow" }] : []),
  ];
}

/** Metadata for error documents, which must not advertise a canonical URL or a social card. */
export function errorMeta({ notFound }: { notFound: boolean }) {
  const title = notFound ? "Página no encontrada" : "Error inesperado";
  const description = notFound
    ? "La ruta solicitada no existe o se movió de lugar."
    : "Ocurrió un problema al procesar la solicitud.";

  return [
    { title: `${title} | ${SITE_NAME}` },
    { name: "description", content: description },
    { name: "robots", content: "noindex" },
  ];
}
