import { redirect } from "react-router";

import type { Route } from "./+types/tasas";
import {
  CardFilterForm,
  CardTable,
  LoanFilterForm,
  LoanTable,
  RatesPanelSwitch,
} from "~/components/features/RatesTables";
import { RouteError } from "~/components/layout/RouteError";
import { RouteFooter } from "~/components/ui/RouteFooter";
import { pageMeta } from "~/lib/meta";
import {
  DEFAULT_RATES_PANEL,
  isRatesPanel,
  parseCardFilters,
  parseLoanFilters,
  ratesSearch,
} from "~/lib/transparency-rates";
import { getCardPage, getLoanPage } from "~/lib/transparency-rates.server";

export function meta() {
  return pageMeta({
    title: "Tasas",
    description:
      "Costo financiero total y tasas máximas de préstamos personales y tarjetas de crédito por entidad, según lo que cada una informa al BCRA.",
    path: "/tasas",
  });
}

/**
 * Resolves `?panel=` and the panel's filters, and redirects any other query to its canonical form: unknown or invalid values and the other panel's
 * parameters are removed, and a page past the last becomes the last. A bare `/tasas` shows the default panel without a redirect.
 * The data is bundled, so the loader only filters it and nothing streams.
 */
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("panel");
  const panel = isRatesPanel(requested) ? requested : DEFAULT_RATES_PANEL;

  const loanFilters =
    panel === "prestamos" ? parseLoanFilters(url.searchParams) : null;

  const cardFilters =
    panel === "tarjetas" ? parseCardFilters(url.searchParams) : null;

  const loans = loanFilters ? getLoanPage(loanFilters) : null;
  const cards = cardFilters ? getCardPage(cardFilters) : null;

  const canonical = loanFilters
    ? ratesSearch(panel, { ...loanFilters, pagina: loans!.page })
    : ratesSearch(panel, { ...cardFilters!, pagina: cards!.page });

  // A client navigation requests `/tasas.data?_routes=…`; that parameter and path belong to React Router, not to the page's query.
  const query = new URLSearchParams(url.searchParams);
  query.delete("_routes");

  if (query.size && canonical.toString() !== query.toString())
    throw redirect(`/tasas?${canonical}`);

  return { panel, loanFilters, loans, cardFilters, cards };
}

/** Shared by the page and its error state, so the page keeps its title in both. */
const TasasHeader = () => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">Tasas</h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      Costo financiero total y tasas máximas de préstamos personales y tarjetas
      de crédito, por entidad, tal como cada una los informa al BCRA.
    </p>
  </header>
);

const TasasFooter = () => (
  <RouteFooter>
    <p>Fuente: BCRA, Régimen de Transparencia.</p>
  </RouteFooter>
);

export default function Tasas({ loaderData }: Route.ComponentProps) {
  const { loanFilters, loans, cardFilters, cards } = loaderData;

  return (
    <div className="stack-10">
      <TasasHeader />

      <div className="stack-6">
        <RatesPanelSwitch />

        {loanFilters && loans ? (
          <>
            <LoanFilterForm filters={loanFilters} />
            <LoanTable data={loans} filters={loanFilters} />
          </>
        ) : null}

        {cardFilters && cards ? (
          <>
            <CardFilterForm filters={cardFilters} />
            <CardTable data={cards} filters={cardFilters} />
          </>
        ) : null}
      </div>

      <TasasFooter />
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="stack-10">
      <TasasHeader />
      <RatesPanelSwitch />
      <RouteError
        title="Tasas no disponibles"
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
    </div>
  );
}
