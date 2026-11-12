import { describe, expect, it } from "vitest";

import {
  RATES_PAGE_SIZE,
  bestPerLender,
  cardMatches,
  isUnusuallyLowCft,
  loanMatches,
  paginate,
  parseCardFilters,
  parseLoanFilters,
  ratesSearch,
  type CardProduct,
  type LoanFilters,
  type LoanProduct,
} from "./transparency-rates";

const loan = (overrides: Partial<LoanProduct> = {}): LoanProduct => ({
  entityCode: 7,
  entity: "BANCO DE GALICIA Y BUENOS AIRES S.A.",
  product: "PRESTAMO",
  beneficiary: "todos",
  rateType: "fija",
  termMonths: 36,
  amountMin: 1_000,
  amountMax: 5_000_000,
  incomeMin: null,
  tea: 70,
  cft: 95,
  date: "2026-10-01",
  provinces: [],
  ...overrides,
});

const card = (overrides: Partial<CardProduct> = {}): CardProduct => ({
  entityCode: 7,
  entity: "BANCO DE GALICIA Y BUENOS AIRES S.A.",
  product: "VISA INTERNACIONAL",
  segment: "internacional",
  financingTea: 105.81,
  cashAdvanceTea: null,
  maintenanceFee: 27_500,
  renewalFee: null,
  date: "2026-10-15",
  provinces: [],
  ...overrides,
});

const noFilters: LoanFilters = {
  perfil: null,
  plazo: null,
  monto: null,
  provincia: null,
  pagina: 1,
};

describe("rates filters in the URL", () => {
  it("reads valid values and drops unknown, malformed or out-of-range ones", () => {
    expect(
      parseLoanFilters(
        new URLSearchParams(
          "perfil=monotributistas&plazo=24&monto=2.000.000&provincia=chaco&pagina=3",
        ),
      ),
    ).toEqual({
      perfil: "monotributistas",
      plazo: 24,
      monto: 2_000_000,
      provincia: "chaco",
      pagina: 3,
    });

    expect(
      parseLoanFilters(
        new URLSearchParams(
          "perfil=todos&plazo=7&monto=-5&provincia=narnia&pagina=0",
        ),
      ),
    ).toEqual({ ...noFilters, pagina: 1 });

    expect(
      parseLoanFilters(new URLSearchParams("monto=99999999999")).monto,
    ).toBeNull();

    expect(
      parseCardFilters(new URLSearchParams("segmento=gold&provincia=x")),
    ).toEqual({ segmento: "gold", provincia: null, pagina: 1 });
  });

  it("writes the panel first and omits unset filters and page 1", () => {
    expect(
      ratesSearch("prestamos", {
        ...noFilters,
        monto: 2_000_000,
        plazo: 12,
      }).toString(),
    ).toBe("panel=prestamos&plazo=12&monto=2000000");

    expect(
      ratesSearch("tarjetas", {
        segmento: null,
        provincia: "salta",
        pagina: 2,
      }).toString(),
    ).toBe("panel=tarjetas&provincia=salta&pagina=2");
  });
});

describe("matching products", () => {
  it("lets an unrestricted product match every profile and a restricted one only its own", () => {
    const filters = { ...noFilters, perfil: "monotributistas" } as const;

    expect(loanMatches(loan(), filters)).toBe(true);
    expect(loanMatches(loan({ beneficiary: "monotributistas" }), filters)).toBe(
      true,
    );
    expect(
      loanMatches(loan({ beneficiary: "empleados-publicos" }), filters),
    ).toBe(false);
  });

  it("needs the maximum term to reach the chosen one and the amount to fall within the range", () => {
    expect(loanMatches(loan(), { ...noFilters, plazo: 36 })).toBe(true);
    expect(loanMatches(loan(), { ...noFilters, plazo: 48 })).toBe(false);
    expect(loanMatches(loan(), { ...noFilters, monto: 5_000_000 })).toBe(true);
    expect(loanMatches(loan(), { ...noFilters, monto: 500 })).toBe(false);
    expect(
      loanMatches(loan({ amountMax: 0 }), { ...noFilters, monto: 500 }),
    ).toBe(false);
  });

  it("flags a loan CFT below 10% as unusually low", () => {
    expect(isUnusuallyLowCft(loan({ cft: 9.99 }))).toBe(true);
    expect(isUnusuallyLowCft(loan({ cft: 10 }))).toBe(false);
  });

  it("matches a province when the product is nationwide or lists it", () => {
    const filters = { ...noFilters, provincia: "salta" } as const;

    expect(loanMatches(loan(), filters)).toBe(true);
    expect(loanMatches(loan({ provinces: ["jujuy", "salta"] }), filters)).toBe(
      true,
    );
    expect(loanMatches(loan({ provinces: ["jujuy"] }), filters)).toBe(false);

    expect(
      cardMatches(card({ segment: null }), {
        segmento: "gold",
        provincia: null,
        pagina: 1,
      }),
    ).toBe(false);
  });
});

describe("one row per lender", () => {
  it("keeps each lender's cheapest product, counts its matches and orders lenders by that cost", () => {
    const rows = bestPerLender(
      [
        loan({ product: "CARO", cft: 300 }),
        loan({ product: "BARATO", cft: 95 }),
        loan({
          entityCode: 9,
          entity: "OTRA ENTIDAD",
          product: "UNICO",
          cft: 80,
        }),
      ],
      (row) => row.cft,
      (row) => row.tea,
    );

    expect(
      rows.map((row) => [row.best.entity, row.best.product, row.matches]),
    ).toEqual([
      ["OTRA ENTIDAD", "UNICO", 1],
      ["BANCO DE GALICIA Y BUENOS AIRES S.A.", "BARATO", 2],
    ]);
  });

  it("breaks a tie on cost with the second rate and then the product name", () => {
    const [row] = bestPerLender(
      [
        loan({ product: "B", tea: 60 }),
        loan({ product: "A", tea: 60 }),
        loan({ product: "C", tea: 90 }),
      ],
      (item) => item.cft,
      (item) => item.tea,
    );

    expect(row.best.product).toBe("A");
  });

  it("pages lenders, clamping a page past the last and giving an empty result one page", () => {
    const lenders = bestPerLender(
      Array.from({ length: RATES_PAGE_SIZE + 3 }, (_, index) =>
        loan({ entityCode: index, entity: `E${index}`, cft: index }),
      ),
      (row) => row.cft,
      (row) => row.tea,
    );

    expect(paginate(lenders, 2)).toMatchObject({
      page: 2,
      pages: 2,
      lenders: RATES_PAGE_SIZE + 3,
    });
    expect(paginate(lenders, 2).rows).toHaveLength(3);
    expect(paginate(lenders, 9).page).toBe(2);
    expect(paginate([], 1)).toMatchObject({
      rows: [],
      page: 1,
      pages: 1,
      lenders: 0,
      products: 0,
    });
  });
});
