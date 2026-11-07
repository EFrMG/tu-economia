import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/components/ui/Button";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import type { FinanceActionResult, LocalCategory } from "~/lib/local-finance";

interface ActionFormProps {
  intent: string;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  resetOnSuccess?: boolean;
  confirmMessage?: string;
  /** Keeps the submit button disabled, e.g. until a typed confirmation matches. */
  submitDisabled?: boolean;
  /** Runs once after a successful save, e.g. to close an inline editor. */
  onSuccess?: () => void;
}

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export const money = (cents: number) => pesos.format(cents / 100);

export const moneyInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? ""
    : (cents / 100).toFixed(2).replace(".", ",");

export const monthLabel = (month: string) =>
  monthFormatter.format(new Date(`${month}-01T00:00:00.000Z`));

export const dateLabel = (date: string) =>
  dateFormatter.format(new Date(`${date}T00:00:00.000Z`));

const deadlineFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** A stored timestamp as an Argentine calendar date, e.g. "31 de julio de 2026". */
export const deadlineLabel = (timestamp: string) =>
  deadlineFormatter.format(new Date(timestamp));

/** The retention warning shown wherever a lapsed account reads its records. */
export const deletionWarning = (deletionDate: string | null) =>
  deletionDate
    ? ` Si no reactiva la suscripción, sus registros se eliminarán el ${deadlineLabel(deletionDate)}.`
    : "";

export const ActionForm = ({
  intent,
  submitLabel,
  children,
  className = "",
  variant = "secondary",
  resetOnSuccess = false,
  confirmMessage,
  submitDisabled = false,
  onSuccess,
}: ActionFormProps) => {
  const fetcher = useFetcher<FinanceActionResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<FinanceActionResult | undefined>(undefined);
  /** An earlier result retires as soon as the user edits the form again, so a stale success never sits beside a fresh error. */
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) return;

    if (handled.current === fetcher.data) return;

    handled.current = fetcher.data;
    if (resetOnSuccess) formRef.current?.reset();

    onSuccess?.();
  }, [fetcher.data, fetcher.state, resetOnSuccess, onSuccess]);

  // A new result, success or error, republishes the status for its own message.
  useEffect(() => {
    setDismissed(false);
  }, [fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      encType={intent === "data.import" ? "multipart/form-data" : undefined}
      ref={formRef}
      className={className}
      preventScrollReset
      onInput={() => setDismissed(true)}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage))
          event.preventDefault();
      }}
    >
      <input type="hidden" name="_intent" value={intent} />
      {children}
      <Button
        type="submit"
        variant={variant}
        size="sm"
        className={variant === "ghost" ? "" : "min-h-11"}
        disabled={submitDisabled || fetcher.state !== "idle"}
      >
        {fetcher.state === "idle" ? submitLabel : "Guardando…"}
      </Button>
      {fetcher.data && !dismissed ? (
        <p
          className={`basis-full text-body-sm sm:self-center ${fetcher.data.ok ? "text-secondary-text-100" : "text-tertiary-text-200"}`}
          role="status"
        >
          {fetcher.data.message}
        </p>
      ) : null}
    </fetcher.Form>
  );
};

export const MoneyInput = ({
  name = "amount",
  defaultValue,
  label,
  id,
  className = "",
}: {
  name?: string;
  defaultValue?: number | null;
  label: string;
  id: string;
  className?: string;
}) => (
  <div className={`stack-2 min-w-0 flex-1 ${className}`}>
    <label
      htmlFor={id}
      className="font-mono text-data-label text-text-200 uppercase"
    >
      {label}
    </label>
    <input
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      pattern="[0-9]+([,.][0-9]{1,2})?"
      title="Escriba pesos sin separadores de miles; puede usar coma para los centavos."
      placeholder="Ej. 250000,00"
      defaultValue={moneyInput(defaultValue)}
      required
      className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 font-mono text-body-sm text-text-100 placeholder:text-text-400 ${fieldFocusClassName}`}
    />
  </div>
);

export const ExpenseDescriptionInput = ({
  id,
  defaultValue = "",
}: {
  id: string;
  defaultValue?: string;
}) => (
  <div className="stack-2 min-w-0 flex-1">
    <label
      htmlFor={id}
      className="font-mono text-data-label text-text-200 uppercase"
    >
      Descripción (opcional)
    </label>
    <input
      id={id}
      name="description"
      type="text"
      maxLength={100}
      autoComplete="off"
      placeholder="Ej. Supermercado"
      defaultValue={defaultValue}
      className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 placeholder:text-text-400 ${fieldFocusClassName}`}
    />
  </div>
);

export const CategorySelect = ({
  categories,
  id,
  defaultValue,
  archivedCategory,
}: {
  categories: LocalCategory[];
  id: string;
  defaultValue?: string;
  archivedCategory?: LocalCategory;
}) => (
  <div className="stack-2 min-w-0 flex-1">
    <label
      htmlFor={id}
      className="font-mono text-data-label text-text-200 uppercase"
    >
      Categoría
    </label>
    <select
      id={id}
      name="categoryId"
      defaultValue={defaultValue}
      required
      className={`themed-select w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`}
    >
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
      {archivedCategory ? (
        <option value={archivedCategory.id}>
          {archivedCategory.name} (archivada)
        </option>
      ) : null}
    </select>
  </div>
);
