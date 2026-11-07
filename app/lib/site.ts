/** Single source of truth for the identity the app presents to the outside. */

export const SITE_NAME = "Tu Economía";

/** Browser chrome cannot read CSS variables from the server-rendered document. Keep this aligned with `--color-base-950`. */
export const SITE_THEME_COLOR = "#131314";

export const SITE_TAGLINE = "Resiliencia Financiera Argentina";

/**
 * Absolute origin, needed for canonical and OpenGraph URLs. Set `VITE_SITE_URL` per environment; the fallback only keeps previews sane in local development.
 */
const configuredSiteUrl = import.meta.env.VITE_SITE_URL;

if (import.meta.env.PROD && !configuredSiteUrl) {
  throw new Error(
    "VITE_SITE_URL is required for production builds: canonical and OpenGraph URLs cannot fall back to localhost.",
  );
}

export const SITE_URL = (configuredSiteUrl ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
