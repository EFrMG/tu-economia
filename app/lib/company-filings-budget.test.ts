import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIGURES, ISSUERS, TAXONOMIES } from "~/lib/company-filings";

/** Subrequests one Worker invocation may make. */
const SUBREQUEST_LIMIT = 50;

/** Synthetic CIKs; every issuer resolves, every concept answers 404, which is the most expensive path (the us-gaap fallback). */
function countingFetch() {
  const cikOf = new Map(
    ISSUERS.map((issuer, index) => [9_000_001 + index, issuer.ticker]),
  );

  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);

    if (url.endsWith("/files/company_tickers.json"))
      return Response.json(
        Object.fromEntries(
          [...cikOf].map(([cik, ticker], index) => [
            String(index),
            { cik_str: cik, ticker, title: ticker },
          ]),
        ),
      );

    const submissions = /submissions\/CIK(\d{10})\.json$/.exec(url);

    if (submissions)
      return Response.json({
        tickers: [cikOf.get(Number(submissions[1]))],
        filings: {
          recent: {
            accessionNumber: ["0001-26-000001"],
            filingDate: ["2026-04-28"],
            form: ["20-F"],
            primaryDocument: ["d20f.htm"],
          },
        },
      });

    return new Response("Not found", { status: 404 });
  });
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();

  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Runs against the real issuer table, so growing it past the Worker limit fails here before it fails in production. */
describe("SEC EDGAR subrequest budget", () => {
  it("costs one ticker lookup plus one submissions request per issuer for the list", async () => {
    const fetch = countingFetch();
    vi.stubGlobal("fetch", fetch);
    const { getIssuerList } = await import("~/lib/company-filings.server");

    await settle(getIssuerList());

    expect(fetch).toHaveBeenCalledTimes(1 + ISSUERS.length);
    expect(fetch.mock.calls.length).toBeLessThan(SUBREQUEST_LIMIT);
  });

  it("keeps a cold company view, filings and figures together, well under the limit", async () => {
    const fetch = countingFetch();
    vi.stubGlobal("fetch", fetch);

    const { getCompanyFigures, getCompanyFilings } =
      await import("~/lib/company-filings.server");

    await settle(
      Promise.all([
        getCompanyFilings(ISSUERS[0].ticker),
        getCompanyFigures(ISSUERS[0].ticker),
      ]),
    );

    // Ticker file, submissions, then every tag in both taxonomies.
    expect(fetch).toHaveBeenCalledTimes(2 + FIGURES.length * TAXONOMIES.length);
    expect(fetch.mock.calls.length).toBeLessThan(SUBREQUEST_LIMIT);
  });
});
