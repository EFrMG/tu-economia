import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCompanyFigures,
  getCompanyFilings,
  getIssuerList,
} from "~/lib/company-filings.server";
import {
  getCedearPanel,
  getIndexStrip,
  getLeaderPanel,
  getMarketOpen,
} from "~/lib/equities.server";
import { getLiveRates } from "~/lib/exchange-rates.server";
import { workerEnvContext } from "~/lib/worker-context";
import { loader, shouldRevalidate } from "./acciones";

vi.mock("~/lib/equities.server", () => ({
  getCedearPanel: vi.fn(),
  getIndexStrip: vi.fn(),
  getLeaderPanel: vi.fn(),
  getMarketOpen: vi.fn(),
}));

vi.mock("~/lib/exchange-rates.server", () => ({
  getLiveRates: vi.fn(),
}));

vi.mock("~/lib/company-filings.server", () => ({
  getIssuerList: vi.fn(),
  getCompanyFilings: vi.fn(),
  getCompanyFigures: vi.fn(),
}));

const unavailable = { status: "unavailable", data: null, freshness: null };

const BYMA = [getCedearPanel, getIndexStrip, getLeaderPanel, getMarketOpen];
const SEC = [getIssuerList, getCompanyFilings, getCompanyFigures];

beforeEach(() => {
  vi.resetAllMocks();

  for (const fn of [...BYMA, ...SEC])
    vi.mocked(fn).mockResolvedValue(unavailable as never);

  vi.mocked(getLiveRates).mockResolvedValue(liveRates);
});

const liveRates = {
  rates: [
    { casa: "blue", nombre: "Blue", compra: 1, venta: 1300, updatedAt: null },
    {
      casa: "bolsa",
      nombre: "Bolsa",
      compra: 1,
      venta: 1450,
      updatedAt: "10/11/2026, 14:00",
    },
    {
      casa: "contadoconliqui",
      nombre: "Contado con liquidación",
      compra: 1,
      venta: 1480,
      updatedAt: "10/11/2026, 14:00",
    },
  ],
  freshness: {
    status: "current" as const,
    lastSuccessfulFetchAt: "2026-11-10T17:05:00.000Z",
    lastSuccessfulFetchAtLabel: "10/11/2026, 14:05",
  },
};

const requestArgs = (path: string, bymaEnabled: boolean) => {
  const context = new RouterContextProvider();

  context.set(workerEnvContext, {
    EQUITIES_BYMA_ENABLED: bymaEnabled ? "true" : "false",
  });

  return {
    request: new Request(`http://localhost${path}`),
    context,
  } as unknown as Parameters<typeof loader>[0];
};

/** The redirect target, or `null` when the loader returned data. */
function redirectOf(path: string, bymaEnabled: boolean): string | null {
  try {
    loader(requestArgs(path, bymaEnabled));

    return null;
  } catch (error) {
    if (!(error instanceof Response)) throw error;

    return error.headers.get("Location");
  }
}

describe("acciones loader with BYMA off", () => {
  it("serves the Empresas list by default and never calls BYMA", () => {
    const data = loader(requestArgs("/acciones", false));

    expect(data).toMatchObject({
      bymaEnabled: false,
      panel: "empresas",
      empresa: null,
      market: null,
      cedears: null,
      leaders: null,
    });

    expect(getIssuerList).toHaveBeenCalledTimes(1);

    for (const fn of BYMA) expect(fn).not.toHaveBeenCalled();
  });

  it("redirects the BYMA panel, and its former ids, to the default panel without calling BYMA", () => {
    for (const id of ["acciones", "cedears", "lideres"])
      expect(redirectOf(`/acciones?panel=${id}`, false)).toBe(
        "/acciones?panel=empresas",
      );

    for (const fn of BYMA) expect(fn).not.toHaveBeenCalled();
  });

  it("treats a missing flag as off", () => {
    const context = new RouterContextProvider();
    context.set(workerEnvContext, {});

    const data = loader({
      request: new Request("http://localhost/acciones"),
      context,
    } as unknown as Parameters<typeof loader>[0]);

    expect(data.panel).toBe("empresas");

    for (const fn of BYMA) expect(fn).not.toHaveBeenCalled();
  });
});

describe("acciones loader, Empresas panel", () => {
  it("loads only the selected company, not the list", () => {
    const data = loader(
      requestArgs("/acciones?panel=empresas&empresa=YPF", false),
    );

    expect(data.empresa).toBe("YPF");
    expect(data.issuers).toBeNull();
    expect(getCompanyFilings).toHaveBeenCalledWith("YPF");
    expect(getCompanyFigures).toHaveBeenCalledWith("YPF");
    expect(getIssuerList).not.toHaveBeenCalled();
  });

  it("redirects an unknown company to the panel and normalises the case of a known one", () => {
    expect(redirectOf("/acciones?panel=empresas&empresa=NOPE", false)).toBe(
      "/acciones?panel=empresas",
    );

    expect(redirectOf("/acciones?panel=empresas&empresa=", false)).toBe(
      "/acciones?panel=empresas",
    );

    expect(redirectOf("/acciones?panel=empresas&empresa=ypf", false)).toBe(
      "/acciones?panel=empresas&empresa=YPF",
    );

    for (const fn of SEC) expect(fn).not.toHaveBeenCalled();
  });

  it("keeps the selected company when a switched-off panel redirects", () => {
    expect(redirectOf("/acciones?panel=cedears&empresa=GGAL", false)).toBe(
      "/acciones?panel=empresas&empresa=GGAL",
    );
  });
});

describe("acciones loader with BYMA on", () => {
  it("defaults to the quotations panel and streams the strip and both tables", () => {
    const data = loader(requestArgs("/acciones", true));

    expect(data.panel).toBe("acciones");
    expect(data.market).not.toBeNull();
    expect(data.cedears).not.toBeNull();
    expect(data.leaders).not.toBeNull();
    expect(getCedearPanel).toHaveBeenCalledTimes(1);
    expect(getLeaderPanel).toHaveBeenCalledTimes(1);
    expect(getIndexStrip).toHaveBeenCalledTimes(1);
    expect(getMarketOpen).toHaveBeenCalledTimes(1);

    for (const fn of SEC) expect(fn).not.toHaveBeenCalled();
  });

  it("serves the Empresas panel without BYMA requests", () => {
    const data = loader(requestArgs("/acciones?panel=empresas", true));

    expect(data.market).toBeNull();
    expect(data.cedears).toBeNull();
    expect(data.leaders).toBeNull();
    expect(getIssuerList).toHaveBeenCalledTimes(1);

    for (const fn of BYMA) expect(fn).not.toHaveBeenCalled();
  });

  it("redirects the former CEDEAR and leaders panels, and an unknown panel, to the quotations panel", () => {
    for (const id of ["cedears", "lideres", "merval"])
      expect(redirectOf(`/acciones?panel=${id}`, true)).toBe(
        "/acciones?panel=acciones",
      );
  });
});

describe("acciones loader, calculator panel", () => {
  for (const bymaEnabled of [false, true])
    it(`streams the CCL and MEP and calls neither BYMA nor the SEC (BYMA ${bymaEnabled ? "on" : "off"})`, async () => {
      const data = loader(
        requestArgs(
          "/acciones?panel=calculadora&precio=100&ratio=20&tc=1000&mercado=5250",
          bymaEnabled,
        ),
      );

      expect(data).toMatchObject({
        panel: "calculadora",
        empresa: null,
        market: null,
        cedears: null,
        leaders: null,
        issuers: null,
        company: null,
        figures: null,
      });

      expect(await data.rates).toEqual({
        status: "available",
        quotes: [
          { id: "ccl", venta: 1480, updatedAt: "10/11/2026, 14:00" },
          { id: "mep", venta: 1450, updatedAt: "10/11/2026, 14:00" },
        ],
        stale: false,
        fetchedAtLabel: "10/11/2026, 14:05",
      });

      expect(getLiveRates).toHaveBeenCalledTimes(1);

      for (const fn of [...BYMA, ...SEC]) expect(fn).not.toHaveBeenCalled();
    });

  it("turns a failed rate request into the unavailable state, not an error", async () => {
    vi.mocked(getLiveRates).mockRejectedValue(
      new Response("down", { status: 502 }),
    );

    const data = loader(requestArgs("/acciones?panel=calculadora", false));

    expect(await data.rates).toEqual({ status: "unavailable" });
  });

  it("does not request rates for the other panels", () => {
    for (const bymaEnabled of [false, true])
      for (const panel of bymaEnabled ? ["acciones", "empresas"] : ["empresas"])
        expect(
          loader(requestArgs(`/acciones?panel=${panel}`, bymaEnabled)).rates,
        ).toBeNull();

    expect(getLiveRates).not.toHaveBeenCalled();
  });

  it("normalises its parameters and drops invalid ones", () => {
    expect(
      redirectOf(
        "/acciones?panel=calculadora&precio=150,25&ratio=20:1&referencia=MEP&tc=1.234,5&mercado=9000",
        false,
      ),
    ).toBe(
      "/acciones?panel=calculadora&precio=150.25&ratio=20&referencia=mep&tc=1234.5&mercado=9000",
    );

    expect(
      redirectOf(
        "/acciones?panel=calculadora&precio=-1&ratio=0&referencia=blue&tc=x&mercado=",
        true,
      ),
    ).toBe("/acciones?panel=calculadora");

    expect(
      redirectOf("/acciones?panel=calculadora&referencia=ccl", false),
    ).toBe("/acciones?panel=calculadora");

    expect(
      redirectOf(
        "/acciones?panel=calculadora&precio=100&ratio=1:2&referencia=mep",
        false,
      ),
    ).toBeNull();

    expect(getLiveRates).toHaveBeenCalledTimes(1);
  });

  it("keeps other panels' parameters out of the calculator and its own out of them", () => {
    expect(
      redirectOf("/acciones?panel=calculadora&empresa=YPF&precio=100", false),
    ).toBe("/acciones?panel=calculadora&precio=100");

    expect(redirectOf("/acciones?panel=empresas&precio=100", false)).toBe(
      "/acciones?panel=empresas",
    );

    expect(
      redirectOf("/acciones?panel=empresas&empresa=YPF&tc=1000", false),
    ).toBe("/acciones?panel=empresas&empresa=YPF");

    expect(redirectOf("/acciones?ratio=20", false)).toBe("/acciones");

    expect(redirectOf("/acciones?panel=acciones&mercado=1", true)).toBe(
      "/acciones?panel=acciones",
    );

    expect(redirectOf("/acciones?panel=cedears&precio=1", false)).toBe(
      "/acciones?panel=empresas",
    );

    for (const fn of [getLiveRates, ...BYMA, ...SEC])
      expect(fn).not.toHaveBeenCalled();
  });
});

describe("acciones loader preview", () => {
  it("shows the calculator's unavailable rates without calling Dólar API", async () => {
    const data = loader(
      requestArgs(
        "/acciones?panel=calculadora&precio=100&preview=unavailable",
        false,
      ),
    );

    expect(await data.rates).toEqual({ status: "unavailable" });
    expect(getLiveRates).not.toHaveBeenCalled();

    for (const fn of [...BYMA, ...SEC]) expect(fn).not.toHaveBeenCalled();
  });

  it("calls no upstream while previewing unavailable data", async () => {
    const data = loader(
      requestArgs(
        "/acciones?panel=empresas&empresa=YPF&preview=unavailable",
        false,
      ),
    );

    expect(await data.company).toEqual(unavailable);
    expect(await data.figures).toEqual(unavailable);

    for (const fn of [...BYMA, ...SEC]) expect(fn).not.toHaveBeenCalled();
  });
});

describe("acciones shouldRevalidate", () => {
  const revalidates = (from: string, to: string) =>
    shouldRevalidate({
      currentUrl: new URL(`http://localhost${from}`),
      nextUrl: new URL(`http://localhost${to}`),
      defaultShouldRevalidate: true,
    } as unknown as Parameters<typeof shouldRevalidate>[0]);

  it("skips the loader when only the calculator's inputs change", () => {
    expect(
      revalidates(
        "/acciones?panel=calculadora",
        "/acciones?panel=calculadora&precio=100&referencia=mep",
      ),
    ).toBe(false);
  });

  it("runs it for anything else", () => {
    expect(
      revalidates("/acciones?panel=calculadora", "/acciones?panel=empresas"),
    ).toBe(true);

    expect(
      revalidates(
        "/acciones?panel=calculadora",
        "/acciones?panel=calculadora&preview=unavailable",
      ),
    ).toBe(true);

    expect(
      revalidates("/acciones?panel=calculadora", "/acciones?panel=calculadora"),
    ).toBe(true);

    expect(
      revalidates(
        "/acciones?panel=empresas",
        "/acciones?panel=empresas&empresa=YPF",
      ),
    ).toBe(true);
  });
});
