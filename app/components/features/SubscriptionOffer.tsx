import type { AccountState } from "~/lib/finance-access";

const accessLabel: Record<AccountState["access"], string> = {
  unavailable: "No disponible",
  "signed-out": "Requiere cuenta",
  "read-only": "Solo lectura",
  edit: "Activa",
};

/** The record status shown beside a card title. */
export const AccessStatus = ({
  access,
}: {
  access: AccountState["access"];
}) => (
  <span
    className={`shrink-0 font-mono text-data-label ${access === "edit" ? "text-secondary-text-100" : "text-tertiary-text-200"}`}
  >
    {accessLabel[access]}
  </span>
);

/** The one wording of the offer, shared by the month-tab notice, the signed-out intro and the billing card. It renders two paragraphs without margins, so the caller's `stack-*` sets the gap between them; `leadClassName` sets the lead's type for that context. Without it only the price renders, for the billing card, whose title already names the subscription. */
export const SubscriptionOffer = ({
  trialEligible,
  leadClassName,
}: {
  trialEligible: boolean;
  leadClassName?: string;
}) => (
  <>
    {leadClassName ? (
      <p className={leadClassName}>
        Guarde y edite sus registros con una suscripción a Mi economía.
      </p>
    ) : null}
    <p className="font-sans text-headline-md font-normal text-text-100">
      {trialEligible ? (
        <>
          El primer mes es{" "}
          <strong className="font-semibold text-secondary-text-100">
            Gratis
          </strong>
          ; después, ARS 5.000 por mes.
        </>
      ) : (
        "ARS 5.000 por mes."
      )}
    </p>
  </>
);
