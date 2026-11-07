import { describe, expect, it } from "vitest";

import {
  BASKET_CATEGORIES,
  MAX_PRICE_FAVORITES,
  PRICE_LOCATIONS,
  basketItemId,
  isPriceItemId,
} from "~/lib/prices";
import { upstreamCallsFor } from "~/lib/prices.server";

/** Subrequests one Worker invocation may make. */
const SUBREQUEST_LIMIT = 50;

/** Runs against the real generated basket, so growing a group or a location's branch list fails here before it fails in production. */
describe("Precios subrequest budget", () => {
  it("covers every location and every basket item", () => {
    expect(PRICE_LOCATIONS.length).toBeGreaterThan(0);
    expect(BASKET_CATEGORIES.length).toBeGreaterThan(0);

    for (const category of BASKET_CATEGORIES)
      expect(isPriceItemId(basketItemId(category))).toBe(true);
  });

  it("keeps the most expensive full set of saved items under the Worker limit in every location", () => {
    const ids = BASKET_CATEGORIES.map(basketItemId);

    for (const location of PRICE_LOCATIONS) {
      const worstCase = ids
        .map((id) => upstreamCallsFor(id, location))
        .sort((left, right) => right - left)
        .slice(0, MAX_PRICE_FAVORITES)
        .reduce((total, calls) => total + calls, 0);

      expect(
        worstCase,
        `${location.id} needs ${worstCase} subrequests`,
      ).toBeLessThan(SUBREQUEST_LIMIT);
    }
  });

  it("prices a single product with one call and a fresh item with none", () => {
    const location = PRICE_LOCATIONS[0];

    const product = BASKET_CATEGORIES.find(
      (category) => category.kind === "product",
    )!;

    const fresh = BASKET_CATEGORIES.find(
      (category) => category.kind === "fresh",
    )!;

    expect(upstreamCallsFor(basketItemId(product), location)).toBe(1);
    expect(upstreamCallsFor(basketItemId(fresh), location)).toBe(0);
  });
});
