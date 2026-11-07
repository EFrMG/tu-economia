import { useState } from "react";
import { MdSwapHoriz } from "react-icons/md";

import { RATE_PRESENTATION } from "~/components/features/rate-presentation";
import { UnavailableStatus } from "~/components/ui/UnavailableNotice";
import { Skeleton } from "~/components/ui/Skeleton";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import {
  convertCurrency,
  type ConversionDirection,
} from "~/lib/currency-converter";
import type { ExchangeRate } from "~/lib/exchange-rates.server";
import { formatAmount } from "~/lib/format";

interface CurrencyConverterProps {
  rates: ExchangeRate[];
  loading?: boolean;
}

const inputClassName = `border-base-700 bg-base-950 text-text-100 h-12 w-full border px-3 font-mono text-body-sm disabled:cursor-not-allowed disabled:opacity-50 ${fieldFocusClassName}`;

const CurrencyConverter = ({
  rates,
  loading = false,
}: CurrencyConverterProps) => {
  const [selectedCasa, setSelectedCasa] = useState<ExchangeRate["casa"] | "">(
    rates[0]?.casa ?? "",
  );

  const [direction, setDirection] = useState<ConversionDirection>("ars-to-usd");
  const [amount, setAmount] = useState("100000");

  const hasQuotes = rates.length > 0;
  const controlsDisabled = loading || !hasQuotes;

  // The select must always point at a quote the source still offers: fall back to the first one when the stored choice is empty (quotes arrived after mount) or no longer present in the response.
  const activeCasa = rates.some((rate) => rate.casa === selectedCasa)
    ? selectedCasa
    : (rates[0]?.casa ?? "");

  const quote = rates.find((rate) => rate.casa === activeCasa);
  const numericAmount = amount.trim() === "" ? Number.NaN : Number(amount);
  const converted = convertCurrency(numericAmount, quote, direction);

  const sourceCurrency = direction === "ars-to-usd" ? "ARS" : "USD";
  const targetCurrency = direction === "ars-to-usd" ? "USD" : "ARS";
  const rateSide = direction === "ars-to-usd" ? "venta" : "compra";
  const selectedRate = quote?.[rateSide];

  const swapDirection = () => {
    setDirection((current) =>
      current === "ars-to-usd" ? "usd-to-ars" : "ars-to-usd",
    );
  };

  return (
    <section
      className="border border-base-700 bg-surface-950 p-4 sm:p-5"
      aria-labelledby="currency-converter-title"
    >
      <div className="mb-5">
        <h2
          id="currency-converter-title"
          className="font-heading text-headline-md text-text-100"
        >
          Conversor rápido
        </h2>
        <p className="mt-1 text-body-sm text-text-200">
          Estimación según la cotización seleccionada.
        </p>
      </div>

      {/* The form stays in place when quotes are unavailable, so the section never changes height. */}
      <div className="currency-converter-grid grid gap-4 md:items-end">
        <label className="block min-w-0 p-0">
          <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
            Cotización
          </span>
          <select
            disabled={controlsDisabled}
            value={activeCasa}
            onChange={(event) =>
              setSelectedCasa(event.target.value as ExchangeRate["casa"])
            }
            className={`${inputClassName} themed-select`}
          >
            {hasQuotes ? (
              rates.map((rate) => (
                <option key={rate.casa} value={rate.casa}>
                  {RATE_PRESENTATION[rate.casa].title}
                </option>
              ))
            ) : (
              <option value="">Sin cotizaciones</option>
            )}
          </select>
        </label>

        <button
          disabled={controlsDisabled}
          type="button"
          onClick={swapDirection}
          className="btn-click-soft flex h-12 w-12 items-center justify-center justify-self-center border border-base-700 text-primary-text-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:justify-self-auto hocus:border-primary-500/50 hocus:bg-surface-900/80"
          aria-label={`Cambiar conversión de ${sourceCurrency} a ${targetCurrency}`}
        >
          <MdSwapHoriz className="text-xl" aria-hidden="true" />
        </button>

        <label className="block min-w-0 p-0">
          <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
            Monto en {sourceCurrency}
          </span>
          <input
            disabled={controlsDisabled}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={inputClassName}
          />
        </label>

        <div className="min-w-0 md:col-span-3 xl:col-span-1">
          <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
            Resultado estimado en {targetCurrency}
          </span>
          <output
            className="flex h-12 items-center overflow-x-auto border border-base-700 bg-base-950 px-3 font-mono text-body-lg whitespace-nowrap text-primary-text-100"
            aria-live="polite"
          >
            {loading ? (
              <Skeleton className="h-5 w-28" />
            ) : converted === null ? (
              "s/d"
            ) : (
              `${targetCurrency} ${formatAmount(converted)}`
            )}
          </output>
        </div>
      </div>

      {/* One helper slot for every state: it carries the notice when there is nothing to convert. */}
      <p className="mt-4 ml-auto min-h-[1.5em] text-right text-body-sm text-text-400">
        {loading ? (
          <Skeleton className="ml-auto h-4 w-3/4" />
        ) : !hasQuotes ? (
          <UnavailableStatus>
            No hay cotizaciones disponibles para realizar conversiones.
          </UnavailableStatus>
        ) : (
          <>
            {selectedRate && Number.isFinite(selectedRate) && selectedRate > 0
              ? `Cotización usada: ${quote?.nombre} (${rateSide}), ARS ${formatAmount(selectedRate)} por USD.`
              : "La cotización seleccionada no está disponible."}
          </>
        )}
      </p>
    </section>
  );
};

export { CurrencyConverter };
