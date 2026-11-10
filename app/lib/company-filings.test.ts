import { describe, expect, it } from "vitest";

import {
  ISSUERS,
  alignToOneReport,
  describeFiling,
  figureReport,
  filingDocumentUrl,
  filingsNeedRetry,
  findIssuer,
  formatFilingDate,
  formatReportedAmount,
  isAnnualFact,
  isListedFiling,
  latestAnnualFact,
  latestAnnualReport,
  listsTicker,
  paddedCik,
  parseRecentFilings,
  toReportedFigure,
  unresolvedPanel,
  type ConceptFact,
  type IssuerListData,
} from "~/lib/company-filings";
import { unavailablePanel } from "~/lib/acciones-panels";
import type { EquityPanel } from "~/lib/equities";

const fact = (overrides: Partial<ConceptFact>): ConceptFact => ({
  end: "2025-12-31",
  val: 100,
  accn: "0001-25-000001",
  fy: 2025,
  fp: "FY",
  form: "20-F",
  filed: "2026-04-20",
  ...overrides,
});

describe("issuer table", () => {
  it("lists unique upper-case tickers and nothing else to identify a company", () => {
    const tickers = ISSUERS.map((issuer) => issuer.ticker);

    expect(new Set(tickers).size).toBe(tickers.length);
    expect(tickers.every((ticker) => /^[A-Z]+$/.test(ticker))).toBe(true);

    for (const issuer of ISSUERS)
      expect(Object.keys(issuer).sort()).toEqual(["name", "sector", "ticker"]);
  });

  it("finds an issuer without regard to case and rejects unknown tickers", () => {
    expect(findIssuer("ypf")?.ticker).toBe("YPF");
    expect(findIssuer(" GGAL ")?.ticker).toBe("GGAL");
    expect(findIssuer("NOPE")).toBeNull();
    expect(findIssuer("")).toBeNull();
    expect(findIssuer(null)).toBeNull();
  });
});

describe("EDGAR addresses", () => {
  it("pads the CIK to ten digits for data.sec.gov", () => {
    expect(paddedCik(1234)).toBe("0000001234");
    expect(paddedCik(1234567890)).toBe("1234567890");
  });

  it("builds the document URL from the unpadded CIK and the accession number without dashes", () => {
    expect(
      filingDocumentUrl(1234, "0001193125-26-012345", "d123d20f.htm"),
    ).toBe(
      "https://www.sec.gov/Archives/edgar/data/1234/000119312526012345/d123d20f.htm",
    );
  });
});

describe("parseRecentFilings", () => {
  it("zips the parallel arrays newest first and turns empty strings into null", () => {
    const filings = parseRecentFilings(1234, {
      accessionNumber: ["0001-26-000003", "0001-26-000002"],
      filingDate: ["2026-05-02", "2026-04-28"],
      form: ["6-K", "20-F"],
      primaryDocument: ["d6k.htm", "d20f.htm"],
      reportDate: ["", "2025-12-31"],
      primaryDocDescription: ["", "20-F"],
    });

    expect(filings).toEqual([
      {
        accessionNumber: "0001-26-000003",
        form: "6-K",
        filingDate: "2026-05-02",
        reportDate: null,
        primaryDocument: "d6k.htm",
        description: null,
        url: "https://www.sec.gov/Archives/edgar/data/1234/000126000003/d6k.htm",
      },
      {
        accessionNumber: "0001-26-000002",
        form: "20-F",
        filingDate: "2026-04-28",
        reportDate: "2025-12-31",
        primaryDocument: "d20f.htm",
        description: "20-F",
        url: "https://www.sec.gov/Archives/edgar/data/1234/000126000002/d20f.htm",
      },
    ]);
  });

  it("stops at the shortest required array and tolerates missing optional arrays", () => {
    const filings = parseRecentFilings(1234, {
      accessionNumber: ["a", "b", "c"],
      filingDate: ["2026-05-02", "2026-04-28"],
      form: ["6-K", "20-F", "6-K"],
      primaryDocument: ["x.htm", "y.htm", "z.htm"],
    });

    expect(filings.map((filing) => filing.accessionNumber)).toEqual(["a", "b"]);
    expect(filings.every((filing) => filing.reportDate === null)).toBe(true);
  });

  it("skips an entry without a primary document instead of linking nowhere", () => {
    const filings = parseRecentFilings(1234, {
      accessionNumber: ["a", "b"],
      filingDate: ["2026-05-02", "2026-04-28"],
      form: ["6-K", "20-F"],
      primaryDocument: ["", "y.htm"],
    });

    expect(filings.map((filing) => filing.accessionNumber)).toEqual(["b"]);
  });
});

describe("latestAnnualReport", () => {
  const filings = parseRecentFilings(1, {
    accessionNumber: ["a", "b", "c", "d", "e"],
    filingDate: [
      "2026-05-02",
      "2026-04-30",
      "2026-04-28",
      "2025-04-25",
      "2024-04-26",
    ],
    form: ["6-K", "20-F/A", "20-F", "20-F", "10-K"],
    primaryDocument: ["a.htm", "b.htm", "c.htm", "d.htm", "e.htm"],
  });

  it("picks the newest 20-F, 10-K or 40-F and ignores amendments and other forms", () => {
    expect(latestAnnualReport(filings)?.accessionNumber).toBe("c");
  });

  it("compares by date rather than trusting the array order", () => {
    expect(latestAnnualReport([...filings].reverse())?.accessionNumber).toBe(
      "c",
    );
  });

  it("is null without an annual report", () => {
    expect(latestAnnualReport(filings.slice(0, 2))).toBeNull();
  });
});

describe("listsTicker", () => {
  it("accepts the expected ticker among others and rejects a mismatch", () => {
    expect(listsTicker(["GGAL", "GGALP"], "GGAL")).toBe(true);
    expect(listsTicker(["ypf"], "YPF")).toBe(true);
    expect(listsTicker(["OTHER"], "YPF")).toBe(false);
    expect(listsTicker([], "YPF")).toBe(false);
  });
});

describe("annual facts", () => {
  it("accepts full-year durations and balances from annual forms only", () => {
    expect(isAnnualFact(fact({ start: "2025-01-01" }), "duration")).toBe(true);
    expect(isAnnualFact(fact({ start: "2025-07-01" }), "duration")).toBe(false);
    expect(isAnnualFact(fact({}), "duration")).toBe(false);
    expect(isAnnualFact(fact({}), "instant")).toBe(true);
    expect(isAnnualFact(fact({ start: "2025-01-01" }), "instant")).toBe(false);
    expect(isAnnualFact(fact({ form: "6-K" }), "instant")).toBe(false);
    expect(isAnnualFact(fact({ form: "10-Q" }), "instant")).toBe(false);

    // A 53-week fiscal year.
    expect(
      isAnnualFact(
        fact({ start: "2024-12-29", end: "2026-01-03", form: "10-K" }),
        "duration",
      ),
    ).toBe(true);
  });

  it("picks the latest period end, ignoring quarterly facts", () => {
    const latest = latestAnnualFact(
      {
        ARS: [
          fact({
            start: "2024-01-01",
            end: "2024-12-31",
            val: 1,
            filed: "2025-04-20",
          }),
          fact({ start: "2025-01-01", end: "2025-12-31", val: 2 }),
          fact({ start: "2026-01-01", end: "2026-03-31", val: 3, form: "6-K" }),
          fact({ start: "2025-10-01", end: "2025-12-31", val: 4 }),
        ],
      },
      "duration",
    );

    expect(latest).toEqual({
      unit: "ARS",
      fact: expect.objectContaining({ val: 2, end: "2025-12-31" }),
    });
  });

  it("prefers the later filing when two annual reports carry the same period", () => {
    const latest = latestAnnualFact(
      {
        ARS: [
          fact({ val: 10, filed: "2026-04-20", accn: "first" }),
          fact({ val: 11, filed: "2027-04-22", accn: "restated", fy: 2026 }),
        ],
      },
      "instant",
    );

    expect(latest?.fact.accn).toBe("restated");
  });

  it("keeps the unit of the chosen fact and breaks a full tie towards the main unit", () => {
    const latest = latestAnnualFact(
      {
        USD: [fact({ val: 5 })],
        ARS: [fact({ val: 5000 }), fact({ end: "2024-12-31", val: 4000 })],
      },
      "instant",
    );

    expect(latest).toEqual({
      unit: "ARS",
      fact: expect.objectContaining({ val: 5000 }),
    });
  });

  it("is null when only non-annual facts exist", () => {
    expect(
      latestAnnualFact({ ARS: [fact({ form: "6-K" })] }, "instant"),
    ).toBeNull();

    expect(latestAnnualFact({}, "instant")).toBeNull();
  });
});

describe("alignToOneReport and figureReport", () => {
  const figure = (overrides: Partial<ConceptFact>) =>
    toReportedFigure("ifrs-full", "Tag", {
      unit: "ARS",
      fact: fact({
        end: "2024-12-31",
        accn: "A-2025",
        filed: "2025-04-24",
        ...overrides,
      }),
    });

  it("keeps the figures of the latest period end and drops older ones", () => {
    const aligned = alignToOneReport({
      revenue: figure({ start: "2024-01-01" }),
      profit: figure({
        start: "2017-01-01",
        end: "2017-12-31",
        accn: "A-2018",
        filed: "2018-04-16",
      }),
      assets: figure({}),
      equity: null,
    });

    expect(aligned.revenue?.periodEnd).toBe("2024-12-31");
    expect(aligned.assets?.periodEnd).toBe("2024-12-31");
    expect(aligned.profit).toBeNull();
    expect(aligned.equity).toBeNull();

    expect(figureReport(aligned)).toEqual({
      periodEnd: "2024-12-31",
      form: "20-F",
      filed: "2025-04-24",
    });
  });

  it("keeps the latest filing when the same period comes from two reports", () => {
    const aligned = alignToOneReport({
      revenue: figure({
        start: "2024-01-01",
        accn: "A-2026",
        filed: "2026-04-22",
      }),
      assets: figure({}),
    });

    expect(aligned.revenue?.accession).toBe("A-2026");
    expect(aligned.assets).toBeNull();
  });

  it("leaves an empty set empty", () => {
    const aligned = alignToOneReport({ revenue: null, profit: null });

    expect(aligned).toEqual({ revenue: null, profit: null });
    expect(figureReport(aligned)).toBeNull();
  });
});

describe("listed filings and their descriptions", () => {
  const filing = (form: string, description: string | null) => ({
    accessionNumber: "0001-26-000001",
    form,
    filingDate: "2026-11-05",
    reportDate: null,
    primaryDocument: "doc.htm",
    description,
    url: "https://www.sec.gov/",
  });

  it("lists reports and their amendments, not insider holdings or administrative forms", () => {
    for (const form of ["20-F", "20-F/A", "10-K", "10-Q", "6-K", "8-K"])
      expect(isListedFiling(form)).toBe(true);

    for (const form of ["3", "4", "5", "SD", "F-3", "SC 13G"])
      expect(isListedFiling(form)).toBe(false);
  });

  it("uses the filer's description when it says more than the form", () => {
    expect(describeFiling(filing("6-K", "MATERIAL FACT"))).toBe(
      "MATERIAL FACT",
    );
  });

  it("uses the form's Spanish name when the description restates the form or is empty", () => {
    expect(describeFiling(filing("6-K", "6-K"))).toBe(
      "Informe de emisor extranjero",
    );
    expect(describeFiling(filing("6-K", "FORM 6-K"))).toBe(
      "Informe de emisor extranjero",
    );
    expect(describeFiling(filing("20-F", "PRIMARY DOCUMENT"))).toBe(
      "Informe anual",
    );
    expect(describeFiling(filing("20-F", null))).toBe("Informe anual");
  });
});

describe("filingsNeedRetry", () => {
  const list = (rows: IssuerListData["rows"]): EquityPanel<IssuerListData> => ({
    status: "available",
    data: { rows },
    freshness: {
      status: "current",
      fetchedAt: "2026-11-10T12:00:00.000Z",
      fetchedAtLabel: "10/11/2026, 09:00",
    },
  });

  const issuer = ISSUERS[0];

  it("retries failures but not companies that could not be identified", () => {
    expect(filingsNeedRetry(unavailablePanel())).toBe(true);
    expect(filingsNeedRetry(unresolvedPanel())).toBe(false);
    expect(filingsNeedRetry(list([{ issuer, status: "unavailable" }]))).toBe(
      true,
    );
    expect(filingsNeedRetry(list([{ issuer, status: "unresolved" }]))).toBe(
      false,
    );
  });
});

describe("formatting", () => {
  it("formats dates as day, month and year", () => {
    expect(formatFilingDate("2026-04-28")).toBe("28/04/2026");
    expect(formatFilingDate(null)).toBe("s/d");
  });

  it("keeps the reported unit and scales large amounts to millions", () => {
    expect(formatReportedAmount(1_234_567_000_000, "ARS")).toBe(
      "ARS 1.234.567 M",
    );

    expect(formatReportedAmount(-3_210_000_000, "ARS")).toBe("ARS -3.210 M");
    expect(formatReportedAmount(2_500_000, "USD")).toBe("USD 2,5 M");
    expect(formatReportedAmount(950, "USD")).toBe("USD 950");
  });
});
