/** Local-only preview of unavailable upstream data; ignored in production builds. */
export function isUnavailablePreview(searchParams: URLSearchParams): boolean {
  return import.meta.env.DEV && searchParams.get("preview") === "unavailable";
}

/** Adds the dev-only preview flag to a resource request made from a page that is previewing unavailable data. */
export function withUnavailablePreview(href: string, preview: boolean): string {
  if (!import.meta.env.DEV || !preview) return href;

  const url = new URL(href, "https://preview.invalid");

  url.searchParams.set("preview", "unavailable");

  return `${url.pathname}${url.search}`;
}
