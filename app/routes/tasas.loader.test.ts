import { describe, expect, it, vi } from "vitest";

import { loader, shouldRevalidate } from "./tasas";

vi.mock("~/lib/indicators.server", () => ({
  getIndicators: vi.fn(async () => []),
  getMonthlyInflationHistory: vi.fn(async () => []),
  getDepositRateHistory: vi.fn(async () => []),
}));

const run = (path: string) =>
  loader({
    request: new Request(`http://localhost${path}`),
  } as unknown as Parameters<typeof loader>[0]);

const redirectOf = (path: string) => {
  try {
    run(path);
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.headers.get("Location");
  }

  return null;
};

describe("tasas loader", () => {
  it("shows the loans panel at a bare /tasas without redirecting", () => {
    const data = run("/tasas");

    expect(data.panel).toBe("prestamos");
    expect(data.cards).toBeNull();
    expect(data.loans?.lenders).toBeGreaterThan(0);
  });

  it("redirects an unknown panel, invalid values and the other panel's parameters to the canonical query", () => {
    expect(redirectOf("/tasas?panel=plazos")).toBe("/tasas?panel=prestamos");

    expect(
      redirectOf(
        "/tasas?panel=prestamos&perfil=&plazo=24&monto=2.000.000&provincia=&segmento=gold",
      ),
    ).toBe("/tasas?panel=prestamos&plazo=24&monto=2000000");

    expect(redirectOf("/tasas?panel=tarjetas&perfil=monotributistas")).toBe(
      "/tasas?panel=tarjetas",
    );
  });

  it("ignores React Router's data request path and _routes parameter", () => {
    expect(redirectOf("/tasas.data?_routes=routes%2Ftasas")).toBeNull();

    expect(
      redirectOf(
        "/tasas.data?panel=tarjetas&segmento=x&_routes=routes%2Ftasas",
      ),
    ).toBe("/tasas?panel=tarjetas");
  });

  it("keeps the deposit calculator's inputs and the preview when it redirects the panels' query", () => {
    expect(
      redirectOf("/tasas?depositAmount=5000&depositMonth=2026-09"),
    ).toBeNull();

    expect(
      redirectOf(
        "/tasas?panel=tarjetas&segmento=x&depositAmount=5000&preview=unavailable",
      ),
    ).toBe("/tasas?panel=tarjetas&depositAmount=5000&preview=unavailable");
  });

  it("keeps loaded data when only the deposit calculator's inputs change", () => {
    const navigation = (current: string, next: string) =>
      ({
        currentUrl: new URL(current),
        nextUrl: new URL(next),
        defaultShouldRevalidate: true,
      }) as Parameters<typeof shouldRevalidate>[0];

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/tasas?depositAmount=1",
          "https://example.com/tasas?depositAmount=2&depositMonth=2026-09",
        ),
      ),
    ).toBe(false);

    expect(
      shouldRevalidate(
        navigation(
          "https://example.com/tasas",
          "https://example.com/tasas?panel=tarjetas",
        ),
      ),
    ).toBe(true);
  });

  it("turns a page past the last into the last page", () => {
    const last = run("/tasas?panel=tarjetas").cards!.pages;

    expect(redirectOf("/tasas?panel=tarjetas&pagina=999")).toBe(
      last === 1
        ? "/tasas?panel=tarjetas"
        : `/tasas?panel=tarjetas&pagina=${last}`,
    );
  });

  it("serves a canonical query as is", () => {
    const data = run("/tasas?panel=tarjetas&segmento=gold");

    expect(data.cardFilters?.segmento).toBe("gold");
    expect(data.cards?.rows.every((row) => row.best.segment === "gold")).toBe(
      true,
    );
  });
});
