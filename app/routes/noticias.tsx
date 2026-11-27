import { Suspense, useMemo } from "react";
import { Await, Link } from "react-router";

import type { Route } from "./+types/noticias";
import { RouteError } from "~/components/layout/RouteError";
import {
  BoletinDigestPanel,
  BoletinLoading,
} from "~/components/features/BoletinDigest";
import {
  EconomicNewsSection,
  NewsLoading,
} from "~/components/features/EconomicNews";
import {
  NEWS_PANELS,
  editionParam,
  isBoletinDigestEnabled,
  newsLabel,
  resolveNewsPanel,
  type NewsPanelId,
} from "~/lib/boletin";
import { getBoletinDigest } from "~/lib/boletin.server";
import { getEconomicNews } from "~/lib/economic-news.server";
import { isUnavailablePreview } from "~/lib/data-preview";
import { pageMeta } from "~/lib/meta";
import { useBoletinDigestEnabled } from "~/lib/use-equities-byma-enabled";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { workerEnvContext } from "~/lib/worker-context";

export function meta({ loaderData }: Route.MetaArgs) {
  const boletinEnabled = loaderData?.boletinEnabled ?? false;

  return pageMeta({
    title: boletinEnabled ? "Noticias y normativa" : "Noticias económicas",
    description: boletinEnabled
      ? "Noticias económicas argentinas de iProfesional, Clarín y Página/12, y resúmenes de la primera sección del Boletín Oficial, con enlaces a las publicaciones originales."
      : "Noticias económicas argentinas de iProfesional, Clarín y Página/12, con enlaces a las publicaciones originales.",
    path: "/noticias",
  });
}

/** Only the open panel reads its source; the other resolves to null and is not rendered. */
export function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(workerEnvContext);
  const searchParams = new URL(request.url).searchParams;
  const boletinEnabled = isBoletinDigestEnabled(env);
  const panel = resolveNewsPanel(searchParams.get("panel"), boletinEnabled);
  const unavailable = isUnavailablePreview(searchParams);

  return {
    panel,
    boletinEnabled,
    news:
      panel === "medios" && !unavailable
        ? getEconomicNews().catch(() => null)
        : Promise.resolve(null),
    boletin:
      panel === "boletin" && !unavailable
        ? getBoletinDigest(
            env,
            editionParam(searchParams.get("edicion")),
          ).catch(() => null)
        : Promise.resolve(null),
  };
}

/** Shared by the page and its error state, so the page keeps its title in both. */
const NoticiasHeader = ({ boletinEnabled }: { boletinEnabled: boolean }) => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">
      {newsLabel(boletinEnabled)}
    </h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      {boletinEnabled
        ? "Titulares recientes de medios argentinos y resúmenes del Boletín Oficial, con enlace a cada publicación original."
        : "Titulares recientes de medios argentinos, con enlace a cada publicación original."}
    </p>
  </header>
);

const tabClassName =
  "font-mono text-label-caps shrink-0 border-b-2 px-2 sm:px-4 py-3 uppercase motion-safe:transition-colors focus-visible:outline-none";

/** The `?panel=` switch, the same treatment as the Tasas panels. */
const NewsPanelSwitch = ({ active }: { active: NewsPanelId }) => (
  <nav aria-label="Secciones de Noticias" className="border-b border-base-700">
    {/* Horizontal scrolling forces an overflow box on both axes, so the vertical one is clipped explicitly. */}
    <div className="flex overflow-x-auto overflow-y-hidden">
      {NEWS_PANELS.map((item) => (
        <Link
          key={item.id}
          to={`?panel=${item.id}`}
          aria-current={item.id === active ? "page" : undefined}
          preventScrollReset
          className={`${tabClassName} ${item.id === active ? "border-primary-500 text-primary-text-100" : "border-transparent text-text-200 hocus:bg-surface-900/80 hocus:text-text-100"}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  </nav>
);

export default function Noticias({ loaderData }: Route.ComponentProps) {
  const { panel, boletinEnabled } = loaderData;

  const retryNeeded = useMemo(
    () =>
      panel === "boletin"
        ? loaderData.boletin.then(
            (digest) => digest === null,
            () => true,
          )
        : loaderData.news.then(
            (news) => news === null || news.unavailableSources.length > 0,
            () => true,
          ),
    [panel, loaderData.news, loaderData.boletin],
  );

  useFailedDataRetry(retryNeeded);

  return (
    <div className="stack-10">
      <NoticiasHeader boletinEnabled={boletinEnabled} />

      <div className="stack-8">
        {boletinEnabled ? <NewsPanelSwitch active={panel} /> : null}

        {panel === "boletin" ? (
          <Suspense fallback={<BoletinLoading />}>
            <Await
              resolve={loaderData.boletin}
              errorElement={<BoletinDigestPanel digest={null} />}
            >
              {(digest) => <BoletinDigestPanel digest={digest} />}
            </Await>
          </Suspense>
        ) : (
          <Suspense fallback={<NewsLoading showAll />}>
            <Await
              resolve={loaderData.news}
              errorElement={<EconomicNewsSection news={null} showAll />}
            >
              {(news) => <EconomicNewsSection news={news} showAll />}
            </Await>
          </Suspense>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const boletinEnabled = useBoletinDigestEnabled();

  return (
    <div className="stack-10">
      <NoticiasHeader boletinEnabled={boletinEnabled} />
      <RouteError
        title="Noticias no disponibles"
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
    </div>
  );
}
