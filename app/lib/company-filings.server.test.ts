import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ISSUERS } from "~/lib/company-filings";
import recorded from "~/lib/company-filings.server.fixtures.json";

/** Synthetic CIKs: the tests never assume real ones. */
const CIK = Object.fromEntries(
  ISSUERS.map((issuer, index) => [issuer.ticker, 9_000_001 + index]),
);

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

const tickerFile = (
  overrides: Record<string, number | undefined> = {},
): Record<string, unknown> =>
  Object.fromEntries(
    [
      ...ISSUERS.flatMap((issuer) => {
        const cik =
          issuer.ticker in overrides
            ? overrides[issuer.ticker]
            : CIK[issuer.ticker];

        return cik === undefined
          ? []
          : [
              {
                cik_str: cik,
                ticker: issuer.ticker,
                title: `${issuer.name} SA`,
              },
            ];
      }),
      { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
      { ticker: "BROKEN" },
    ].map((entry, index) => [String(index), entry]),
  );

const submissions = (ticker: string, cik = CIK[ticker]) => ({
  cik: String(cik),
  entityType: "operating",
  name: `${ticker} REGISTRANT`,
  tickers: [ticker],
  exchanges: ["NYSE"],
  sicDescription: "Crude Petroleum & Natural Gas",
  filings: {
    recent: {
      accessionNumber: ["0001-26-000003", "0001-26-000002", "0001-25-000001"],
      filingDate: ["2026-05-02", "2026-04-28", "2025-04-25"],
      reportDate: ["", "2025-12-31", "2024-12-31"],
      acceptanceDateTime: ["", "", ""],
      form: ["6-K", "20-F", "20-F"],
      primaryDocument: ["d6k.htm", "d20f.htm", "d20f-2024.htm"],
      primaryDocDescription: ["6-K", "20-F", "20-F"],
    },
    files: [],
  },
});

const concept = (
  taxonomy: string,
  tag: string,
  units: Record<string, unknown[]>,
) => ({
  cik: 1,
  taxonomy,
  tag,
  label: tag,
  description: "",
  entityName: "X",
  units,
});

const annual = (val: number, extra: Record<string, unknown> = {}) => ({
  end: "2025-12-31",
  val,
  accn: "0001-26-000002",
  fy: 2025,
  fp: "FY",
  form: "20-F",
  filed: "2026-04-28",
  frame: "CY2025",
  ...extra,
});

type Handler = (url: string) => Response | Promise<Response>;

/** Answers the ticker file, every issuer's submissions, and the concepts in `concepts` (keyed `taxonomy/tag`); everything else is 404. */
function secFetch({
  tickers = () => Response.json(tickerFile()),
  submissionsFor = (ticker: string) => Response.json(submissions(ticker)),
  concepts = {},
}: {
  tickers?: Handler;
  submissionsFor?: (ticker: string) => Response;
  concepts?: Record<string, unknown>;
} = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);

    if (url === TICKERS_URL) return tickers(url);

    const submissionsMatch = /submissions\/CIK(\d{10})\.json$/.exec(url);

    if (submissionsMatch) {
      const cik = Number(submissionsMatch[1]);
      const ticker = Object.keys(CIK).find((key) => CIK[key] === cik)!;

      return submissionsFor(ticker);
    }

    const conceptMatch =
      /companyconcept\/CIK\d{10}\/([^/]+)\/([^/]+)\.json$/.exec(url);

    if (conceptMatch) {
      const body = concepts[`${conceptMatch[1]}/${conceptMatch[2]}`];

      return body === undefined
        ? new Response("Not found", { status: 404 })
        : Response.json(body);
    }

    return new Response("Not found", { status: 404 });
  });
}

const urlsOf = (fetch: ReturnType<typeof secFetch>) =>
  fetch.mock.calls.map(([input]) => String(input));

/** Runs the paced requests to completion under fake timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();

  return promise;
}

async function loadModule() {
  return import("~/lib/company-filings.server");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T15:00:00.000Z"));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SEC requests", () => {
  it("declares the application and a contact address and asks for JSON", async () => {
    const fetch = secFetch();
    vi.stubGlobal("fetch", fetch);
    const { getIssuerList, SEC_USER_AGENT } = await loadModule();

    await settle(getIssuerList());

    expect(SEC_USER_AGENT).toMatch(/TuEconomia/);
    expect(SEC_USER_AGENT).toMatch(/@/);

    // The SEC refused the header with a URL in it (403); keep it to a name and an address.
    expect(SEC_USER_AGENT).not.toMatch(/https?:/);

    for (const [, init] of fetch.mock.calls)
      expect(init?.headers).toEqual({
        "user-agent": SEC_USER_AGENT,
        accept: "application/json",
      });
  });

  it("spaces request starts to stay under ten per second", async () => {
    const starts: number[] = [];
    const inner = secFetch();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        starts.push(Date.now());

        return inner(input, init);
      }),
    );

    const { getIssuerList } = await loadModule();

    await settle(getIssuerList());

    expect(starts).toHaveLength(1 + ISSUERS.length);

    for (let index = 1; index < starts.length; index++)
      expect(starts[index] - starts[index - 1]).toBeGreaterThanOrEqual(100);
  });
});

describe("getIssuerList", () => {
  it("resolves each ticker through the ticker file and links the latest annual report", async () => {
    const fetch = secFetch();
    vi.stubGlobal("fetch", fetch);
    const { getIssuerList } = await loadModule();

    const panel = await settle(getIssuerList());

    expect(panel.status).toBe("available");
    expect(panel.data!.rows).toHaveLength(ISSUERS.length);

    const ypf = panel.data!.rows.find((row) => row.issuer.ticker === "YPF")!;

    expect(ypf).toMatchObject({
      status: "available",
      cik: CIK.YPF,
      secName: "YPF REGISTRANT",
      latestAnnual: {
        form: "20-F",
        filingDate: "2026-04-28",
        reportDate: "2025-12-31",
        url: `https://www.sec.gov/Archives/edgar/data/${CIK.YPF}/000126000002/d20f.htm`,
      },
    });

    expect(urlsOf(fetch)).toContain(
      `https://data.sec.gov/submissions/CIK${String(CIK.YPF).padStart(10, "0")}.json`,
    );

    expect(panel.freshness).toMatchObject({
      status: "current",
      fetchedAtLabel: "10/11/2026, 12:00",
    });
  });

  it("marks a ticker missing from the file, or a CIK that does not list it, as unresolved", async () => {
    vi.stubGlobal(
      "fetch",
      secFetch({
        tickers: () => Response.json(tickerFile({ TEO: undefined })),
        submissionsFor: (ticker) =>
          Response.json(
            ticker === "LOMA"
              ? { ...submissions(ticker), tickers: ["SOMETHINGELSE"] }
              : submissions(ticker),
          ),
      }),
    );

    const { getIssuerList } = await loadModule();

    const rows = (await settle(getIssuerList())).data!.rows;
    const statusOf = (ticker: string) =>
      rows.find((row) => row.issuer.ticker === ticker)!.status;

    expect(statusOf("TEO")).toBe("unresolved");
    expect(statusOf("LOMA")).toBe("unresolved");
    expect(statusOf("YPF")).toBe("available");
  });

  it("keeps the other issuers when one company's submissions fail", async () => {
    vi.stubGlobal(
      "fetch",
      secFetch({
        submissionsFor: (ticker) =>
          ticker === "BMA"
            ? new Response("busy", { status: 503 })
            : Response.json(submissions(ticker)),
      }),
    );

    const { getIssuerList } = await loadModule();

    const panel = await settle(getIssuerList());

    expect(panel.status).toBe("available");

    expect(
      panel.data!.rows.filter((row) => row.status === "unavailable"),
    ).toEqual([
      {
        issuer: expect.objectContaining({ ticker: "BMA" }),
        status: "unavailable",
      },
    ]);
  });

  it("tolerates missing optional fields and a malformed submissions record fails only that company", async () => {
    vi.stubGlobal(
      "fetch",
      secFetch({
        submissionsFor: (ticker) => {
          if (ticker === "PAM") return Response.json({ tickers: ["PAM"] });

          const record = submissions(ticker);
          const recent: Partial<typeof record.filings.recent> = {
            ...record.filings.recent,
          };

          delete recent.reportDate;
          delete recent.primaryDocDescription;

          return Response.json({
            ...record,
            sicDescription: undefined,
            exchanges: undefined,
            filings: { recent },
          });
        },
      }),
    );

    const { getIssuerList } = await loadModule();

    const rows = (await settle(getIssuerList())).data!.rows;

    expect(rows.find((row) => row.issuer.ticker === "PAM")!.status).toBe(
      "unavailable",
    );

    expect(rows.find((row) => row.issuer.ticker === "YPF")).toMatchObject({
      status: "available",
      latestAnnual: { form: "20-F", reportDate: null, description: null },
    });
  });

  it("is unavailable without the ticker file and then makes no submissions request", async () => {
    const fetch = secFetch({
      tickers: () => new Response("Forbidden", { status: 403 }),
    });

    vi.stubGlobal("fetch", fetch);
    const { getIssuerList } = await loadModule();

    expect(await settle(getIssuerList())).toEqual({
      status: "unavailable",
      data: null,
      freshness: null,
    });

    expect(urlsOf(fetch)).toEqual([TICKERS_URL]);
  });

  it("is unavailable when every company fails", async () => {
    vi.stubGlobal(
      "fetch",
      secFetch({
        submissionsFor: () => new Response("busy", { status: 503 }),
      }),
    );

    const { getIssuerList } = await loadModule();

    expect((await settle(getIssuerList())).status).toBe("unavailable");
  });

  it("caches the ticker file and submissions under their own keys", async () => {
    const fetch = secFetch();
    vi.stubGlobal("fetch", fetch);
    const { getIssuerList, getCompanyFilings } = await loadModule();

    await settle(getIssuerList());
    const calls = fetch.mock.calls.length;

    await settle(getIssuerList());
    await settle(getCompanyFilings("YPF"));

    expect(fetch.mock.calls.length).toBe(calls);

    // Submissions expire after six hours; the ticker file lasts a day.
    vi.setSystemTime(new Date("2026-11-10T21:00:01.000Z"));
    await settle(getCompanyFilings("YPF"));

    expect(urlsOf(fetch).slice(calls)).toEqual([
      `https://data.sec.gov/submissions/CIK${String(CIK.YPF).padStart(10, "0")}.json`,
    ]);
  });
});

describe("getCompanyFilings", () => {
  it("returns the recent filings, newest first, with their links", async () => {
    vi.stubGlobal("fetch", secFetch());
    const { getCompanyFilings } = await loadModule();

    const panel = await settle(getCompanyFilings("GGAL"));

    expect(panel.status).toBe("available");
    expect(panel.data!.issuer.ticker).toBe("GGAL");
    expect(panel.data!.filings.map((filing) => filing.form)).toEqual([
      "6-K",
      "20-F",
      "20-F",
    ]);
    expect(panel.data!.latestAnnual?.filingDate).toBe("2026-04-28");
  });

  it("lists reports only, not insider holdings or other administrative forms", async () => {
    vi.stubGlobal(
      "fetch",
      secFetch({
        submissionsFor: (ticker) => {
          const record = submissions(ticker);

          return Response.json({
            ...record,
            filings: {
              recent: {
                accessionNumber: [
                  "0001-26-000005",
                  "0001-26-000004",
                  ...record.filings.recent.accessionNumber,
                ],
                filingDate: [
                  "2026-05-04",
                  "2026-05-03",
                  ...record.filings.recent.filingDate,
                ],
                reportDate: [
                  "2026-05-01",
                  "",
                  ...record.filings.recent.reportDate,
                ],
                form: ["4", "SD", ...record.filings.recent.form],
                primaryDocument: [
                  "form4.xml",
                  "sd.htm",
                  ...record.filings.recent.primaryDocument,
                ],
                primaryDocDescription: [
                  "PRIMARY DOCUMENT",
                  "SD",
                  ...record.filings.recent.primaryDocDescription,
                ],
              },
            },
          });
        },
      }),
    );

    const { getCompanyFilings } = await loadModule();

    const panel = await settle(getCompanyFilings("GGAL"));

    expect(panel.data!.filings.map((filing) => filing.form)).toEqual([
      "6-K",
      "20-F",
      "20-F",
    ]);
  });

  it("is unresolved for a ticker outside the table, without a request", async () => {
    const fetch = secFetch();
    vi.stubGlobal("fetch", fetch);
    const { getCompanyFilings } = await loadModule();

    expect((await settle(getCompanyFilings("AAPL"))).status).toBe("unresolved");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is unavailable, not rejected, when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      secFetch({ submissionsFor: () => new Response("busy", { status: 500 }) }),
    );

    const { getCompanyFilings } = await loadModule();

    expect((await settle(getCompanyFilings("YPF"))).status).toBe("unavailable");
  });
});

describe("getCompanyFigures", () => {
  const ifrs = {
    "ifrs-full/Revenue": concept("ifrs-full", "Revenue", {
      ARS: [
        annual(900, {
          start: "2024-01-01",
          end: "2024-12-31",
          fy: 2024,
          filed: "2025-04-25",
        }),
        annual(1000, { start: "2025-01-01" }),
        annual(300, { start: "2025-10-01", form: "6-K" }),
      ],
    }),
    "ifrs-full/ProfitLoss": concept("ifrs-full", "ProfitLoss", {
      ARS: [annual(-50, { start: "2025-01-01" }), { bad: true }],
    }),
    "ifrs-full/Assets": concept("ifrs-full", "Assets", {
      ARS: [annual(5000), annual(5100, { filed: "2027-04-20", fy: 2026 })],
    }),
  };

  it("picks the latest annual fact of each IFRS tag, with unit, period and form", async () => {
    const fetch = secFetch({ concepts: ifrs });
    vi.stubGlobal("fetch", fetch);
    const { getCompanyFigures } = await loadModule();

    const panel = await settle(getCompanyFigures("YPF"));

    expect(panel.status).toBe("available");
    expect(panel.data!.taxonomy).toBe("ifrs-full");

    expect(panel.data!.figures.revenue).toEqual({
      value: 1000,
      unit: "ARS",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      fiscalYear: 2025,
      form: "20-F",
      filed: "2026-04-28",
      accession: "0001-26-000002",
      taxonomy: "ifrs-full",
      tag: "Revenue",
    });

    expect(panel.data!.figures.profit?.value).toBe(-50);
    expect(panel.data!.figures.assets?.value).toBe(5100);

    // `Equity` answered 404: not reported, not an outage.
    expect(panel.data!.figures.equity).toBeNull();
    expect(panel.data!.missing).toEqual([]);

    // No us-gaap request when the company reports under IFRS.
    expect(urlsOf(fetch).filter((url) => url.includes("us-gaap"))).toEqual([]);
  });

  it("falls back to us-gaap only when every IFRS tag answers 404", async () => {
    const fetch = secFetch({
      concepts: {
        "us-gaap/Revenues": concept("us-gaap", "Revenues", {
          USD: [annual(70, { start: "2025-01-01", form: "10-K" })],
        }),
        "us-gaap/StockholdersEquity": concept("us-gaap", "StockholdersEquity", {
          USD: [annual(40, { form: "10-K" })],
        }),
      },
    });

    vi.stubGlobal("fetch", fetch);
    const { getCompanyFigures } = await loadModule();

    const panel = await settle(getCompanyFigures("YPF"));

    expect(panel.data!.taxonomy).toBe("us-gaap");
    expect(panel.data!.figures.revenue).toMatchObject({
      value: 70,
      unit: "USD",
      tag: "Revenues",
    });
    expect(panel.data!.figures.equity).toMatchObject({
      value: 40,
      tag: "StockholdersEquity",
    });
    expect(panel.data!.figures.profit).toBeNull();

    const conceptUrls = urlsOf(fetch).filter((url) =>
      url.includes("companyconcept"),
    );

    expect(conceptUrls).toHaveLength(8);
  });

  it("does not fall back when an IFRS request failed, and names the failed figure", async () => {
    const inner = secFetch({ concepts: ifrs });

    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) =>
        String(input).endsWith("/ifrs-full/Assets.json")
          ? new Response("busy", { status: 503 })
          : inner(input, init),
    );

    vi.stubGlobal("fetch", fetch);
    const { getCompanyFigures } = await loadModule();

    const panel = await settle(getCompanyFigures("YPF"));

    expect(panel.data!.missing).toEqual(["assets"]);
    expect(panel.data!.figures.revenue?.value).toBe(1000);

    expect(
      fetch.mock.calls.filter(([input]) => String(input).includes("us-gaap")),
    ).toEqual([]);
  });

  it("reads every figure as not reported when neither taxonomy has the tags", async () => {
    vi.stubGlobal("fetch", secFetch());
    const { getCompanyFigures } = await loadModule();

    const panel = await settle(getCompanyFigures("BMA"));

    expect(panel.status).toBe("available");
    expect(panel.data!.taxonomy).toBeNull();
    expect(Object.values(panel.data!.figures)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("is unavailable when every concept request fails, and unresolved for a mismatched company", async () => {
    const inner = secFetch({
      submissionsFor: (ticker) =>
        Response.json(
          ticker === "LOMA"
            ? { ...submissions(ticker), tickers: [] }
            : submissions(ticker),
        ),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
        String(input).includes("companyconcept")
          ? new Response("busy", { status: 500 })
          : inner(input, init),
      ),
    );

    const { getCompanyFigures } = await loadModule();

    expect((await settle(getCompanyFigures("YPF"))).status).toBe("unavailable");
    expect((await settle(getCompanyFigures("LOMA"))).status).toBe("unresolved");
  });

  it("caches a concept under its company, taxonomy and tag", async () => {
    const fetch = secFetch({ concepts: ifrs });
    vi.stubGlobal("fetch", fetch);
    const { getCompanyFigures } = await loadModule();

    await settle(getCompanyFigures("YPF"));
    const calls = fetch.mock.calls.length;

    await settle(getCompanyFigures("YPF"));
    expect(fetch.mock.calls.length).toBe(calls);

    await settle(getCompanyFigures("GGAL"));

    expect(
      urlsOf(fetch)
        .slice(calls)
        .filter((url) => url.includes("companyconcept")),
    ).toHaveLength(4);
  });
});

describe("recorded responses", () => {
  /** Answers with the TGS responses recorded from the live API on 2026-11-10, arrays trimmed and keys kept. */
  function recordedFetch() {
    return vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === TICKERS_URL)
        return Response.json({ "0": recorded.tickerEntry });

      if (url.endsWith(`/submissions/CIK${"931427".padStart(10, "0")}.json`))
        return Response.json(recorded.submissions);

      const tag = /\/ifrs-full\/([^/]+)\.json$/.exec(url)?.[1];
      const body =
        tag && recorded.concepts[tag as keyof typeof recorded.concepts];

      return body
        ? Response.json(body)
        : new Response("Not found", { status: 404 });
    });
  }

  it("parses the live submissions and links the latest 20-F", async () => {
    vi.stubGlobal("fetch", recordedFetch());
    const { getCompanyFilings } = await loadModule();

    const panel = await settle(getCompanyFilings("TGS"));

    expect(panel.status).toBe("available");

    expect(panel.data).toMatchObject({
      cik: 931427,
      secName: "GAS TRANSPORTER OF THE SOUTH INC",
      latestAnnual: {
        form: "20-F",
        filingDate: "2026-04-22",
        reportDate: "2025-12-31",
        url: "https://www.sec.gov/Archives/edgar/data/931427/000114036126016167/ef20060824_20f.htm",
      },
    });

    expect(panel.data!.filings).toHaveLength(4);
  });

  it("parses the live concepts and leaves out a figure from an older year", async () => {
    vi.stubGlobal("fetch", recordedFetch());
    const { getCompanyFigures } = await loadModule();

    const panel = await settle(getCompanyFigures("TGS"));

    expect(panel.status).toBe("available");
    expect(panel.data!.taxonomy).toBe("ifrs-full");

    expect(panel.data!.figures.revenue).toMatchObject({
      value: 1_219_766_287_000,
      unit: "ARS",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      form: "20-F",
      filed: "2025-04-24",
    });

    expect(panel.data!.figures.assets?.periodEnd).toBe("2024-12-31");
    expect(panel.data!.figures.equity?.periodEnd).toBe("2024-12-31");

    // TGS's latest annual `ProfitLoss` is for 2017; it is not set beside 2024.
    expect(panel.data!.figures.profit).toBeNull();
    expect(panel.data!.missing).toEqual([]);
  });
});

describe("source health", () => {
  it("is not checked before any request", async () => {
    const { getCompanyFilingSourceHealth } = await loadModule();

    expect(getCompanyFilingSourceHealth()).toEqual({
      status: "not-checked",
      lastSuccessfulFetchAt: null,
      lastFailureAt: null,
    });
  });

  it("reports fetched, then cached, and counts a 404 concept as an answer", async () => {
    vi.stubGlobal("fetch", secFetch());
    const { checkCompanyFilingSources, getCompanyFigures } = await loadModule();

    expect((await settle(checkCompanyFilingSources())).status).toBe("fetched");
    expect((await settle(checkCompanyFilingSources())).status).toBe("cached");

    // Every concept answers 404 here; that is the absence of a tag, not a failure.
    await settle(getCompanyFigures("YPF"));

    const health = await settle(checkCompanyFilingSources());

    expect(health.status).toBe("fetched");
    expect(health.lastFailureAt).toBeNull();
  });

  it("reports partial when some requests fail and failed when all do", async () => {
    vi.stubGlobal(
      "fetch",
      secFetch({
        submissionsFor: (ticker) =>
          ticker === "EDN"
            ? new Response("busy", { status: 503 })
            : Response.json(submissions(ticker)),
      }),
    );

    const first = await loadModule();
    const partial = await settle(first.checkCompanyFilingSources());

    expect(partial.status).toBe("partial");
    expect(partial.lastFailureAt).not.toBeNull();
    expect(partial.lastSuccessfulFetchAt).not.toBeNull();

    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      secFetch({ tickers: () => new Response("Forbidden", { status: 403 }) }),
    );

    const second = await loadModule();

    expect((await settle(second.checkCompanyFilingSources())).status).toBe(
      "failed",
    );
  });
});
