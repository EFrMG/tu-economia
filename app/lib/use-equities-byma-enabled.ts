import { useRouteLoaderData } from "react-router";

/** What the terminal layout's loader passes to every terminal page. */
export interface TerminalLayoutData {
  /** `EQUITIES_BYMA_ENABLED`, read on the server; a deploy-time constant. */
  equitiesBymaEnabled: boolean;
  /** `BOLETIN_DIGEST_ENABLED`, read on the server; a deploy-time constant. */
  boletinDigestEnabled: boolean;
}

/** The BYMA flag for components without loader data of their own (hydration fallbacks, error boundaries); off when the layout data is missing. */
export function useEquitiesBymaEnabled(): boolean {
  return (
    useRouteLoaderData<TerminalLayoutData>("layouts/terminal")
      ?.equitiesBymaEnabled ?? false
  );
}

/** The Boletín Oficial flag for components without loader data of their own; off when the layout data is missing. */
export function useBoletinDigestEnabled(): boolean {
  return (
    useRouteLoaderData<TerminalLayoutData>("layouts/terminal")
      ?.boletinDigestEnabled ?? false
  );
}
