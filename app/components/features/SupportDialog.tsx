import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  MdFavorite,
  MdOutlineBugReport,
  MdOutlineCheck,
  MdOutlineClose,
  MdOutlineContentCopy,
  MdOutlineMailOutline,
} from "react-icons/md";

import { Button } from "~/components/ui/Button";
import {
  MERCADO_PAGO_ALIAS,
  SUPPORT_DONATIONS,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO_URL,
  SUPPORT_REPOSITORY_ISSUES_URL,
} from "~/lib/support";

interface SupportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Focus target used when the element that opened the dialog is no longer visible, such as the closed mobile drawer. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

type CopyState = "idle" | "copied" | "failed";

const SupportDialog = ({
  open,
  onClose,
  returnFocusRef,
}: SupportDialogProps) => {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const panelRef = useRef<HTMLDivElement>(null);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);

  const titleId = useId();
  const descriptionId = useId();
  const donationsTitleId = useId();
  const contactTitleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(
    () => () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    },
    [],
  );

  // The dialog owns focus and keyboard navigation while it is open, then hands focus back to wherever it was opened from.
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const fallback = returnFocusRef?.current;

    const focusFrame = requestAnimationFrame(() => panel?.focus());
    const focusableSelector = "a[href], button:not([disabled])";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();

        return;
      }

      if (event.key !== "Tab" || !panel) return;

      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((item) => item.getClientRects().length > 0);

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);

      const target =
        opener && opener.getClientRects().length > 0 ? opener : fallback;

      target?.focus();
    };
  }, [open, returnFocusRef]);

  const copyAlias = async () => {
    try {
      await navigator.clipboard.writeText(MERCADO_PAGO_ALIAS);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    if (copyTimeout.current) clearTimeout(copyTimeout.current);

    copyTimeout.current = setTimeout(() => setCopyState("idle"), 2000);
  };

  if (!open) return null;

  const copyFeedback =
    copyState === "copied"
      ? "Alias copiado"
      : copyState === "failed"
        ? "No se pudo copiar el alias"
        : "";
  const copyLabel =
    copyState === "copied"
      ? "Alias copiado"
      : copyState === "failed"
        ? "Reintentar"
        : "Mercado Pago Alias";

  return createPortal(
    <div className="fixed inset-0 z-60 overflow-y-auto bg-base-950/85 backdrop-blur-sm">
      <div
        className="flex min-h-full items-center justify-center p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto border border-base-700 bg-surface-950 focus:outline-none"
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-base-700 bg-surface-950 p-6">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-red-500/30 bg-red-500/15 text-red-text-300">
                <MdFavorite
                  className="text-2xl motion-safe:animate-heartbeat"
                  aria-hidden="true"
                />
              </span>
              <div className="stack-2 min-w-0">
                <h2 id={titleId} className="text-headline-md text-text-100">
                  Soporte
                </h2>
                <p id={descriptionId} className="text-body-sm text-text-300">
                  Canales de contacto y formas de colaborar con Tu Economía.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-click-soft flex h-8 w-8 shrink-0 items-center justify-center border border-base-700 text-text-300 transition-colors focus-visible:outline-none hocus:border-primary-500/50 hocus:text-text-100"
              aria-label="Cerrar soporte"
            >
              <MdOutlineClose className="text-lg" aria-hidden="true" />
            </button>
          </div>

          <div className="stack-6 p-6">
            <section aria-labelledby={donationsTitleId} className="stack-4">
              <div className="stack-2">
                <h3
                  id={donationsTitleId}
                  className="font-mono text-data-label text-text-200 uppercase"
                >
                  Apoye el proyecto
                </h3>
                <p className="text-body-sm text-text-300">
                  Tu Economía es un proyecto independiente. Si le resulta útil,
                  puede colaborar con su mantenimiento y desarrollo a través de
                  estas plataformas.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {SUPPORT_DONATIONS.map(({ label, href }) => (
                  <Button
                    key={label}
                    href={href}
                    isExternal
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    {label}
                  </Button>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyAlias}
                  aria-label="Copiar alias de Mercado Pago"
                  className="w-full gap-2 sm:col-span-2 sm:w-[calc(50%-0.25rem)] sm:justify-self-center"
                >
                  {copyState === "copied" ? (
                    <MdOutlineCheck className="text-base" aria-hidden="true" />
                  ) : (
                    <MdOutlineContentCopy
                      className="text-base"
                      aria-hidden="true"
                    />
                  )}
                  {copyLabel}
                </Button>
              </div>

              <p role="status" className="sr-only">
                {copyFeedback}
              </p>
            </section>

            <section
              aria-labelledby={contactTitleId}
              className="stack-4 border-t border-base-700 pt-6"
            >
              <div className="stack-2">
                <h3
                  id={contactTitleId}
                  className="font-mono text-data-label text-text-200 uppercase"
                >
                  Ayuda y comentarios
                </h3>
                <p className="text-body-sm text-text-300">
                  Reporte un problema en el repositorio público o envíe sus
                  comentarios por correo. Ambos canales llegan directamente al
                  autor del proyecto.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  href={SUPPORT_REPOSITORY_ISSUES_URL}
                  isExternal
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                >
                  <MdOutlineBugReport
                    className="text-base"
                    aria-hidden="true"
                  />
                  Reportar un problema
                </Button>
                <Button
                  href={SUPPORT_MAILTO_URL}
                  variant="secondary"
                  size="sm"
                  className="flex-1 gap-2"
                >
                  <MdOutlineMailOutline
                    className="text-base"
                    aria-hidden="true"
                  />
                  Enviar un correo
                </Button>
              </div>

              <p className="text-center font-mono text-body-sm break-all text-text-400">
                {SUPPORT_EMAIL}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export { SupportDialog };
