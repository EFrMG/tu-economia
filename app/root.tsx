import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import faviconPng from "./assets/favicon.png";
import { errorMeta } from "~/lib/meta";
import { SITE_THEME_COLOR } from "~/lib/site";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: faviconPng, type: "image/png" },
];

export function meta({ error }: Route.MetaArgs) {
  if (!error) return [];

  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return errorMeta({ notFound });
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content={SITE_THEME_COLOR} />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-base-950 text-text-100 antialiased selection:bg-primary-500/30">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  let code = "500";
  let title = "Error inesperado.";
  let detail = "Ocurrió un problema al procesar la solicitud.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    code = String(error.status);
    title = notFound ? "Página no encontrada." : "Error del servidor.";

    detail = notFound
      ? "La ruta solicitada no existe o se movió de lugar."
      : error.data || error.statusText || detail;
  } else if (import.meta.env.DEV && error instanceof Error) {
    detail = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="stack-6 w-full max-w-2xl border border-base-700 bg-surface-950 p-8">
        <p className="font-mono text-label-caps text-primary-text-100 uppercase">
          Error {code}
        </p>

        <div className="stack-2">
          <h1 className="font-heading text-headline-lg text-text-100">
            {title}
          </h1>
          <p className="text-body-sm text-text-200">{detail}</p>
        </div>

        <div>
          <Link
            to="/"
            className="btn-click-soft inline-flex border border-primary-500/50 px-6 py-3 font-mono text-label-caps text-primary-text-100 uppercase transition-colors focus-visible:outline-none hocus:bg-surface-900/80"
          >
            Volver al inicio
          </Link>
        </div>

        {stack && (
          <pre className="w-full overflow-x-auto border-t border-base-700/50 pt-4 font-mono text-xs text-text-400">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
