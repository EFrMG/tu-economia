import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { Link } from "react-router";

import { ExternalLinkIcon } from "~/components/ui/ExternalLinkIcon";
import { Skeleton } from "~/components/ui/Skeleton";
import { UnavailableNotice } from "~/components/ui/UnavailableNotice";
import {
  RESUMEN_BOLETIN_LIMIT,
  boletinEditionHref,
  formatEditionDate,
  noticeHeadline,
  resumenBoletinNotices,
  type BoletinDigest,
  type BoletinNotice,
} from "~/lib/boletin";

const BOLETIN_PANEL_HREF = "/noticias?panel=boletin";

/** Reserves the populated grid's height in every state, so nothing below moves when the data arrives or fails. */
const panelGridClassName =
  "grid min-h-[calc(2*14rem+1*1rem)] gap-4 lg:grid-cols-2";
const resumenGridClassName = "grid min-h-40 gap-4 lg:grid-cols-3";

const linkClassName =
  "text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline";

interface BoletinHeadingProps {
  /** On Resumen the heading links to the full panel. */
  compact?: boolean;
}

const BoletinHeading = ({ compact = false }: BoletinHeadingProps) => (
  <div className="mb-5 flex items-center justify-between gap-4">
    <h2
      id="boletin-heading"
      className="shrink-0 border-b border-primary-500/30 pb-1 font-mono text-label-caps whitespace-nowrap text-text-200 uppercase"
    >
      Boletín Oficial
    </h2>
    {compact ? (
      <Link
        to={BOLETIN_PANEL_HREF}
        className="font-mono text-data-label text-text-200 transition-colors focus-visible:outline-none hocus:text-primary-text-100"
      >
        Ver todas
      </Link>
    ) : (
      <span className="font-mono text-data-label text-text-400">
        Primera sección
      </span>
    )}
  </div>
);

const editionLinkClassName =
  "flex size-9 items-center justify-center text-body-lg focus-visible:outline-none";

const EditionStep = ({
  date,
  direction,
}: {
  date: string | null;
  direction: "previous" | "next";
}) => {
  const Icon = direction === "previous" ? MdChevronLeft : MdChevronRight;
  const label =
    direction === "previous" ? "Edición anterior" : "Edición siguiente";

  if (date === null) {
    return (
      <span
        aria-hidden="true"
        className={`${editionLinkClassName} text-text-400 opacity-less`}
      >
        <Icon />
      </span>
    );
  }

  return (
    <Link
      to={boletinEditionHref(date)}
      aria-label={`${label}: ${formatEditionDate(date)}`}
      preventScrollReset
      className={`${editionLinkClassName} text-primary-text-100 hocus:bg-surface-900/80`}
    >
      <Icon aria-hidden="true" />
    </Link>
  );
};

interface EditionBarProps {
  /** Null while loading, when unavailable, and before the first edition: the bar keeps its height with both steps disabled. */
  digest: BoletinDigest | null;
  loading?: boolean;
}

/** Steps through the kept editions, older to the left; the middle names the edition on screen. */
const EditionBar = ({ digest, loading = false }: EditionBarProps) => {
  const editionDate = digest?.editionDate ?? null;
  const latest = digest !== null && digest.next === null;

  return (
    <nav
      aria-label="Ediciones del Boletín Oficial"
      className="mb-4 flex min-h-16 items-center justify-between gap-2 border border-base-700 bg-surface-950 px-2 py-2"
    >
      <EditionStep date={digest?.previous ?? null} direction="previous" />
      <div className="stack-1 min-w-0 text-center font-mono">
        {loading ? (
          <Skeleton className="h-4 w-48" />
        ) : editionDate ? (
          <>
            <p className="text-data-label text-text-100" aria-live="polite">
              {formatEditionDate(editionDate)}
            </p>
            {latest ? (
              <p className="text-label-caps text-text-400 uppercase">
                Última edición
              </p>
            ) : (
              <Link
                to={BOLETIN_PANEL_HREF}
                preventScrollReset
                className="block text-label-caps text-primary-text-100 uppercase underline-offset-4 focus-visible:outline-none hocus:underline"
              >
                Ir a la última edición
              </Link>
            )}
          </>
        ) : digest ? (
          <p className="text-data-label text-text-400">Sin ediciones</p>
        ) : null}
      </div>
      <EditionStep date={digest?.next ?? null} direction="next" />
    </nav>
  );
};

/** The panel's intro says the summaries are automatic and the official text prevails, and Resumen's sources footer names them as automatic; a card only notes what sets it apart. */
const cardNote = (notice: BoletinNotice) =>
  notice.status !== "summarized"
    ? "Sin resumen automático"
    : notice.partial
      ? "Resumen de los primeros artículos"
      : null;

const NoticeCard = ({
  notice,
  compact = false,
}: {
  notice: BoletinNotice;
  compact?: boolean;
}) => (
  <article className="flex h-full flex-col border border-base-700 bg-surface-950 p-4">
    <p className="mb-3 font-mono text-data-label text-text-400">
      {notice.title ? `${notice.heading} · ${notice.norm}` : notice.rubro}
    </p>
    <h3 className="font-heading text-body-lg leading-tight text-text-100 md:leading-base">
      {noticeHeadline(notice)}
    </h3>
    {notice.summary ? (
      <p className="mt-2 text-body-sm text-text-300">{notice.summary}</p>
    ) : null}
    {!compact && notice.points.length > 0 ? (
      <ul className="mt-3 stack-2 list-disc pl-5 text-body-sm text-text-300">
        {notice.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    ) : null}
    <div className="mt-auto stack-2 pt-4 font-mono text-data-label">
      {cardNote(notice) ? (
        <p className="text-tertiary-text-400">{cardNote(notice)}</p>
      ) : null}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-text-400">
        <a
          href={notice.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Texto oficial: ${notice.heading}, ${notice.norm}. Abre en una nueva pestaña.`}
          className={linkClassName}
        >
          Texto oficial
          <ExternalLinkIcon />
        </a>
        {notice.hasAnnexes ? <span>Incluye anexos</span> : null}
      </p>
    </div>
  </article>
);

const CardSkeleton = () => (
  <article
    className="h-56 border border-base-700 bg-surface-950 p-4"
    aria-hidden="true"
  >
    <Skeleton className="mb-4 h-4 w-2/5" />
    <Skeleton className="mb-2 h-5 w-4/5" />
    <Skeleton className="mb-2 h-4 w-full" />
    <Skeleton className="h-4 w-3/5" />
  </article>
);

const BoletinIntro = () => (
  <p className="mb-5 max-w-3xl text-body-sm text-text-300">
    Resúmenes automáticos de las normas de la primera sección que suelen afectar
    a los hogares: impuestos, tarifas, previsión social, comercio y regulación
    financiera. Se omiten las designaciones y los actos sobre personas. Ante
    cualquier diferencia, prevalece el texto publicado en el Boletín Oficial.
  </p>
);

const BoletinLoading = ({ compact = false }: { compact?: boolean }) => (
  <section aria-labelledby="boletin-heading">
    <BoletinHeading compact={compact} />
    {compact ? null : <BoletinIntro />}
    {compact ? null : <EditionBar digest={null} loading />}
    <div className={compact ? resumenGridClassName : panelGridClassName}>
      <span className="sr-only" role="status">
        Cargando resúmenes del Boletín Oficial
      </span>
      {Array.from(
        { length: compact ? RESUMEN_BOLETIN_LIMIT : 4 },
        (_, index) => (
          <CardSkeleton key={index} />
        ),
      )}
    </div>
  </section>
);

const Unavailable = ({ className }: { className: string }) => (
  <div className={className}>
    <div className="lg:col-span-full">
      <UnavailableNotice>
        No fue posible consultar los resúmenes del Boletín Oficial en este
        momento.
      </UnavailableNotice>
    </div>
  </div>
);

const EmptyState = ({ children }: { children: string }) => (
  <p className="border border-base-700 bg-surface-950 px-4 py-5 text-body-sm text-text-200 lg:col-span-full">
    {children}
  </p>
);

/** The `/noticias?panel=boletin` listing: every notice of one kept edition, the latest by default. */
const BoletinDigestPanel = ({ digest }: { digest: BoletinDigest | null }) => (
  <section aria-labelledby="boletin-heading">
    <BoletinHeading />
    <BoletinIntro />
    <EditionBar digest={digest} />
    {digest === null ? (
      <Unavailable className={panelGridClassName} />
    ) : (
      <div className={panelGridClassName}>
        {digest.notices.length > 0 ? (
          digest.notices.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} />
          ))
        ) : (
          <EmptyState>
            {digest.editionDate
              ? "Esta edición no incluye normas de los organismos seguidos."
              : "Todavía no hay ediciones procesadas. Los resúmenes se preparan cada mañana, después de la publicación del Boletín Oficial."}
          </EmptyState>
        )}
      </div>
    )}
    {digest && digest.pending > 0 ? (
      <p className="mt-4 font-mono text-data-label text-text-400" role="status">
        {digest.pending === 1
          ? "Una norma más de esta edición está en preparación."
          : `${digest.pending} normas más de esta edición están en preparación.`}
      </p>
    ) : null}
  </section>
);

/** The Resumen card: up to three summaries the model marked as affecting households. */
const BoletinResumenCard = ({ digest }: { digest: BoletinDigest | null }) => {
  const notices = digest ? resumenBoletinNotices(digest) : [];

  return (
    <section aria-labelledby="boletin-heading">
      <BoletinHeading compact />
      {digest === null ? (
        <Unavailable className={resumenGridClassName} />
      ) : (
        <div className={resumenGridClassName}>
          {notices.length > 0 ? (
            notices.map((notice) => (
              <NoticeCard key={notice.id} notice={notice} compact />
            ))
          ) : (
            <EmptyState>
              {digest.editionDate
                ? `La edición del ${formatEditionDate(digest.editionDate)} no incluye normas con impacto directo en los hogares.`
                : "Todavía no hay ediciones procesadas del Boletín Oficial."}
            </EmptyState>
          )}
        </div>
      )}
    </section>
  );
};

export { BoletinDigestPanel, BoletinLoading, BoletinResumenCard };
