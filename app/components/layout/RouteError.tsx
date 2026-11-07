import type { ReactNode } from "react";

import { Button } from "~/components/ui/Button";

interface RouteErrorProps {
  title: string;
  detail: ReactNode;
  /** A second, quieter line, e.g. reassurance that nothing was lost. */
  note?: ReactNode;
}

/** The shared error state for a route. It sits below the page's own header, so it names the failure rather than the page, and it fills the body with a centred message and both ways forward. */
export const RouteError = ({ title, detail, note }: RouteErrorProps) => (
  <section
    role="alert"
    className="flex min-h-80 flex-col items-center justify-center gap-4 border border-base-700 bg-surface-950 px-6 py-12 text-center"
  >
    <h2 className="font-heading text-headline-md text-text-100">{title}</h2>
    <p className="max-w-prose text-body-sm text-text-200">{detail}</p>
    {note ? (
      <p className="max-w-prose text-body-sm text-text-300">{note}</p>
    ) : null}
    <div className="mt-2 flex flex-wrap justify-center gap-3">
      <Button type="button" onClick={() => window.location.reload()}>
        Actualizar página
      </Button>
      <Button href="/dashboard" variant="outline">
        Volver al Dashboard
      </Button>
    </div>
  </section>
);
