import { describe, expect, it, vi } from "vitest";

import { getMonthlyInflationHistory } from "~/lib/indicators.server";
import { loader } from "./inflation-history";

vi.mock("~/lib/indicators.server", () => ({
  getMonthlyInflationHistory: vi.fn(),
}));

const requestArgs = (url: string) =>
  ({ request: new Request(url) }) as Parameters<typeof loader>[0];

describe("inflation history loader", () => {
  it("returns no points without calling upstream when previewing an outage", async () => {
    const response = await loader(
      requestArgs(
        "http://localhost/resources/inflation-history?preview=unavailable",
      ),
    );

    expect(getMonthlyInflationHistory).not.toHaveBeenCalled();
    expect(response.data).toEqual({ points: null });
  });
});
