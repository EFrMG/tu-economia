import { SiGoogle } from "react-icons/si";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "~/components/ui/Button";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import { authClient } from "~/lib/auth-client";
import { ACCOUNT_ANCHOR, financeHref } from "~/lib/finance-tabs";
import { useAnchorHighlight } from "~/lib/use-anchor-highlight";

export interface AccountAccessProps {
  googleEnabled: boolean;
  googleLinked: boolean;
  emailEnabled: boolean;
  email: string | null;
}

/** Auth providers return here, so callbacks and their `?error=` land on the Usuario tab. */
const CALLBACK_URL = financeHref("usuario");

const EMAIL_SENT_NOTICE = "Revise su correo para continuar.";

/**
 * Sign-in, Google linking and sign-out for the Usuario tab. It never reads or uploads the local finance records; transfers stay in the sync panel.
 */
export const AccountAccess = ({
  googleEnabled,
  googleLinked,
  emailEnabled,
  email,
}: AccountAccessProps) => {
  const [searchParams] = useSearchParams();
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Arriving from "Crear cuenta" marks this card as the place to act.
  const borderClassName = useAnchorHighlight(ACCOUNT_ANCHOR);

  const available = googleEnabled || emailEnabled;
  const preview = import.meta.env.DEV ? searchParams.get("preview") : null;

  const previewNotice =
    preview === "sent"
      ? "Vista previa: aquí confirmaremos el envío del enlace. No se envió ningún correo."
      : preview === "error"
        ? "Vista previa: aquí explicaremos cómo reintentar si no se puede enviar el enlace."
        : null;

  const callbackError =
    searchParams.get("error") === "account_not_linked"
      ? "Esta cuenta de Google todavía no está vinculada. Inicie sesión con su método habitual y vincule Google desde su cuenta."
      : searchParams.has("error")
        ? "No pudimos completar el acceso. Inténtelo nuevamente."
        : null;

  const statusNotice = notice ?? callbackError ?? previewNotice;

  // A completed send reads in the reassuring tone; a failed access callback is a genuine failure.
  const statusTone =
    !notice && callbackError
      ? "text-red-text-400"
      : statusNotice === EMAIL_SENT_NOTICE
        ? "text-secondary-text-100"
        : "text-tertiary-text-200";

  const sendLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!emailEnabled || pending) return;

    setPending(true);
    setNotice(null);

    try {
      const result = await authClient.signIn.magicLink({
        email: address,
        callbackURL: CALLBACK_URL,
      });

      setNotice(
        result.error
          ? "No pudimos enviar el enlace. Inténtelo nuevamente."
          : EMAIL_SENT_NOTICE,
      );
    } catch {
      setNotice("No pudimos enviar el enlace. Inténtelo nuevamente.");
    } finally {
      setPending(false);
    }
  };

  const continueWithGoogle = async (link = false) => {
    if (!googleEnabled || pending) return;

    setPending(true);
    setNotice(null);

    try {
      const result = link
        ? await authClient.linkSocial({
            provider: "google",
            callbackURL: CALLBACK_URL,
          })
        : await authClient.signIn.social({
            provider: "google",
            callbackURL: CALLBACK_URL,
          });

      if (result.error)
        setNotice(
          "No pudimos iniciar el acceso con Google. Inténtelo nuevamente.",
        );
    } catch {
      setNotice(
        "No pudimos iniciar el acceso con Google. Inténtelo nuevamente.",
      );
    } finally {
      setPending(false);
    }
  };

  const signOut = async () => {
    setPending(true);
    setNotice(null);

    try {
      const result = await authClient.signOut();
      if (result.error)
        setNotice("No pudimos cerrar la sesión. Inténtelo nuevamente.");
      else window.location.assign(CALLBACK_URL);
    } catch {
      setNotice("No pudimos cerrar la sesión. Inténtelo nuevamente.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      id={ACCOUNT_ANCHOR}
      aria-labelledby="account-access-title"
      className={`stack-6 scroll-mt-24 border bg-surface-950 p-4 motion-safe:transition-colors motion-safe:duration-1000 sm:p-6 ${borderClassName}`}
    >
      <header className="stack-4">
        {/* The available sign-in methods and the session state speak for themselves; no badge is needed for either. */}
        <h2
          id="account-access-title"
          className="font-heading text-headline-md text-text-100"
        >
          {email ? "Su cuenta" : "Acceda o cree su cuenta"}
        </h2>
        {!email && available ? (
          <p className="text-body-sm text-text-300">
            No necesita contraseña: si el correo no tiene una cuenta, el enlace
            la crea al ingresar.
          </p>
        ) : null}
        {/* Stays mounted while empty so screen readers announce the result of each sign-in action; `sr-only` takes it out of the flex flow until then, so it adds no gap. */}
        <p
          id="account-access-status"
          className={`text-center text-body-sm empty:sr-only ${statusTone}`}
          role="status"
        >
          {statusNotice}
        </p>
      </header>

      {email ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="stack-2 min-w-0">
            <span className="font-mono text-data-label text-text-200 uppercase">
              Cuenta
            </span>
            <p className="font-mono text-data-label wrap-break-word text-text-100">
              {email}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={signOut}
              className="min-h-11"
            >
              Cerrar sesión
            </Button>
            {googleEnabled && !googleLinked ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => continueWithGoogle(true)}
                className="min-h-11 gap-3"
              >
                <SiGoogle aria-hidden="true" />
                Vincular Google
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="stack-6" aria-describedby="account-access-status">
          <form onSubmit={sendLink} className="stack-4">
            <div className="stack-2">
              <label
                htmlFor="account-email"
                className="font-mono text-data-label text-text-200 uppercase"
              >
                Correo electrónico
              </label>
              <input
                id="account-email"
                name="email"
                type="email"
                required
                disabled={!emailEnabled || pending}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="email"
                placeholder="nombre@correo.com"
                className={`w-full border border-base-700 bg-surface-900 px-3 py-2.5 text-body-sm text-text-100 placeholder:text-text-400 disabled:cursor-not-allowed disabled:opacity-60 ${fieldFocusClassName}`}
              />
            </div>
            <Button
              type="submit"
              disabled={!emailEnabled || pending}
              className="w-full"
            >
              Enviar enlace de acceso
            </Button>
          </form>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-base-700" />
            <span className="font-mono text-label-caps text-text-400 uppercase">
              o
            </span>
            <span className="h-px flex-1 bg-base-700" />
          </div>

          <Button
            type="button"
            variant="secondary"
            disabled={!googleEnabled || pending}
            onClick={() => continueWithGoogle()}
            className="w-full gap-3"
          >
            <SiGoogle aria-hidden="true" />
            Continuar con Google
          </Button>
        </div>
      )}

      <p className="border-t border-base-700 pt-5 text-center text-body-sm text-text-400">
        Puede consultar la{" "}
        <Link
          to="/privacy"
          className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
        >
          política de privacidad actual
        </Link>
        .
      </p>
    </section>
  );
};
