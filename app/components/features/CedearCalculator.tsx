import { Suspense, useEffect, useId, useState, type ReactNode } from "react";
import { Await, useSearchParams } from "react-router";

import { Skeleton } from "~/components/ui/Skeleton";
import { UnavailableStatus } from "~/components/ui/UnavailableNotice";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import {
  DEFAULT_REFERENCE_RATE,
  REFERENCE_RATES,
  UNAVAILABLE_REFERENCE_RATES,
  calculateCedear,
  fieldParamValue,
  fieldTextFromParam,
  formatInputNumber,
  parseAmount,
  parseRatio,
  referenceQuote,
  referenceRateFromParam,
  referenceRateLabel,
  type CalculatorParam,
  type ReferenceRateId,
  type ReferenceRates,
} from "~/lib/cedear-calculator";
import { formatAmount, formatSignedChange } from "~/lib/format";

type TextField = "precio" | "ratio" | "mercado";

type FieldTexts = Record<TextField, string>;

interface CalculatorForm {
  texts: FieldTexts;
  /** The typed exchange rate; `null` while the field follows the live rate. */
  rateText: string | null;
  reference: ReferenceRateId;
  setText: (field: TextField, value: string) => void;
  commit: (field: TextField) => void;
  setRateText: (value: string) => void;
  commitRate: () => void;
  /** Selects a reference rate; a typed rate is dropped when the new reference has a live value to follow. */
  selectReference: (id: ReferenceRateId, hasLiveRate: boolean) => void;
  /** Drops the typed rate and follows the live one again. */
  followLiveRate: () => void;
}

/**
 * The calculator's state. Fields keep their own text while the visitor types and write the URL on blur, so a typed-but-unblurred value is never overwritten by an unrelated query change:
 * each field resyncs only when its own parameter changes to something other than what the field already holds.
 * It lives above the streamed rates, so a revalidation that suspends them does not reset what the visitor typed.
 */
function useCalculatorForm(): CalculatorForm {
  const [searchParams, setSearchParams] = useSearchParams();

  const [texts, setTexts] = useState<FieldTexts>(() => ({
    precio: fieldTextFromParam("precio", searchParams.get("precio")),
    ratio: fieldTextFromParam("ratio", searchParams.get("ratio")),
    mercado: fieldTextFromParam("mercado", searchParams.get("mercado")),
  }));

  const [rateText, setRateTextState] = useState<string | null>(() => {
    const tc = searchParams.get("tc");

    return tc === null ? null : fieldTextFromParam("tc", tc);
  });

  const precioParam = searchParams.get("precio");
  const ratioParam = searchParams.get("ratio");
  const mercadoParam = searchParams.get("mercado");
  const tcParam = searchParams.get("tc");

  const syncField = (field: TextField, raw: string | null) =>
    setTexts((current) =>
      fieldParamValue(field, current[field]) === raw
        ? current
        : { ...current, [field]: fieldTextFromParam(field, raw) },
    );

  useEffect(() => {
    syncField("precio", precioParam);
  }, [precioParam]);

  useEffect(() => {
    syncField("ratio", ratioParam);
  }, [ratioParam]);

  useEffect(() => {
    syncField("mercado", mercadoParam);
  }, [mercadoParam]);

  useEffect(() => {
    setRateTextState((current) => {
      if (current !== null && fieldParamValue("tc", current) === tcParam)
        return current;

      return tcParam === null ? null : fieldTextFromParam("tc", tcParam);
    });
  }, [tcParam]);

  const writeParams = (
    changes: Partial<Record<CalculatorParam, string | null>>,
  ) => {
    const next = new URLSearchParams(searchParams);

    for (const [param, value] of Object.entries(changes)) {
      if (value === null) next.delete(param);
      else next.set(param, value);
    }

    if (next.toString() === searchParams.toString()) return;

    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  return {
    texts,
    rateText,
    reference: referenceRateFromParam(searchParams.get("referencia")),
    setText: (field, value) =>
      setTexts((current) => ({ ...current, [field]: value })),
    commit: (field) =>
      writeParams({ [field]: fieldParamValue(field, texts[field]) }),
    setRateText: (value) => setRateTextState(value),
    commitRate: () => {
      if (rateText === null) return;

      if (rateText.trim() === "") {
        setRateTextState(null);
        writeParams({ tc: null });

        return;
      }

      writeParams({ tc: fieldParamValue("tc", rateText) });
    },
    selectReference: (id, hasLiveRate) => {
      if (hasLiveRate) setRateTextState(null);

      writeParams({
        referencia: id === DEFAULT_REFERENCE_RATE ? null : id,
        ...(hasLiveRate ? { tc: null } : {}),
      });
    },
    followLiveRate: () => {
      setRateTextState(null);
      writeParams({ tc: null });
    },
  };
}

const inputClassName = `border-base-700 bg-base-950 text-text-100 h-12 w-full border px-3 font-mono text-body-sm placeholder:text-text-400 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-tertiary-500/50 ${fieldFocusClassName}`;

const labelClassName = "font-mono text-data-label text-text-200 uppercase";

const outputClassName =
  "flex items-center overflow-x-auto border border-base-700 bg-base-950 px-3 font-mono whitespace-nowrap";

const pesos = (value: number) => `ARS ${formatAmount(value)}`;

const signedPesos = (value: number) =>
  `ARS ${value >= 0 ? "+" : "-"}${formatAmount(Math.abs(value))}`;

interface FieldProps {
  id: string;
  label: string;
  /** The line under the field: a hint, or the amber notice when the value cannot be read. */
  helper: ReactNode;
  invalid: boolean;
  children: (describedBy: string) => ReactNode;
}

const Field = ({ id, label, helper, invalid, children }: FieldProps) => (
  <div className="min-w-0">
    <div className="mb-2 flex h-5 items-center">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
    </div>
    {children(`${id}-helper`)}
    <p
      id={`${id}-helper`}
      className="mt-2 min-h-[1.5em] text-body-sm text-text-400"
    >
      {invalid ? (
        <UnavailableStatus>Valor no válido</UnavailableStatus>
      ) : (
        helper
      )}
    </p>
  </div>
);

interface ReferenceToggleProps {
  reference: ReferenceRateId;
  rates: ReferenceRates | null;
  onSelect: (id: ReferenceRateId, hasLiveRate: boolean) => void;
}

/** Two native radios styled as the app's segmented control (the chart period selector), so the keyboard and screen readers treat it as one choice and it works without JavaScript. */
const ReferenceToggle = ({
  reference,
  rates,
  onSelect,
}: ReferenceToggleProps) => {
  const name = useId();

  return (
    <fieldset className="w-fit min-w-0 shrink-0 self-center sm:self-auto">
      {/* Named for assistive technology only, like the chart's period selector; the rate field's label shows the choice. */}
      <legend className="sr-only">Tipo de cambio de referencia</legend>
      <div className="flex w-fit border border-base-700">
        {REFERENCE_RATES.map((rate) => (
          // `p-0` clears the reset's label padding, so the inner span fills the option edge to edge like the chart's buttons.
          <label key={rate.id} className="relative cursor-pointer p-0">
            <input
              type="radio"
              name={name}
              value={rate.id}
              checked={reference === rate.id}
              onChange={() =>
                onSelect(rate.id, referenceQuote(rates, rate.id) !== null)
              }
              className="peer sr-only"
            />
            <span className="btn-click-soft block px-3 py-2 font-mono text-data-label text-text-200 transition-colors peer-checked:bg-primary-500 peer-checked:text-base-950 peer-focus-visible:outline peer-focus-visible:outline-primary-500/50 peer-[:not(:checked)]:hocus:bg-surface-900/80 peer-[:not(:checked)]:hocus:text-text-100">
              {rate.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};

interface RateOriginProps {
  form: CalculatorForm;
  rates: ReferenceRates | null;
}

/**
 * The quote behind the rate, in a slot that keeps its height in every state. It names the rate, not the provider: the page footer credits Dólar API once, and the field's helper says whether the value was typed.
 */
const RateOrigin = ({ form, rates }: RateOriginProps) => {
  const label = referenceRateLabel(form.reference);
  const live = referenceQuote(rates, form.reference);
  const manual = form.rateText !== null;

  const content =
    rates === null && !manual ? (
      <Skeleton className="h-4 w-3/4" />
    ) : manual ? (
      live ? (
        <>
          <span>
            El {label} de venta cotiza a {pesos(live.venta)}.
          </span>{" "}
          <button
            type="button"
            onClick={form.followLiveRate}
            className="font-mono text-label-caps text-primary-text-100 uppercase underline-offset-4 focus-visible:outline-none hocus:underline"
          >
            Usar esta cotización
          </button>
        </>
      ) : rates !== null ? (
        <UnavailableStatus>
          No fue posible consultar el {label}.
        </UnavailableStatus>
      ) : null
    ) : live && rates?.status === "available" ? (
      <>
        <span>
          {label} de venta, cotización del{" "}
          {live.updatedAt ? `${live.updatedAt} ART` : "s/d"}.
        </span>{" "}
        {rates.stale ? (
          <UnavailableStatus>
            Sin actualizar: última consulta exitosa {rates.fetchedAtLabel} ART.
          </UnavailableStatus>
        ) : null}
      </>
    ) : (
      <UnavailableStatus>
        No fue posible consultar el {label}. Ingrese el tipo de cambio para
        calcular.
      </UnavailableStatus>
    );

  return (
    <p className="min-h-[3em] text-body-sm text-text-300" aria-live="polite">
      {content}
    </p>
  );
};

interface ResultCellProps {
  label: string;
  loading?: boolean;
  children: ReactNode;
}

const ResultCell = ({ label, loading = false, children }: ResultCellProps) => (
  <div className="min-w-0">
    <span className={`mb-2 block ${labelClassName}`}>{label}</span>
    <output className={`${outputClassName} h-12 text-body-lg text-text-100`}>
      {loading ? <Skeleton className="h-5 w-24" /> : children}
    </output>
  </div>
);

interface CedearCalculatorProps {
  form: CalculatorForm;
  /** `null` while the rates load. */
  rates: ReferenceRates | null;
}

const CedearCalculator = ({ form, rates }: CedearCalculatorProps) => {
  const id = useId();
  const label = referenceRateLabel(form.reference);
  const live = referenceQuote(rates, form.reference);
  const manual = form.rateText !== null;
  const rateLoading = rates === null && !manual;

  const rateFieldText = manual
    ? form.rateText!
    : live
      ? formatInputNumber(live.venta)
      : "";

  const underlying = parseAmount("precio", form.texts.precio);
  const ratio = parseRatio(form.texts.ratio);
  const market = parseAmount("mercado", form.texts.mercado);
  const rate = manual
    ? parseAmount("tc", form.rateText!)
    : (live?.venta ?? null);

  const result = calculateCedear({
    underlying,
    ratio: ratio?.value ?? null,
    rate,
    market,
  });

  const invalid = (field: TextField, value: unknown) =>
    form.texts[field].trim() !== "" && value === null;

  const rateInvalid = manual && form.rateText!.trim() !== "" && rate === null;

  const pending =
    result.theoretical === null
      ? "Complete el precio del subyacente, el ratio y el tipo de cambio para obtener el precio teórico."
      : market === null
        ? "Ingrese el precio de mercado del CEDEAR para compararlo con el precio teórico."
        : null;

  return (
    <section
      id="calculadora"
      className="stack-6 min-w-0"
      aria-labelledby={`${id}-title`}
      aria-busy={rateLoading}
    >
      {rateLoading ? (
        <span className="sr-only" role="status">
          Cargando el tipo de cambio.
        </span>
      ) : null}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="stack-2">
          <h2
            id={`${id}-title`}
            className="font-heading text-headline-md text-text-100"
          >
            Precio teórico de un CEDEAR
          </h2>
          <p className="max-w-3xl text-body-sm text-text-300">
            Ingrese el precio de la acción en su mercado de origen y el ratio de
            conversión del CEDEAR. El tipo de cambio se completa con el CCL o el
            MEP de venta.
          </p>
        </div>

        <ReferenceToggle
          reference={form.reference}
          rates={rates}
          onSelect={form.selectReference}
        />
      </div>

      <div className="stack-4 border border-base-700 bg-surface-950 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field
            id={`${id}-precio`}
            label="Precio del subyacente (US$)"
            helper="Por acción, en dólares."
            invalid={invalid("precio", underlying)}
          >
            {(describedBy) => (
              <input
                id={`${id}-precio`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej. 100"
                value={form.texts.precio}
                onChange={(event) => form.setText("precio", event.target.value)}
                onBlur={() => form.commit("precio")}
                aria-invalid={invalid("precio", underlying) || undefined}
                aria-describedby={describedBy}
                className={inputClassName}
              />
            )}
          </Field>

          <Field
            id={`${id}-ratio`}
            label="Ratio de conversión"
            helper="CEDEAR por acción: 20 o 20:1."
            invalid={invalid("ratio", ratio)}
          >
            {(describedBy) => (
              <input
                id={`${id}-ratio`}
                type="text"
                autoComplete="off"
                placeholder="Ej. 20:1"
                value={form.texts.ratio}
                onChange={(event) => form.setText("ratio", event.target.value)}
                onBlur={() => form.commit("ratio")}
                aria-invalid={invalid("ratio", ratio) || undefined}
                aria-describedby={describedBy}
                className={inputClassName}
              />
            )}
          </Field>

          <Field
            id={`${id}-tc`}
            label={`Tipo de cambio ${label} (ARS por US$)`}
            helper={
              rateLoading
                ? null
                : manual
                  ? "Valor ingresado por usted."
                  : live
                    ? "Puede reemplazarlo por otro valor."
                    : "Ingrese el valor."
            }
            invalid={rateInvalid}
          >
            {(describedBy) => (
              <input
                id={`${id}-tc`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={rateLoading ? "" : "Ej. 1000"}
                disabled={rateLoading}
                value={rateFieldText}
                onChange={(event) => form.setRateText(event.target.value)}
                onBlur={form.commitRate}
                aria-invalid={rateInvalid || undefined}
                aria-describedby={`${describedBy} ${id}-origin`}
                className={inputClassName}
              />
            )}
          </Field>

          <Field
            id={`${id}-mercado`}
            label="Precio de mercado del CEDEAR (ARS)"
            helper="Opcional, para comparar."
            invalid={invalid("mercado", market)}
          >
            {(describedBy) => (
              <input
                id={`${id}-mercado`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Opcional"
                value={form.texts.mercado}
                onChange={(event) =>
                  form.setText("mercado", event.target.value)
                }
                onBlur={() => form.commit("mercado")}
                aria-invalid={invalid("mercado", market) || undefined}
                aria-describedby={describedBy}
                className={inputClassName}
              />
            )}
          </Field>
        </div>

        <div id={`${id}-origin`}>
          <RateOrigin form={form} rates={rates} />
        </div>

        <div className="stack-4 border-t border-base-700 pt-5">
          <div className="min-w-0">
            <span className={`mb-2 block ${labelClassName}`}>
              Precio teórico del CEDEAR
            </span>
            <output
              className={`${outputClassName} h-16 text-data-display text-primary-text-100`}
              aria-live="polite"
            >
              {result.theoretical === null ? "s/d" : pesos(result.theoretical)}
            </output>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <ResultCell label="Tipo de cambio implícito">
              {result.impliedRate === null ? "s/d" : pesos(result.impliedRate)}
            </ResultCell>
            <ResultCell label={`Diferencia con el ${label}`}>
              {result.rateGapPct === null
                ? "s/d"
                : formatSignedChange(result.rateGapPct)}
            </ResultCell>
            <ResultCell label="Prima (+) o descuento (−)">
              {result.premium === null || result.premiumPct === null
                ? "s/d"
                : `${signedPesos(result.premium)} (${formatSignedChange(result.premiumPct)})`}
            </ResultCell>
          </div>

          <p className="min-h-[3em] text-body-sm text-text-400">
            {pending ??
              "La prima o el descuento compara el precio de mercado con el teórico."}
          </p>
        </div>
      </div>

      <p className="text-body-sm text-text-400">
        Precio teórico = precio del subyacente × tipo de cambio ÷ ratio. No
        contempla comisiones, impuestos ni dividendos, y el ratio de cada
        programa puede cambiar.
      </p>
    </section>
  );
};

interface CedearCalculatorPanelProps {
  /** The streamed reference rates; `null` before loader data exists. */
  rates: Promise<ReferenceRates> | null;
}

/** The calculator with its rates streamed; the form state sits outside the boundary, so it survives a suspended revalidation. */
export const CedearCalculatorPanel = ({
  rates,
}: CedearCalculatorPanelProps) => {
  const form = useCalculatorForm();

  if (rates === null) return <CedearCalculator form={form} rates={null} />;

  return (
    <Suspense fallback={<CedearCalculator form={form} rates={null} />}>
      <Await
        resolve={rates}
        errorElement={
          <CedearCalculator form={form} rates={UNAVAILABLE_REFERENCE_RATES} />
        }
      >
        {(resolved) => <CedearCalculator form={form} rates={resolved} />}
      </Await>
    </Suspense>
  );
};
