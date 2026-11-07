import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { UnavailableNotice } from "~/components/ui/UnavailableNotice";
import { Skeleton } from "~/components/ui/Skeleton";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import {
  simulateDeposit,
  type DepositInflationComparison,
} from "~/lib/deposit-inflation";

interface DepositInflationSectionProps {
  comparisons: DepositInflationComparison[] | null;
}

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const signedPercent = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

const monthLabel = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dateLabel = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const formatMonth = (month: string) =>
  monthLabel.format(new Date(`${month}-01T12:00:00.000Z`));

const formatDate = (date: string) =>
  dateLabel.format(new Date(`${date}T12:00:00.000Z`));

const inputClassName = `border-base-700 bg-base-950 text-text-100 h-12 w-full border px-3 font-mono text-body-sm ${fieldFocusClassName}`;

const outputClassName =
  "border-base-700 bg-base-950 font-mono flex items-center overflow-x-auto border px-3 whitespace-nowrap";

export const DepositInflationLoading = () => (
  <section
    className="border border-base-700 bg-surface-950 p-4 sm:p-5"
    aria-busy="true"
  >
    <div className="mb-5">
      <p className="mb-2 font-mono text-label-caps text-text-200 uppercase">
        Análisis histórico · 30 días
      </p>
      <h2 className="font-heading text-headline-md text-text-100">
        Depósito e inflación
      </h2>
      <p className="mt-1 text-body-sm text-text-200">
        Simulación para un mes calendario de 30 días con datos publicados.
      </p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {["Monto simulado en ARS", "Mes de referencia"].map((label, index) => (
        <div key={label}>
          <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
            {label}
          </span>
          <div className="relative">
            {index === 0 ? (
              <input type="number" disabled className={inputClassName} />
            ) : (
              <select disabled className={`${inputClassName} themed-select`}>
                <option value="" />
              </select>
            )}
            <Skeleton className="pointer-events-none absolute top-4 left-3 h-4 w-28" />
          </div>
        </div>
      ))}
    </div>
    <Skeleton className="mt-5 mb-4 h-4 w-2/3" />
    <div className="grid gap-4 sm:grid-cols-2">
      {["Saldo final simulado", "Poder de compra equivalente"].map((label) => (
        <div key={label}>
          <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
            {label}
          </span>
          <div className="flex h-16 items-center border border-base-700 bg-base-950 px-3">
            <Skeleton className="h-8 w-36" />
          </div>
          <Skeleton className="mt-2 h-4 w-3/4" />
        </div>
      ))}
    </div>
    <div className="mt-5 border-t border-base-700 pt-5">
      <p className="mb-4 font-mono text-label-caps text-text-200 uppercase">
        Tasas del período
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {["Retorno nominal", "Inflación mensual", "Retorno real"].map(
          (label) => (
            <div key={label}>
              <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                {label}
              </span>
              <div className="flex h-12 items-center border border-base-700 bg-base-950 px-3">
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  </section>
);

export const DepositInflationSection = ({
  comparisons,
}: DepositInflationSectionProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const available = comparisons ?? [];

  const urlMonth = available.some(
    (item) => item.month === searchParams.get("depositMonth"),
  )
    ? searchParams.get("depositMonth")!
    : (available.at(-1)?.month ?? "");

  const [selectedMonth, setSelectedMonth] = useState(urlMonth);

  const [amountText, setAmountText] = useState(
    searchParams.get("depositAmount") ?? "100000",
  );

  useEffect(() => {
    setSelectedMonth(urlMonth);
  }, [urlMonth]);

  useEffect(() => {
    setAmountText(searchParams.get("depositAmount") ?? "100000");
  }, [searchParams.get("depositAmount")]);

  const updateUrl = (amount: string, month: string) => {
    if (
      searchParams.get("depositAmount") === amount &&
      searchParams.get("depositMonth") === month
    )
      return;

    const next = new URLSearchParams(searchParams);
    next.set("depositAmount", amount);
    next.set("depositMonth", month);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  const selected = available.find((item) => item.month === selectedMonth);
  const amount = amountText.trim() === "" ? Number.NaN : Number(amountText);
  const estimate = selected ? simulateDeposit(amount, selected) : null;

  return (
    <section
      className="border border-base-700 bg-surface-950 p-4 sm:p-5"
      aria-labelledby="deposit-inflation-title"
    >
      <div className="mb-5">
        <p className="mb-2 font-mono text-label-caps text-text-200 uppercase">
          Análisis histórico · 30 días
        </p>
        <h2
          id="deposit-inflation-title"
          className="font-heading text-headline-md text-text-100"
        >
          Depósito e inflación
        </h2>
        <p className="mt-1 text-body-sm text-text-200">
          Simulación para un mes calendario de 30 días con datos publicados.
        </p>
      </div>

      {!comparisons ? (
        <UnavailableNotice>
          No fue posible consultar las series necesarias para esta comparación.
        </UnavailableNotice>
      ) : !available.length ? (
        <UnavailableNotice>
          No hay meses de 30 días con inflación y una tasa previa reciente para
          comparar.
        </UnavailableNotice>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block min-w-0 p-0">
              <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                Monto simulado en ARS
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="any"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                onBlur={() => updateUrl(amountText, selectedMonth)}
                className={inputClassName}
              />
            </label>
            <label className="block min-w-0 p-0">
              <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                Mes de referencia
              </span>
              <select
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  updateUrl(amountText, event.target.value);
                }}
                className={`${inputClassName} themed-select`}
              >
                {available.map((item) => (
                  <option key={item.month} value={item.month}>
                    {formatMonth(item.month)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selected && estimate ? (
            <div className="mt-5">
              <p className="mb-4 font-mono text-data-label text-text-400">
                Simulación para {pesos.format(amount)} · TNA de referencia
                publicada el {formatDate(selected.rateDate)}.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                    Saldo final simulado
                  </span>
                  <output
                    className={`${outputClassName} h-16 text-data-display text-primary-text-100`}
                    aria-live="polite"
                  >
                    {pesos.format(estimate.finalAmount)}
                  </output>
                  <p className="mt-2 text-body-sm text-text-400">
                    Monto nominal al final de 30 días.
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                    Poder de compra equivalente
                  </span>
                  <output
                    className={`${outputClassName} h-16 text-data-display text-text-100`}
                    aria-live="polite"
                  >
                    {pesos.format(estimate.initialMonthPurchasingPower)}
                  </output>
                  <p className="mt-2 text-body-sm text-text-400">
                    Valor expresado en pesos del inicio de{" "}
                    {formatMonth(selected.month)}.
                  </p>
                </div>
              </div>
              <div className="mt-5 border-t border-base-700 pt-5">
                <p className="mb-4 font-mono text-label-caps text-text-200 uppercase">
                  Tasas del período
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="min-w-0">
                    <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                      Retorno nominal
                    </span>
                    <output
                      className={`${outputClassName} h-12 text-body-lg text-primary-text-100`}
                    >
                      {signedPercent.format(selected.nominalReturnPercent)}%
                    </output>
                  </div>
                  <div className="min-w-0">
                    <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                      Inflación mensual
                    </span>
                    <output
                      className={`${outputClassName} h-12 text-body-lg text-text-100`}
                    >
                      {percent.format(selected.inflation)}%
                    </output>
                  </div>
                  <div className="min-w-0">
                    <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                      Retorno real
                    </span>
                    <output
                      className={`${outputClassName} h-12 text-body-lg ${selected.realReturnPercent < 0 ? "text-red-text-400" : "text-text-100"}`}
                    >
                      {signedPercent.format(selected.realReturnPercent)}%
                    </output>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <UnavailableNotice className="mt-4">
              Introduzca un monto mayor que cero para realizar la comparación.
            </UnavailableNotice>
          )}
        </>
      )}
    </section>
  );
};
