import type { ReactNode } from "react";

import { CurrencyConverter } from "~/components/features/CurrencyConverter";
import { ExchangeRateCard } from "~/components/features/ExchangeRateCard";
import { HighlightRateCard } from "~/components/features/HighlightRateCard";
import type { DashboardRates } from "~/lib/exchange-rates.server";
import { rateCardId } from "~/lib/exchange-rate-search";
import { formatGap } from "~/lib/format";

export const MARKET_GRID_CASAS = [
  "oficial",
  "bolsa",
  "contadoconliqui",
  "cripto",
] as const;

/** Whether the rates should be fetched again: missing, stale, or without a grid rate. */
export const marketRatesIncomplete = (rates: DashboardRates | null) =>
  !rates ||
  rates.freshness.status === "stale" ||
  MARKET_GRID_CASAS.some(
    (casa) => !rates.grid.some((rate) => rate.casa === casa),
  );

/** The official rate is the reference, so it is compared against the blue. */
function footnoteFor(casa: string, brecha: Record<string, number>) {
  const gap = casa === "oficial" ? brecha.blue : brecha[casa];
  if (gap === undefined) return "Brecha: s/d";

  return `Brecha${casa === "oficial" ? " blue" : ""}: ${formatGap(gap)}`;
}

interface MarketRatesProps {
  /** `null` while loading or when the live rates are unavailable. */
  rates: DashboardRates | null;
  loading?: boolean;
  title: string;
  /** The lead under the title; replaced by a stale-data line while stale. */
  lead: string;
  /** The converter under the header, on the Resumen. */
  withConverter?: boolean;
  /** The other four quotations, on the Dólar page. */
  withGrid?: boolean;
  /** Content after the grid, inside the same busy region. */
  children?: ReactNode;
}

/** The blue highlight beside the page title, then the converter, the other four quotations, or both. */
export const MarketRates = ({
  rates,
  loading = false,
  title,
  lead,
  withConverter = false,
  withGrid = true,
  children,
}: MarketRatesProps) => {
  const isStale = rates?.freshness.status === "stale";

  const gridByCasa = new Map(
    rates?.grid.map((rate) => [rate.casa, rate]) ?? [],
  );

  return (
    <div className="stack-10" aria-busy={loading}>
      {loading ? (
        <span className="sr-only" role="status">
          Cargando cotizaciones del mercado.
        </span>
      ) : null}

      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="mb-auto stack-2">
          <h1 className="font-heading text-headline-lg text-text-100">
            {title}
          </h1>
          <p className="max-w-2xl text-body-lg text-text-200">
            {isStale
              ? "Mostramos los últimos datos disponibles mientras se restablece la consulta."
              : lead}
          </p>
        </div>

        <HighlightRateCard
          rate={rates?.highlight ?? null}
          id={rateCardId("blue")}
          loading={loading}
        />
      </header>

      {withConverter ? (
        <CurrencyConverter
          rates={rates ? [rates.highlight, ...rates.grid] : []}
          loading={loading}
        />
      ) : null}

      {withGrid ? (
        <section>
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="shrink-0 border-b border-primary-500/30 pb-1 font-mono text-label-caps whitespace-nowrap text-text-200 uppercase">
              ARS-USD
            </h2>
            {/* While stale, the quote time already dates the values shown; the line turns amber and says so instead of a separate notice. */}
            {rates ? (
              <span
                className={`font-mono text-data-label ${isStale ? "text-tertiary-text-400" : "text-text-400"}`}
                role={isStale ? "status" : undefined}
              >
                Última actualización:{" "}
                {rates.updatedAt ? `${rates.updatedAt} ART` : "s/d"}
                {isStale ? " (sin actualizar)" : null}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MARKET_GRID_CASAS.map((casa) => (
              <ExchangeRateCard
                key={casa}
                casa={casa}
                rate={gridByCasa.get(casa) ?? null}
                footnote={rates ? footnoteFor(casa, rates.brecha) : ""}
                id={rateCardId(casa)}
                loading={loading}
              />
            ))}
          </div>
        </section>
      ) : null}

      {children}
    </div>
  );
};
