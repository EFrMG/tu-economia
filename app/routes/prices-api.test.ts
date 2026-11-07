import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getItemPrices } from "~/lib/prices.server";
import { workerEnvContext } from "~/lib/worker-context";
import { loader } from "./prices-api";

vi.mock("~/lib/prices.server", () => ({ getItemPrices: vi.fn() }));

beforeEach(() => vi.mocked(getItemPrices).mockReset());

const requestArgs = (
  url: string,
  env: Partial<CloudflareEnvironment> = {},
  ip?: string,
) => {
  const context = new RouterContextProvider();
  context.set(workerEnvContext, env);

  return {
    request: new Request(url, {
      headers: ip ? { "CF-Connecting-IP": ip } : {},
    }),
    context,
  } as unknown as Parameters<typeof loader>[0];
};

const pricesUrl =
  "http://localhost/resources/prices?location=caba&ids=7790742348302,huevos";

const limiter = (success: boolean) =>
  ({ limit: vi.fn(async () => ({ success })) }) satisfies RateLimit;

describe("prices api loader", () => {
  it("returns unavailable rows without calling upstream when previewing an outage", async () => {
    const response = await loader(
      requestArgs(
        "http://localhost/resources/prices?location=caba&ids=7790742348302,huevos&preview=unavailable",
      ),
    );

    expect(getItemPrices).not.toHaveBeenCalled();
    expect(response.data).toEqual({
      location: "caba",
      products: [
        { id: "7790742348302", chains: null, unit: null, snapshot: false },
        { id: "huevos", chains: null, unit: null, snapshot: false },
      ],
    });
  });

  it("answers 429 with unavailable rows and no upstream calls once the client exceeds the limit", async () => {
    const refusing = limiter(false);

    const response = await loader(
      requestArgs(pricesUrl, { PRICES_LIMITER: refusing }, "203.0.113.7"),
    );

    expect(getItemPrices).not.toHaveBeenCalled();
    expect(refusing.limit).toHaveBeenCalledWith({ key: "203.0.113.7" });
    expect(response.init?.status).toBe(429);
    expect(response.init?.headers).toMatchObject({ "Retry-After": "60" });
    expect(response.data).toEqual({
      location: "caba",
      products: [
        { id: "7790742348302", chains: null, unit: null, snapshot: false },
        { id: "huevos", chains: null, unit: null, snapshot: false },
      ],
    });
  });

  it("prices normally within the limit, without a binding, and does not spend the limit on an empty request", async () => {
    vi.mocked(getItemPrices).mockResolvedValue({
      id: "x",
      chains: [],
      unit: null,
      snapshot: false,
    });

    const allowing = limiter(true);

    await loader(
      requestArgs(pricesUrl, { PRICES_LIMITER: allowing }, "203.0.113.7"),
    );
    expect(getItemPrices).toHaveBeenCalledTimes(2);

    await loader(requestArgs(pricesUrl));
    expect(getItemPrices).toHaveBeenCalledTimes(4);

    await loader(
      requestArgs(
        "http://localhost/resources/prices?location=caba",
        { PRICES_LIMITER: allowing },
        "203.0.113.7",
      ),
    );

    expect(allowing.limit).toHaveBeenCalledTimes(1);
  });
});
