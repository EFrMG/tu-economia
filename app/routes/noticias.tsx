import { Suspense, useMemo } from "react";
import { Await } from "react-router";

import type { Route } from "./+types/noticias";
import { RouteError } from "~/components/layout/RouteError";
import {
  EconomicNewsSection,
  NewsLoading,
} from "~/components/features/EconomicNews";
import { getEconomicNews } from "~/lib/economic-news.server";
import { isUnavailablePreview } from "~/lib/data-preview";
import { pageMeta } from "~/lib/meta";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";

export function meta() {
  return pageMeta({
    title: "Noticias económicas",
    description:
      "Noticias económicas argentinas de iProfesional, Clarín y Página/12, con enlaces a las publicaciones originales.",
    path: "/noticias",
  });
}

export function loader({ request }: Route.LoaderArgs) {
  const news = isUnavailablePreview(new URL(request.url).searchParams)
    ? Promise.resolve(null)
    : getEconomicNews().catch(() => null);

  return { news };
}

/** Shared by the page and its error state, so the page keeps its title in both. */
const NoticiasHeader = () => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">Noticias</h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      Titulares recientes de medios argentinos, con acceso a cada publicación en
      su sitio de origen.
    </p>
  </header>
);

export default function Noticias({ loaderData }: Route.ComponentProps) {
  const retryNeeded = useMemo(
    () =>
      loaderData.news.then(
        (news) => news === null || news.unavailableSources.length > 0,
        () => true,
      ),
    [loaderData.news],
  );

  useFailedDataRetry(retryNeeded);

  return (
    <div className="stack-10">
      <NoticiasHeader />

      <Suspense fallback={<NewsLoading showAll />}>
        <Await
          resolve={loaderData.news}
          errorElement={<EconomicNewsSection news={null} showAll />}
        >
          {(news) => <EconomicNewsSection news={news} showAll />}
        </Await>
      </Suspense>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div className="stack-10">
      <NoticiasHeader />
      <RouteError
        title="Noticias no disponibles"
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
    </div>
  );
}
