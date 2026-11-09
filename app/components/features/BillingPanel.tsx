import { useEffect, useState } from "react";
import { Link } from "react-router";

import { deletionWarning } from "~/components/features/FinanceFields";
import {
  AccessStatus,
  SubscriptionOffer,
} from "~/components/features/SubscriptionOffer";
import { Button } from "~/components/ui/Button";
import { Skeleton } from "~/components/ui/Skeleton";
import type { AccountState } from "~/lib/finance-access";
import { SUBSCRIPTION_ANCHOR } from "~/lib/finance-tabs";
import { useAnchorHighlight } from "~/lib/use-anchor-highlight";

/** A status line with its action beside it. */
const actionRowClassName =
  "flex flex-wrap items-center justify-between gap-x-6 gap-y-3";

const SUBSCRIPTION_LOAD_ERROR = "No fue posible consultar la suscripción.";
const SUBSCRIPTION_UPDATE_ERROR =
  "No fue posible actualizar la suscripción. Intente nuevamente.";

/** The API sends a technical `error` with optional user-facing Spanish copy in `message`. */
const failureMessage = async (response: Response, fallback: string) => {
  try {
    const body = (await response.json()) as { message?: unknown };

    return typeof body.message === "string" && body.message
      ? body.message
      : fallback;
  } catch {
    return fallback;
  }
};

interface BillingStatus {
  entitled: boolean;
  status: string;
  trialEndsAt: string | null;
  paidUntil: string | null;
  canceledAt: string | null;
  /** The hosted checkout of a started enrollment that has no subscription yet, so it can be resumed. */
  checkoutURL: string | null;
}

interface BillingPanelProps {
  userId: string;
  access: AccountState["access"];
  /** From the page loader, so the offer renders before the billing request returns. */
  trialEligible: boolean;
  deletionDate: string | null;
}

export const BillingPanel = ({
  userId,
  access,
  trialEligible,
  deletionDate,
}: BillingPanelProps) => {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/billing", {
          credentials: "same-origin",
          cache: "no-store",
        });

        if (!response.ok) {
          const message = await failureMessage(
            response,
            SUBSCRIPTION_LOAD_ERROR,
          );
          if (active) setNotice(message);

          return;
        }

        const value = (await response.json()) as BillingStatus;
        if (active) setBilling(value);
      } catch {
        if (active) setNotice(SUBSCRIPTION_LOAD_ERROR);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [userId]);

  const change = async (method: "POST" | "DELETE") => {
    if (pending || (method === "POST" && !accepted)) return;

    setPending(true);
    setNotice(null);

    try {
      const response = await fetch("/api/billing", {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUserId: userId,
          ...(method === "POST" ? { acceptedTerms: true } : {}),
        }),
      });

      if (!response.ok)
        throw new Error(
          await failureMessage(response, SUBSCRIPTION_UPDATE_ERROR),
        );

      const result = (await response.json()) as {
        checkoutURL?: string;
        reconciliationRequired?: boolean;
      };

      if (method === "POST") {
        if (!result.checkoutURL)
          throw new Error("El enlace de Mercado Pago no está disponible.");

        window.location.assign(result.checkoutURL);

        return;
      }

      setBilling((previous) =>
        previous
          ? {
              ...previous,
              status: "canceled",
              canceledAt: new Date().toISOString(),
            }
          : previous,
      );

      // The cancelled-status block below announces the outcome, so no separate notice repeats it.
      setReconciliationRequired(Boolean(result.reconciliationRequired));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No fue posible actualizar la suscripción.",
      );
    } finally {
      setPending(false);
    }
  };

  const accessUntil = [billing?.trialEndsAt, billing?.paidUntil]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  // Arriving from an upsell link marks this card as the place to act.
  const borderClassName = useAnchorHighlight(SUBSCRIPTION_ANCHOR);

  // The live status takes over once loaded, in case billing changed since the page rendered.
  const startsTrial = billing ? billing.status === "none" : trialEligible;

  const awaitingActivation =
    billing?.status === "authorized" &&
    !billing.trialEndsAt &&
    !billing.paidUntil;

  const canSubscribe =
    billing !== null &&
    !billing.entitled &&
    !awaitingActivation &&
    billing.status !== "creating" &&
    billing.status !== "pending";

  return (
    <section
      id={SUBSCRIPTION_ANCHOR}
      aria-labelledby="billing-title"
      className={`stack-4 scroll-mt-24 border bg-surface-950 p-4 motion-safe:transition-colors motion-safe:duration-1000 sm:p-5 ${borderClassName}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3
          id="billing-title"
          className="font-heading text-body-lg text-text-100"
        >
          Suscripción a Mi economía
        </h3>
        {/* Without a subscription the card itself is the offer, so a "Solo lectura" tag would only repeat it. */}
        {access === "read-only" ? null : <AccessStatus access={access} />}
      </div>
      {access === "read-only" && deletionDate ? (
        <p className="text-body-sm text-tertiary-text-200">
          {deletionWarning(deletionDate).trim()}
        </p>
      ) : null}
      <SubscriptionOffer trialEligible={startsTrial} />
      <div className="stack-2">
        <p className="max-w-2xl text-body-sm text-text-300">
          Renovación automática; cancele cuando quiera y conserve el acceso
          hasta el final del período.
        </p>
        <p className="max-w-2xl text-body-sm text-text-400">
          Si no renueva, podrá consultar, exportar o eliminar sus registros
          durante tres meses.
        </p>
      </div>
      {loading ? (
        <>
          <span className="sr-only" role="status">
            Consultando la suscripción.
          </span>
          <div className="stack-2">
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-4 w-2/3 max-w-md" />
            <Skeleton className="h-9 w-48" />
          </div>
        </>
      ) : null}
      {canSubscribe && !startsTrial ? (
        <p className="text-body-sm text-text-300">
          Como ya tuvo una suscripción, esta inscripción no incluye otro mes
          gratis: el primer cobro se realiza al autorizar el medio de pago.
        </p>
      ) : null}
      {billing?.entitled && accessUntil ? (
        <div className={actionRowClassName}>
          <p className="text-body-sm text-text-200">
            Acceso completo hasta{" "}
            {new Date(accessUntil).toLocaleDateString("es-AR")}.
          </p>
          {billing.status === "authorized" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => change("DELETE")}
            >
              Cancelar renovación
            </Button>
          ) : null}
        </div>
      ) : null}
      {canSubscribe ? (
        <>
          <label className="flex cursor-pointer items-center gap-3 text-body-sm text-text-300">
            {/* A styled box replaces the small native control; the input stays real for keyboard and assistive technology. */}
            <span className="relative grid size-5 shrink-0 place-items-center">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="peer size-5 appearance-none border border-base-700 bg-surface-900 checked:border-primary-500 checked:bg-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 motion-safe:transition-colors"
              />
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                strokeWidth="2"
                className="pointer-events-none absolute size-3.5 stroke-base-950 opacity-0 peer-checked:opacity-100"
              >
                <path d="M3 8.5l3 3 7-7" />
              </svg>
            </span>
            {startsTrial
              ? "Autorizo a Mercado Pago a debitar ARS 5.000 por mes después del primer mes, hasta que cancele."
              : "Autorizo a Mercado Pago a debitar ARS 5.000 por mes desde la autorización, hasta que cancele."}
          </label>
          <p className="text-body-sm text-text-400">
            Al marcar la casilla y continuar, acepta los{" "}
            <Link
              to="/terms"
              className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
            >
              términos del servicio
            </Link>
            .
          </p>
          <Button
            type="button"
            className="w-full"
            disabled={!accepted || pending}
            onClick={() => change("POST")}
          >
            Continuar en Mercado Pago
          </Button>
        </>
      ) : null}
      {billing?.status === "pending" ? (
        <div className={actionRowClassName}>
          <p className="text-body-sm text-text-300">
            {billing.checkoutURL
              ? "Mercado Pago todavía no confirmó la inscripción. Si no llegó a completarla, puede retomarla desde el mismo enlace."
              : "Estamos esperando la confirmación de Mercado Pago."}
          </p>
          {billing.checkoutURL ? (
            <Button href={billing.checkoutURL} variant="outline" size="sm">
              Retomar en Mercado Pago
            </Button>
          ) : null}
        </div>
      ) : null}
      {awaitingActivation ? (
        <p className="text-body-sm text-text-300">
          Estamos verificando el primer pago. El acceso se habilita cuando se
          confirme.
        </p>
      ) : null}
      {billing?.status === "creating" ? (
        <p className="text-body-sm text-text-300">
          No se pudo confirmar la inscripción con Mercado Pago. Contacte a
          soporte antes de volver a intentar.
        </p>
      ) : null}
      {/* Once access has ended, the offer above already says what comes next. */}
      {billing?.status === "canceled" &&
      (billing.entitled || reconciliationRequired) ? (
        <div role="status" className="stack-2 text-body-sm">
          {reconciliationRequired ? (
            <p className="text-tertiary-text-200">
              Cancelamos la suscripción identificada, pero falta verificar si
              hay otras. Contacte a soporte.
            </p>
          ) : (
            <>
              <p className="text-tertiary-text-200">
                La renovación se canceló.
              </p>
              <p className="text-secondary-text-100">
                Conserva su acceso hasta el fin del período vigente.
              </p>
            </>
          )}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="text-body-sm text-tertiary-text-100">
          {notice}
        </p>
      ) : null}
    </section>
  );
};
