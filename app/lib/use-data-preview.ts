import { useLocation } from "react-router";

import { isUnavailablePreview } from "~/lib/data-preview";

/** Reads the dev-only unavailable-data preview flag from the current URL. */
export function useDataPreview(): boolean {
  const location = useLocation();

  return isUnavailablePreview(new URLSearchParams(location.search));
}
