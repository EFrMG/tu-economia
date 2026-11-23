import { data } from "react-router";

import type { Route } from "./+types/inflation-history";
import { isUnavailablePreview } from "~/lib/data-preview";
import { getMonthlyInflationHistory } from "~/lib/indicators.server";
import { pageMeta } from "~/lib/meta";
import { workerEnvContext } from "~/lib/worker-context";

export function meta() {
  return pageMeta({
    title: "Historial de inflación",
    description:
      "Serie mensual pública del IPC utilizada para comparar el poder adquisitivo del sueldo.",
    path: "/resources/inflation-history",
    noIndex: true,
  });
}

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
const PUBLIC_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const preview = isUnavailablePreview(new URL(request.url).searchParams);

  try {
    const points = preview
      ? null
      : await getMonthlyInflationHistory(context.get(workerEnvContext));

    const headers = points === null ? PRIVATE_HEADERS : PUBLIC_HEADERS;
    return data({ points }, { headers });
  } catch {
    return data({ points: null }, { headers: PRIVATE_HEADERS });
  }
}
