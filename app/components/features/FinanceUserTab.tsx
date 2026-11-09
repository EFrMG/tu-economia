import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { AccountAccess } from "~/components/features/AccountAccess";
import { BillingPanel } from "~/components/features/BillingPanel";
import {
  ActionForm,
  deletionWarning,
} from "~/components/features/FinanceFields";
import {
  AccessStatus,
  SubscriptionOffer,
} from "~/components/features/SubscriptionOffer";
import { Button } from "~/components/ui/Button";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import type { AccountState } from "~/lib/finance-access";
import { financeHref } from "~/lib/finance-tabs";

const accessDetail: Record<AccountState["access"], string> = {
  unavailable:
    "No fue posible acceder a sus registros en este momento. Puede recorrer las secciones de ejemplo y volver a intentar más tarde. No se modificó ningún registro.",
  "signed-out":
    "Puede recorrer las secciones de ejemplo. Para registrar sus datos, cree una cuenta y active la suscripción.",
  "read-only":
    "Su suscripción no está activa. Puede consultar, exportar o eliminar sus registros; para modificarlos, active la suscripción.",
  edit: "Sus registros se guardan en su cuenta y están disponibles en cualquier dispositivo donde inicie sesión.",
};

/** The record status card for visitors without a subscription card: signed out, or signed in while billing is off. The storage intro only addresses signed-out visitors. */
const StorageStatus = ({ account }: { account: AccountState }) => (
  // The section stretches so the card centers in the column beside the account card (below the pinned intro when signed out) without growing itself.
  <section aria-label="Su acceso" className="stack-6 flex flex-1 flex-col">
    {!account.email ? (
      <div className="stack-2">
        <h2 className="font-heading text-headline-md text-text-100">
          Su acceso
        </h2>
        <SubscriptionOffer
          trialEligible={account.trialEligible}
          leadClassName="max-w-xl text-body-sm text-text-300"
        />
        <Link
          to="/terms"
          className="ml-auto block w-fit font-mono text-data-label text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
        >
          Ver condiciones
        </Link>
      </div>
    ) : null}
    <dl className="my-auto border border-base-700 bg-surface-950">
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-2 p-4 sm:p-5">
        <dt className="font-mono text-label-caps text-text-200 uppercase">
          Registro personal
        </dt>
        <dd>
          <AccessStatus access={account.access} />
        </dd>
        <dd className="col-span-2 text-body-sm text-text-400">
          {accessDetail[account.access]}
          {account.access === "read-only"
            ? deletionWarning(account.deletionDate)
            : null}
        </dd>
      </div>
    </dl>
  </section>
);

const confirmLabelClassName =
  "font-mono text-data-label text-text-200 uppercase";

const confirmInputClassName = `w-full max-w-xs border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 ${fieldFocusClassName}`;

/** One task per row: what it does on the left, its controls on the right, on the same 5/7 split as the cards above. */
const DataRow = ({
  title,
  titleClassName = "text-text-100",
  description,
  children,
}: {
  title: string;
  titleClassName?: string;
  description: ReactNode;
  children: ReactNode;
}) => (
  <div className="grid gap-4 py-6 lg:grid-cols-12 lg:gap-8">
    <div className="stack-2 lg:col-span-5">
      <h3 className={`font-heading text-body-lg ${titleClassName}`}>{title}</h3>
      <p className="max-w-xl text-body-sm text-text-300">{description}</p>
    </div>
    <div className="lg:col-span-7 lg:self-center">{children}</div>
  </div>
);

/** A styled picker over the native file input, which stays in the form for submission, validation and assistive technology. The button waits for a chosen file, as the deletion rows wait for their word. */
const RecordsImport = ({ editable }: { editable: boolean }) => {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <DataRow
      title="Importar copia"
      description={
        editable
          ? "Reemplace todos sus registros por los de una copia exportada."
          : "Reemplace todos sus registros por los de una copia exportada. Requiere una suscripción activa."
      }
    >
      <fieldset disabled={!editable} className="min-w-0">
        <ActionForm
          intent="data.import"
          submitLabel="Importar copia"
          confirmMessage="La importación reemplazará todos sus registros de Mi economía. ¿Desea continuar?"
          className="flex flex-wrap items-center gap-3"
          submitDisabled={fileName === null}
          resetOnSuccess
          onSuccess={() => setFileName(null)}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <input
              id="import-file"
              name="file"
              type="file"
              accept="application/json,.json"
              required
              onChange={(event) =>
                setFileName(event.target.files?.[0]?.name ?? null)
              }
              className="peer sr-only"
            />
            <label
              htmlFor="import-file"
              className="btn-click-soft inline-flex min-h-11 cursor-pointer items-center border border-base-700 bg-surface-900 px-3 font-mono text-xs font-medium tracking-tight text-text-100 uppercase peer-focus-visible:border-primary-500/50 peer-disabled:pointer-events-none peer-disabled:opacity-50 hocus:bg-overlay-950"
            >
              Elegir archivo
            </label>
            <span className="min-w-0 truncate text-body-sm text-text-400">
              {fileName ?? "Ningún archivo seleccionado"}
            </span>
          </div>
        </ActionForm>
      </fieldset>
    </DataRow>
  );
};

/** Typed confirmations accept any letter case and surrounding spaces. */
const confirms = (value: string, word: string) =>
  value.trim().toUpperCase() === word;

const RecordsDeletion = () => {
  const [confirmation, setConfirmation] = useState("");

  return (
    <DataRow
      title="Eliminar registros"
      description="Elimina todos sus registros y conserva la cuenta y la suscripción."
    >
      <ActionForm
        intent="data.clear"
        submitLabel="Eliminar registros"
        variant="outline"
        className="flex flex-wrap items-end gap-3"
        submitDisabled={!confirms(confirmation, "BORRAR")}
        onSuccess={() => setConfirmation("")}
      >
        <div className="stack-2 w-full max-w-xs">
          <label
            htmlFor="delete-confirmation"
            className={confirmLabelClassName}
          >
            Escriba "BORRAR" para confirmar
          </label>
          <input
            id="delete-confirmation"
            name="confirmation"
            type="text"
            required
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className={confirmInputClassName}
          />
        </div>
      </ActionForm>
    </DataRow>
  );
};

const AccountDeletion = ({ userId }: { userId: string }) => {
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const deleteAccount = async () => {
    if (pending || !confirms(confirmation, "ELIMINAR")) return;

    setPending(true);
    setNotice(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUserId: userId,
          confirmation: "ELIMINAR",
        }),
      });

      if (!response.ok) throw new Error("No fue posible eliminar la cuenta.");

      window.location.assign(financeHref("usuario"));
    } catch {
      setNotice(
        "No fue posible eliminar la cuenta. Sus registros no se modificaron; intente nuevamente.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <DataRow
      title="Eliminar cuenta"
      titleClassName="text-red-text-300"
      description="Se cancelará la renovación de la suscripción y se eliminarán la cuenta y todos sus registros. Exporte una copia antes si desea conservarlos."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="stack-2 w-full max-w-xs">
          <label
            htmlFor="account-deletion-confirmation"
            className={confirmLabelClassName}
          >
            Escriba "ELIMINAR" para confirmar
          </label>
          <input
            id="account-deletion-confirmation"
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            className={confirmInputClassName}
          />
        </div>
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="min-h-11"
          disabled={pending || !confirms(confirmation, "ELIMINAR")}
          onClick={deleteAccount}
        >
          Eliminar cuenta
        </Button>
        {notice ? (
          <p
            className="basis-full text-body-sm text-tertiary-text-200"
            role="status"
          >
            {notice}
          </p>
        ) : null}
      </div>
    </DataRow>
  );
};

const DataControls = ({
  account,
  userId,
}: {
  account: AccountState;
  userId: string;
}) => (
  <section
    aria-labelledby="data-controls-title"
    className="border-t border-base-700 pt-8"
  >
    <h2
      id="data-controls-title"
      className="font-heading text-headline-md text-text-100"
    >
      Sus datos
    </h2>
    <div className="divide-y divide-base-700">
      <DataRow
        title="Exportar copia"
        description="Descargue una copia JSON de sus registros en cualquier momento, incluso si la suscripción no está activa. Consérvela en un lugar seguro: contiene su información financiera personal."
      >
        <Button
          href="/api/finance-export"
          isExternal
          target="_self"
          download
          variant="outline"
          size="md"
          className="min-h-11"
        >
          Exportar copia JSON
        </Button>
      </DataRow>
      <RecordsImport editable={account.access === "edit"} />
      <RecordsDeletion />
      <AccountDeletion key={userId} userId={userId} />
    </div>
  </section>
);

export const FinanceUserTab = ({ account }: { account: AccountState }) => (
  <div className="stack-10">
    <div className="grid gap-8 lg:grid-cols-12">
      {/* With billing on, the subscription card carries the record status itself, so the separate status card would only repeat it. */}
      <div className="stack-8 lg:col-span-5">
        {account.userId && account.billingEnabled ? (
          <BillingPanel
            userId={account.userId}
            access={account.access}
            trialEligible={account.trialEligible}
            deletionDate={account.deletionDate}
          />
        ) : (
          <StorageStatus account={account} />
        )}
      </div>
      <div className="lg:col-span-7 lg:self-center">
        <AccountAccess
          googleEnabled={account.googleEnabled}
          googleLinked={account.googleLinked}
          emailEnabled={account.emailEnabled}
          email={account.email}
        />
      </div>
    </div>
    {account.userId ? (
      <DataControls account={account} userId={account.userId} />
    ) : null}
  </div>
);
