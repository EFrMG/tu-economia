import { MdOpenInNew } from "react-icons/md";
import { Link } from "react-router";

import { UnavailableNotice } from "~/components/ui/UnavailableNotice";
import { Skeleton } from "~/components/ui/Skeleton";
import {
  NEWS_SOURCES,
  type EconomicNews,
  type NewsItem,
  type NewsSourceId,
} from "~/lib/economic-news";

const MAX_VISIBLE_ITEMS = 6;

const publicationTime = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** Keeps "a. m. ART" on one line: the formatter separates "a." and "m." with an ordinary, breakable space. */
const formatPublicationTime = (publishedAt: string) =>
  `${publicationTime.format(new Date(publishedAt)).replace(/([ap]\.)\s(m\.)/, "$1 $2")} ART`;

const sourceName = (id: NewsSourceId) =>
  NEWS_SOURCES.find((source) => source.id === id)?.name ?? id;

const sourceList = (sources: NewsSourceId[]) =>
  new Intl.ListFormat("es-AR", { style: "long", type: "conjunction" }).format(
    sources.map(sourceName),
  );

interface NewsSectionProps {
  news: EconomicNews | null;
  showAll?: boolean;
}

const NewsLoading = ({ showAll = false }: { showAll?: boolean }) => (
  <section aria-labelledby="news-heading">
    <NewsHeading showAll={showAll} />
    <div className="grid gap-4 lg:grid-cols-2">
      <span className="sr-only" role="status">
        Cargando noticias económicas
      </span>
      {Array.from({ length: MAX_VISIBLE_ITEMS }, (_, index) => (
        <article
          key={index}
          className="h-40 border border-base-700 bg-surface-950 p-4"
          aria-hidden="true"
        >
          <Skeleton className="mb-4 h-4 w-2/5" />
          <Skeleton className="mb-2 h-5 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </article>
      ))}
    </div>
  </section>
);

const NewsHeading = ({ showAll = false }: { showAll?: boolean }) => (
  <div className="mb-4 flex items-center justify-between">
    <h2
      id="news-heading"
      className="border-b border-primary-500/30 pb-1 font-mono text-label-caps text-text-200 uppercase"
    >
      Noticias económicas
    </h2>
    {showAll ? (
      <span className="font-mono text-data-label text-text-400">
        Fuentes RSS
      </span>
    ) : (
      <Link
        to="/noticias"
        className="font-mono text-data-label text-text-200 transition-colors focus-visible:outline-none hocus:text-primary-text-100"
      >
        Ver todas
      </Link>
    )}
  </div>
);

const NewsItemCard = ({ item }: { item: NewsItem }) => (
  <article>
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${item.headline}. ${item.source}. Abre en una nueva pestaña.`}
      className="block h-full border border-base-700 bg-surface-950 p-4 transition-colors focus-visible:outline-none hocus:border-primary-500/50 hocus:bg-surface-900/80"
    >
      <div className="mb-3 font-mono text-data-label text-text-400">
        <span>{item.source}</span>
        {" "}
        <span aria-hidden="true" className="mx-1">
          ·
        </span>{" "}
        <time dateTime={item.publishedAt}>
          {formatPublicationTime(item.publishedAt)}
        </time>
      </div>
      <h3 className="font-heading text-body-lg text-text-100">
        {item.headline}
        <MdOpenInNew
          className="ml-1 inline-block align-middle text-sm"
          aria-hidden="true"
        />
      </h3>
      {item.summary ? (
        <p className="mt-2 text-body-sm text-text-300">{item.summary}</p>
      ) : null}
    </a>
  </article>
);

const EconomicNewsSection = ({ news, showAll = false }: NewsSectionProps) => {
  if (news === null) {
    return (
      <section aria-labelledby="news-heading">
        <NewsHeading showAll={showAll} />
        <div className="grid min-h-[calc(2*10rem+1*1rem)] gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <UnavailableNotice>
              No fue posible actualizar las noticias económicas en este momento.
            </UnavailableNotice>
          </div>
        </div>
      </section>
    );
  }

  const unavailableNames = sourceList(news.unavailableSources);
  const hasItems = news.items.length > 0;

  const allSourcesUnavailable =
    news.unavailableSources.length === NEWS_SOURCES.length;

  return (
    <section aria-labelledby="news-heading">
      <NewsHeading showAll={showAll} />
      {news.unavailableSources.length > 0 ? (
        <UnavailableNotice className={hasItems ? "mb-4" : ""}>
          {allSourcesUnavailable
            ? `No fue posible consultar ${unavailableNames} en este momento.`
            : `No se pudo actualizar ${unavailableNames}. Las demás fuentes siguen disponibles.`}
        </UnavailableNotice>
      ) : null}
      {hasItems ? (
        <div className="grid min-h-[calc(2*10rem+1*1rem)] gap-4 lg:grid-cols-2">
          {(showAll ? news.items : news.items.slice(0, MAX_VISIBLE_ITEMS)).map(
            (item) => (
              <NewsItemCard key={item.link} item={item} />
            ),
          )}
        </div>
      ) : allSourcesUnavailable ? (
        <div
          className="grid min-h-[calc(2*10rem+1*1rem)] gap-4 lg:grid-cols-2"
          aria-hidden="true"
        />
      ) : (
        <p className="border border-base-700 bg-surface-950 px-4 py-5 text-body-sm text-text-200">
          No hay publicaciones recientes para mostrar.
        </p>
      )}
    </section>
  );
};

export { EconomicNewsSection, NewsLoading };
