import generated from "~/lib/transparency-rates.generated.json";
import {
  bestPerLender,
  cardMatches,
  loanMatches,
  mortgageMatches,
  paginate,
  type CardFilters,
  type CardProduct,
  type LoanFilters,
  type LoanProduct,
  type MortgageFilters,
  type MortgageProduct,
  type RatesPage,
  type TransparencyDataset,
} from "~/lib/transparency-rates";

/** Validated and reduced by `scripts/build-transparency-rates.py`; the Worker only filters it, so no request parses the BCRA's responses. */
const dataset = generated as TransparencyDataset;

export interface RatesPanelData<Product> extends RatesPage<Product> {
  builtOn: string;
}

export function getLoanPage(filters: LoanFilters): RatesPanelData<LoanProduct> {
  const lenders = bestPerLender(
    dataset.loans.filter((row) => loanMatches(row, filters)),
    (row) => row.cft,
    (row) => row.tea,
  );

  return {
    ...paginate(lenders, filters.pagina),
    builtOn: dataset.builtOn,
  };
}

export function getMortgagePage(
  filters: MortgageFilters,
): RatesPanelData<MortgageProduct> {
  const lenders = bestPerLender(
    dataset.mortgages.filter((row) => mortgageMatches(row, filters)),
    (row) => row.cft,
    (row) => row.tea,
  );

  return {
    ...paginate(lenders, filters.pagina),
    builtOn: dataset.builtOn,
  };
}

export function getCardPage(filters: CardFilters): RatesPanelData<CardProduct> {
  const lenders = bestPerLender(
    dataset.cards.filter((row) => cardMatches(row, filters)),
    (row) => row.financingTea,
    (row) => row.maintenanceFee ?? Number.POSITIVE_INFINITY,
  );

  return {
    ...paginate(lenders, filters.pagina),
    builtOn: dataset.builtOn,
  };
}
