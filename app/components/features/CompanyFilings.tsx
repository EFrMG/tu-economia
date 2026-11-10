import type { ReactNode } from "react";
import { MdArrowBack, MdOpenInNew } from "react-icons/md";
import { Link } from "react-router";

import {
  SkeletonRow,
  TableFrame,
  Unavailable,
  UnavailableBody,
  figureClassName,
  headBaseClassName,
  headClassName,
  rowClassName,
  stickyClassName,
} from "~/components/features/EquityTables";
import { Button } from "~/components/ui/Button";
import { Skeleton } from "~/components/ui/Skeleton";
import {
  UnavailableNotice,
  UnavailableStatus,
} from "~/components/ui/UnavailableNotice";
import { accionesHref } from "~/lib/acciones-panels";
import {
  FIGURES,
  ISSUERS,
  RECENT_FILINGS_LIMIT,
  companyFilingsUrl,
  describeFiling,
  figureReport,
  formatFilingDate,
  formatReportedAmount,
  paddedCik,
  type CompanyFiguresData,
  type CompanyFilingsData,
  type CompanyPanel,
  type FilingRef,
  type Issuer,
  type IssuerListData,
  type IssuerRow,
  type ReportedFigure,
} from "~/lib/company-filings";
import type { EquityPanel } from "~/lib/equities";

const linkClassName =
  "text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline";

const textCellClassName =
  "px-4 text-left text-body-sm whitespace-nowrap text-text-300";

const monoCellClassName =
  "px-4 text-left font-mono text-body-sm whitespace-nowrap text-text-100";

const headLeftClassName = `${headBaseClassName} text-left`;

interface SecLinkProps {
  href: string;
  /** Read by assistive technology in place of the visible text. */
  label: string;
  children: ReactNode;
}

/** A link to a document on sec.gov, which opens in a new tab like the app's other external links. */
const SecLink = ({ href, label, children }: SecLinkProps) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`${label}. Abre sec.gov en una nueva pestaña.`}
    className={linkClassName}
  >
    {children}
    <MdOpenInNew
      className="ml-1 inline-block align-middle text-sm"
      aria-hidden="true"
    />
  </a>
);

interface FetchTimeProps {
  panel: {
    status: string;
    freshness: { fetchedAtLabel: string } | null;
  } | null;
}

/** When this server received the data; a skeleton while loading. */
const FetchTime = ({ panel }: FetchTimeProps) =>
  panel === null ? (
    <span className="flex h-3 items-center">
      <Skeleton className="h-3 w-44" />
    </span>
  ) : (
    <span className="flex h-3 items-center">
      Consulta:{" "}
      {panel.freshness ? `${panel.freshness.fetchedAtLabel} ART` : "s/d"}
    </span>
  );

/** The company's name leads, with the ticker under it; the way into the company view is the row's "Ver" button. */
const IssuerCell = ({ issuer }: { issuer: Issuer }) => (
  <th scope="row" className={`${stickyClassName} px-4 font-normal`}>
    {/* The name is truncated visually only; the title and the button's label carry it whole. */}
    <span
      className="block max-w-40 truncate text-body-lg font-semibold text-text-100 sm:max-w-56"
      title={issuer.name}
    >
      {issuer.name}
    </span>
    {issuer.name !== issuer.ticker ? (
      <span className="block font-mono text-body-sm text-text-400">
        {issuer.ticker}
      </span>
    ) : null}
  </th>
);

interface ViewCellProps {
  issuer: Issuer;
  previewUnavailable: boolean;
}

const ViewCell = ({ issuer, previewUnavailable }: ViewCellProps) => (
  <td className="px-4 text-right">
    <Button
      href={accionesHref("empresas", {
        empresa: issuer.ticker,
        previewUnavailable,
      })}
      size="sm"
      aria-label={`Ver informes y cifras de ${issuer.name} (${issuer.ticker})`}
    >
      Ver
    </Button>
  </td>
);

const ISSUER_COLUMNS = 5;

const IssuerHead = () => (
  <thead className="border-b border-base-700">
    <tr>
      <th scope="col" className={`${headBaseClassName} ${stickyClassName}`}>
        Empresa
      </th>
      <th scope="col" className={headLeftClassName}>
        Sector
      </th>
      <th scope="col" className={headLeftClassName}>
        Último informe anual
      </th>
      <th scope="col" className={headLeftClassName}>
        Presentado
      </th>
      <th scope="col" className={headClassName}>
        <span className="sr-only">Detalle</span>
      </th>
    </tr>
  </thead>
);

interface IssuerTableRowProps {
  row: IssuerRow;
  previewUnavailable: boolean;
}

const IssuerTableRow = ({ row, previewUnavailable }: IssuerTableRowProps) => {
  const annual = row.status === "available" ? row.latestAnnual : null;

  return (
    <tr className={rowClassName}>
      <IssuerCell issuer={row.issuer} />
      <td className={textCellClassName}>{row.issuer.sector}</td>
      {/* The period links to the report itself; its form is the same 20-F for every issuer, so it is named in the link's label rather than in a column. */}
      <td className={monoCellClassName}>
        {annual ? (
          <SecLink
            href={annual.url}
            label={`${annual.form} de ${row.issuer.name}${annual.reportDate ? `, ejercicio cerrado el ${formatFilingDate(annual.reportDate)}` : ""}`}
          >
            {annual.reportDate
              ? `Ejercicio ${formatFilingDate(annual.reportDate)}`
              : annual.form}
          </SecLink>
        ) : row.status === "available" ? (
          <Unavailable />
        ) : (
          <UnavailableStatus>
            {row.status === "unresolved" ? "No identificada" : "No disponible"}
          </UnavailableStatus>
        )}
      </td>
      <td className={monoCellClassName}>
        {annual ? formatFilingDate(annual.filingDate) : <Unavailable />}
      </td>
      {/* An unidentified company has no view to open; a failed request does, since it retries. */}
      {row.status === "unresolved" ? (
        <td />
      ) : (
        <ViewCell issuer={row.issuer} previewUnavailable={previewUnavailable} />
      )}
    </tr>
  );
};

const tickersOf = (rows: IssuerRow[], status: IssuerRow["status"]) =>
  rows
    .filter((row) => row.status === status)
    .map((row) => row.issuer.ticker)
    .join(", ");

interface IssuerTableProps {
  /** `null` while loading. */
  panel: EquityPanel<IssuerListData> | null;
  previewUnavailable: boolean;
}

/** The issuer list: one row per company in the static table, each resolved on its own. */
export const IssuerTable = ({
  panel,
  previewUnavailable,
}: IssuerTableProps) => {
  const loading = panel === null;
  const rows = panel?.status === "available" ? panel.data.rows : [];
  const failed = tickersOf(rows, "unavailable");
  const unresolved = tickersOf(rows, "unresolved");

  const notices = (
    <>
      {failed ? (
        <UnavailableNotice>
          No fue posible consultar en este momento los informes de: {failed}. La
          página volverá a intentarlo en unos minutos.
        </UnavailableNotice>
      ) : null}
      {unresolved ? (
        <UnavailableNotice>
          No fue posible identificar en EDGAR a: {unresolved}. El ticker no
          figura en el registro de la SEC o corresponde a otra sociedad.
        </UnavailableNotice>
      ) : null}
    </>
  );

  const body =
    panel === null ? (
      ISSUERS.map((issuer) => (
        <SkeletonRow key={issuer.ticker} figures={ISSUER_COLUMNS - 1} />
      ))
    ) : panel.status === "unavailable" ? (
      <UnavailableBody columns={ISSUER_COLUMNS}>
        No fue posible consultar EDGAR en este momento. La página volverá a
        intentarlo en unos minutos.
      </UnavailableBody>
    ) : (
      rows.map((row) => (
        <IssuerTableRow
          key={row.issuer.ticker}
          row={row}
          previewUnavailable={previewUnavailable}
        />
      ))
    );

  return (
    <TableFrame
      id="empresas"
      title="Empresas argentinas en la SEC"
      caption="Empresas argentinas que cotizan en los Estados Unidos: sector, ejercicio de su último informe anual ante la SEC, con enlace al documento, y fecha de presentación."
      meta={<FetchTime panel={panel} />}
      notices={notices}
      loading={loading}
      head={<IssuerHead />}
      body={body}
    />
  );
};

interface CompanyHeaderProps {
  issuer: Issuer;
  /** `null` while loading. */
  panel: CompanyPanel<CompanyFilingsData> | null;
  previewUnavailable: boolean;
}

/** The selected company: the name and ticker come from the static table, so they render at once; the EDGAR registration follows. */
export const CompanyHeader = ({
  issuer,
  panel,
  previewUnavailable,
}: CompanyHeaderProps) => (
  <div className="stack-4">
    <Link
      to={accionesHref("empresas", { previewUnavailable })}
      className="flex w-fit items-center gap-2 font-mono text-data-label text-text-200 focus-visible:outline-none hocus:text-primary-text-100"
    >
      <MdArrowBack aria-hidden="true" />
      Todas las empresas
    </Link>

    <div className="stack-2">
      <h2 className="flex flex-wrap items-baseline gap-x-3 font-heading text-headline-md text-text-100">
        <span>{issuer.name}</span>
        {issuer.name !== issuer.ticker ? (
          <span className="font-mono text-body-lg text-text-100">
            {issuer.ticker}
          </span>
        ) : null}
      </h2>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-data-label text-text-400">
        <span className="flex h-3 items-center">Sector: {issuer.sector}</span>
        {/* The registrant name can wrap at phone width, so the line keeps a minimum height rather than a fixed one. */}
        <span className="flex min-h-3 flex-wrap items-center">
          {panel === null ? (
            <Skeleton className="h-3 w-56" />
          ) : panel.status === "available" ? (
            <>
              Registro en EDGAR:&nbsp;
              <SecLink
                href={companyFilingsUrl(panel.data.cik)}
                label={`Registro de ${panel.data.secName || issuer.name} en EDGAR, CIK ${paddedCik(panel.data.cik)}`}
              >
                {panel.data.secName || issuer.name} · CIK{" "}
                {paddedCik(panel.data.cik)}
              </SecLink>
            </>
          ) : (
            <>Registro en EDGAR: s/d</>
          )}
        </span>
        <FetchTime panel={panel} />
      </div>
    </div>
  </div>
);

const UNRESOLVED_COPY =
  "No fue posible identificar a esta empresa en EDGAR: el ticker no figura en el registro de la SEC o corresponde a otra sociedad.";

const FIGURE_COLUMNS = 2;

const FigureHead = () => (
  <thead className="border-b border-base-700">
    <tr>
      <th scope="col" className={`${headBaseClassName} ${stickyClassName}`}>
        Concepto
      </th>
      <th scope="col" className={headClassName}>
        Importe
      </th>
    </tr>
  </thead>
);

interface FigureRowProps {
  label: string;
  figure: ReportedFigure | null;
}

const FigureRow = ({ label, figure }: FigureRowProps) => (
  <tr className={rowClassName}>
    <th
      scope="row"
      className={`${stickyClassName} px-4 text-body-sm font-normal whitespace-nowrap text-text-100`}
    >
      {label}
    </th>
    <td className={figureClassName}>
      {figure ? (
        formatReportedAmount(figure.value, figure.unit)
      ) : (
        <Unavailable />
      )}
    </td>
  </tr>
);

interface ReportLineProps {
  panel: CompanyPanel<CompanyFiguresData> | null;
}

/** Every figure comes from one report (`alignToOneReport`), so its period, form and date are stated once instead of on each row. */
const ReportLine = ({ panel }: ReportLineProps) => {
  if (panel === null)
    return (
      <span className="flex h-3 items-center">
        <Skeleton className="h-3 w-72" />
      </span>
    );

  const report =
    panel.status === "available" ? figureReport(panel.data.figures) : null;

  return (
    <span className="flex min-h-3 items-center">
      {report
        ? `Ejercicio cerrado el ${formatFilingDate(report.periodEnd)} · ${report.form} presentado el ${formatFilingDate(report.filed)}`
        : "Ejercicio: s/d"}
    </span>
  );
};

const TAXONOMY_NAMES = {
  "ifrs-full": "NIIF",
  "us-gaap": "US GAAP",
} as const;

interface FigureNotesProps {
  panel: CompanyPanel<CompanyFiguresData> | null;
}

/** What is needed to read the figures; the method is in `/docs`. */
const FigureNotes = ({ panel }: FigureNotesProps) => (
  <p>
    Cifras tal como las presentó la empresa
    {panel?.status === "available" && panel.data.taxonomy
      ? `, bajo ${TAXONOMY_NAMES[panel.data.taxonomy]}`
      : ""}
    . M indica millones. No se calculan variaciones: las emisoras argentinas
    reexpresan sus estados contables por inflación. s/d indica que la empresa no
    informa ese concepto en el informe.
  </p>
);

interface CompanyFiguresTableProps {
  /** `null` while loading. */
  panel: CompanyPanel<CompanyFiguresData> | null;
}

export const CompanyFiguresTable = ({ panel }: CompanyFiguresTableProps) => {
  const missing =
    panel?.status === "available"
      ? FIGURES.filter((figure) => panel.data.missing.includes(figure.id)).map(
          (figure) => figure.label.toLowerCase(),
        )
      : [];

  const body =
    panel === null ? (
      FIGURES.map((figure) => (
        <SkeletonRow key={figure.id} figures={FIGURE_COLUMNS - 1} />
      ))
    ) : panel.status === "available" ? (
      FIGURES.map((figure) => (
        <FigureRow
          key={figure.id}
          label={figure.label}
          figure={panel.data.figures[figure.id]}
        />
      ))
    ) : (
      <UnavailableBody columns={FIGURE_COLUMNS}>
        {panel.status === "unresolved"
          ? UNRESOLVED_COPY
          : "No fue posible consultar las cifras en EDGAR en este momento. La página volverá a intentarlo en unos minutos."}
      </UnavailableBody>
    );

  return (
    <TableFrame
      id="cifras"
      title="Cifras anuales informadas"
      caption="Ingresos, resultado del ejercicio, activo total y patrimonio neto del último informe anual, en la moneda informada por la empresa."
      meta={<ReportLine panel={panel} />}
      notices={
        missing.length ? (
          <UnavailableNotice>
            No fue posible consultar en este momento: {missing.join(", ")}. La
            página volverá a intentarlo en unos minutos.
          </UnavailableNotice>
        ) : null
      }
      loading={panel === null}
      head={<FigureHead />}
      body={body}
      notes={<FigureNotes panel={panel} />}
    />
  );
};

const FILING_COLUMNS = 3;

const FilingHead = () => (
  <thead className="border-b border-base-700">
    <tr>
      <th scope="col" className={`${headBaseClassName} ${stickyClassName}`}>
        Formulario
      </th>
      <th scope="col" className={headLeftClassName}>
        Descripción
      </th>
      <th scope="col" className={headLeftClassName}>
        Presentado
      </th>
    </tr>
  </thead>
);

interface FilingRowProps {
  filing: FilingRef;
  issuer: Issuer;
}

/** The form links to the document, as the period does in the company list. */
const FilingRow = ({ filing, issuer }: FilingRowProps) => (
  <tr className={rowClassName}>
    <th
      scope="row"
      className={`${stickyClassName} px-4 font-mono text-body-sm font-normal whitespace-nowrap`}
    >
      <SecLink
        href={filing.url}
        label={`${filing.form} de ${issuer.name}, presentado el ${formatFilingDate(filing.filingDate)}`}
      >
        {filing.form}
      </SecLink>
    </th>
    <td className={textCellClassName}>{describeFiling(filing)}</td>
    <td className={monoCellClassName}>{formatFilingDate(filing.filingDate)}</td>
  </tr>
);

interface CompanyFilingsTableProps {
  issuer: Issuer;
  /** `null` while loading. */
  panel: CompanyPanel<CompanyFilingsData> | null;
}

export const CompanyFilingsTable = ({
  issuer,
  panel,
}: CompanyFilingsTableProps) => {
  const body =
    panel === null ? (
      Array.from({ length: RECENT_FILINGS_LIMIT }, (_, index) => (
        <SkeletonRow key={index} figures={FILING_COLUMNS - 1} />
      ))
    ) : panel.status !== "available" ? (
      <UnavailableBody columns={FILING_COLUMNS}>
        {panel.status === "unresolved"
          ? UNRESOLVED_COPY
          : "No fue posible consultar las presentaciones en EDGAR en este momento. La página volverá a intentarlo en unos minutos."}
      </UnavailableBody>
    ) : panel.data.filings.length ? (
      panel.data.filings.map((filing) => (
        <FilingRow
          key={filing.accessionNumber}
          filing={filing}
          issuer={issuer}
        />
      ))
    ) : (
      <UnavailableBody columns={FILING_COLUMNS}>
        EDGAR no informó presentaciones recientes de esta empresa.
      </UnavailableBody>
    );

  return (
    <TableFrame
      id="presentaciones"
      title="Presentaciones recientes"
      caption={`Los ${RECENT_FILINGS_LIMIT} informes más recientes presentados ante la SEC: formulario, con enlace al documento, descripción y fecha de presentación.`}
      loading={panel === null}
      head={<FilingHead />}
      body={body}
      notes={<p>Las descripciones en inglés son las que indicó la empresa.</p>}
    />
  );
};
