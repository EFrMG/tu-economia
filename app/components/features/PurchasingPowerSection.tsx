import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { UnavailableNotice } from "~/components/ui/UnavailableNotice";
import { Skeleton } from "~/components/ui/Skeleton";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import type { IndicatorPoint } from "~/lib/indicators";
import { calculatePurchasingPower } from "~/lib/purchasing-power";
import { useAnchorHighlight } from "~/lib/use-anchor-highlight";

interface PurchasingPowerSectionProps {
  history: IndicatorPoint[] | null;
}

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

const monthLabel = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const formatMonth = (month: string) =>
  monthLabel.format(new Date(`${month}-01T12:00:00.000Z`));

const inputClassName = `border-base-700 bg-base-950 text-text-100 h-12 w-full border px-3 font-mono text-body-sm ${fieldFocusClassName}`;

export const PurchasingPowerLoading = () => {
  const borderClassName = useAnchorHighlight("poder-adquisitivo");

  return (
    <section
      id="poder-adquisitivo"
      className={`border bg-surface-950 p-4 motion-safe:transition-colors sm:p-5 ${borderClassName}`}
      aria-busy="true"
    >
      <div className="mb-5">
        <p className="mb-2 font-mono text-label-caps text-text-200 uppercase">
          Análisis histórico · IPC
        </p>
        <h2 className="font-heading text-headline-md text-text-100">
          Poder adquisitivo
        </h2>
        <p className="mt-1 text-body-sm text-text-200">
          Equivalencia de un monto anterior según la inflación publicada.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:items-end">
        {["Monto original en ARS", "Mes de origen", "Monto equivalente"].map(
          (label, index) => (
            <div
              key={label}
              className={index === 2 ? "md:col-span-2 xl:col-span-1" : ""}
            >
              <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                {label}
              </span>
              <div className="relative">
                {index === 0 ? (
                  <input type="number" disabled className={inputClassName} />
                ) : index === 1 ? (
                  <select
                    disabled
                    className={`${inputClassName} themed-select`}
                  >
                    <option value="" />
                  </select>
                ) : (
                  <output className="flex h-12 items-center border border-base-700 bg-base-950 px-3" />
                )}
                <Skeleton className="pointer-events-none absolute top-4 left-3 h-4 w-28" />
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
};

export const PurchasingPowerSection = ({
  history,
}: PurchasingPowerSectionProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const months = [
    ...new Set(history?.map((point) => point.date.slice(0, 7)) ?? []),
  ].sort();

  const latestMonth = months.at(-1);
  const eligibleMonths = months.filter((month) => month < (latestMonth ?? ""));
  const defaultMonth = eligibleMonths.at(-12) ?? eligibleMonths[0] ?? "";

  const urlMonth = eligibleMonths.includes(searchParams.get("ppFrom") ?? "")
    ? searchParams.get("ppFrom")!
    : defaultMonth;

  const [selectedMonth, setSelectedMonth] = useState(urlMonth);

  const [amountText, setAmountText] = useState(
    searchParams.get("ppAmount") ?? "100000",
  );

  useEffect(() => {
    setSelectedMonth(urlMonth);
  }, [urlMonth]);

  useEffect(() => {
    setAmountText(searchParams.get("ppAmount") ?? "100000");
  }, [searchParams.get("ppAmount")]);

  const updateUrl = (amount: string, month: string) => {
    if (
      searchParams.get("ppAmount") === amount &&
      searchParams.get("ppFrom") === month
    )
      return;

    const next = new URLSearchParams(searchParams);
    next.set("ppAmount", amount);
    next.set("ppFrom", month);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  const amount = amountText.trim() === "" ? Number.NaN : Number(amountText);

  const result = selectedMonth
    ? calculatePurchasingPower(amount, selectedMonth, history ?? [])
    : null;

  // Search's anchor; the loading state carries it too, since it has no heading id.
  const borderClassName = useAnchorHighlight("poder-adquisitivo");

  return (
    <section
      id="poder-adquisitivo"
      className={`border bg-surface-950 p-4 motion-safe:transition-colors sm:p-5 ${borderClassName}`}
      aria-labelledby="purchasing-power-title"
    >
      <div className="mb-5">
        <p className="mb-2 font-mono text-label-caps text-text-200 uppercase">
          Análisis histórico · IPC
        </p>
        <h2
          id="purchasing-power-title"
          className="font-heading text-headline-md text-text-100"
        >
          Poder adquisitivo
        </h2>
        <p className="mt-1 text-body-sm text-text-200">
          Equivalencia de un monto anterior según la inflación publicada.
        </p>
      </div>

      {!history ? (
        <UnavailableNotice>
          No fue posible consultar el historial de inflación.
        </UnavailableNotice>
      ) : !eligibleMonths.length ? (
        <UnavailableNotice>
          Se necesitan al menos dos meses publicados para realizar esta
          comparación.
        </UnavailableNotice>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:items-end">
            <label className="block min-w-0 p-0">
              <span className="mb-2 block font-mono text-data-label text-text-200 uppercase">
                Monto original en ARS
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
                Mes de origen
              </span>
              <select
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  updateUrl(amountText, event.target.value);
                }}
                className={`${inputClassName} themed-select`}
              >
                {eligibleMonths.map((month) => (
                  <option key={month} value={month}>
                    {formatMonth(month)}
                  </option>
                ))}
              </select>
            </label>
            <div className="min-w-0 md:col-span-2 xl:col-span-1">
              <span className="mx-auto mb-2 block w-fit max-w-full text-center font-mono text-data-label text-text-200 uppercase">
                Monto equivalente ·{" "}
                {latestMonth ? formatMonth(latestMonth) : "s/d"}
              </span>
              <output
                className="flex h-12 items-center justify-center overflow-x-auto border border-base-700 bg-base-950 px-3 font-mono text-body-lg whitespace-nowrap text-primary-text-100"
                aria-live="polite"
              >
                {result ? pesos.format(result.adjustedAmount) : "s/d"}
              </output>
            </div>
          </div>
          {result ? (
            <p className="mt-4 text-body-sm text-text-300">
              {pesos.format(amount)} de {formatMonth(result.fromMonth)} conserva
              aproximadamente el {percent.format(result.retainedPercent)}% de su
              poder de compra si se mantiene como efectivo hasta{" "}
              {formatMonth(result.throughMonth)}.
            </p>
          ) : (
            <UnavailableNotice className="mt-4">
              {Number.isFinite(amount) && amount > 0
                ? "No hay una secuencia mensual completa para calcular este período."
                : "Introduzca un monto mayor que cero para realizar la estimación."}
            </UnavailableNotice>
          )}
        </>
      )}
    </section>
  );
};
