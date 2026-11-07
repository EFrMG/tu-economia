import { data } from "react-router";

import type { Route } from "./+types/prices-api";
import { isUnavailablePreview } from "~/lib/data-preview";
import { pageMeta } from "~/lib/meta";
import {
  DEFAULT_PRICE_LOCATION_ID,
  MAX_PRICE_FAVORITES,
  isPriceItemId,
  locationById,
  type PricesResponse,
  type ProductPrices,
} from "~/lib/prices";
import { getItemPrices } from "~/lib/prices.server";
import { isRateLimited } from "~/lib/rate-limit.server";
import { workerEnvContext } from "~/lib/worker-context";

const headers = { "Cache-Control": "private, no-store" };

/** The limiter's window in seconds, matching `PRICES_LIMITER` in wrangler.jsonc. */
const RATE_LIMIT_PERIOD_SECONDS = 60;

const unavailable = (id: string): ProductPrices => ({
  id,
  chains: null,
  unit: null,
  snapshot: false,
});

export function meta() {
  return pageMeta({
    title: "Precios de consumo",
    description:
      "Precios de productos de consumo por cadena cerca de una ubicación, según el SEPA.",
    path: "/resources/prices",
    noIndex: true,
  });
}

/**
 * `?location=&ids=a,b` returns each saved item's prices by chain.
 *
 * With at most MAX_PRICE_FAVORITES items, each costing one upstream call or one per nearby group member, a request stays well under the 50 subrequests a Worker invocation allows. `prices-budget.test.ts` checks the worst case against the generated basket.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;

  const location = locationById(
    params.get("location") ?? DEFAULT_PRICE_LOCATION_ID,
  );

  if (!location) throw data("Ubicación desconocida.", { status: 400 });

  const ids = [
    ...new Set((params.get("ids") ?? "").split(",").filter(isPriceItemId)),
  ].slice(0, MAX_PRICE_FAVORITES);

  if (isUnavailablePreview(params))
    return data(
      { location: location.id, products: ids.map(unavailable) },
      { headers },
    );

  // Returned rather than thrown, so the tab shows its usual "no disponible" rows instead of an error page.
  if (
    ids.length &&
    (await isRateLimited(context.get(workerEnvContext).PRICES_LIMITER, request))
  )
    return data(
      { location: location.id, products: ids.map(unavailable) },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(RATE_LIMIT_PERIOD_SECONDS),
        },
      },
    );

  const products: ProductPrices[] = await Promise.all(
    ids.map((id) => getItemPrices(id, location).catch(() => unavailable(id))),
  );

  return data({ location: location.id, products } satisfies PricesResponse, {
    headers,
  });
}
