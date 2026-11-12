import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

import { StaleNotice } from "~/components/features/EquityMarketStrip";
import { Skeleton } from "~/components/ui/Skeleton";
import { TrendIndicator } from "~/components/ui/TrendIndicator";
import { UnavailableNotice } from "~/components/ui/UnavailableNotice";
import {
  CEDEAR_ROW_LIMIT,
  LEADER_SKELETON_ROWS,
  accionesHref,
  availableEquityPanels,
  resolveEquityPanel,
  visibleCedearRows,
} from "~/lib/acciones-panels";
import { isUnavailablePreview } from "~/lib/data-preview";
import {
  formatEquityPrice,
  formatTradedAmount,
  formatTradeTime,
  type CedearPanelData,
  type CedearRow,
  type EquityPanel,
  type LeaderPanelData,
  type LeaderRow,
} from "~/lib/equities";

/** `px-2` below `sm` keeps the three tabs shown while BYMA is on within a 360 px phone's content width; the row still scrolls if a font renders wider. */
const tabClassName =
  "font-mono text-label-caps shrink-0 border-b-2 px-2 sm:px-4 py-3 uppercase motion-safe:transition-colors focus-visible:outline-none";

interface EquityPanelSwitchProps {
  /** `EQUITIES_BYMA_ENABLED`; the BYMA panels are offered only while it is on. */
  bymaEnabled: boolean;
}

/**
 * The `?panel=` switch. It reads the URL itself, so it is correct in the page, its hydration fallback and its error state.
 * With a single panel available there is nothing to switch to, so it renders nothing.
 */
export const EquityPanelSwitch = ({ bymaEnabled }: EquityPanelSwitchProps) => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const active = resolveEquityPanel(params.get("panel"), bymaEnabled);
  const previewUnavailable = isUnavailablePreview(params);
  const panels = availableEquityPanels(bymaEnabled);

  if (panels.length < 2) return null;

  return (
    <nav aria-label="Paneles de Acciones" className="border-b border-base-700">
      {/* Horizontal scrolling forces an overflow box on both axes, so the vertical one is clipped explicitly. */}
      <div className="flex overflow-x-auto overflow-y-hidden">
        {panels.map((item) => (
          <Link
            key={item.id}
            to={accionesHref(item.id, { previewUnavailable })}
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
};

/** Without an alignment: Tailwind emits `text-right` after `text-left` and `text-center`, so a cell that composed two of them would always end up right-aligned. */
export const headBaseClassName =
  "px-4 py-3 align-bottom font-mono text-label-caps whitespace-nowrap text-text-200 uppercase";

export const headClassName = `${headBaseClassName} text-right`;

/** The instrument column stays in view while the figures scroll sideways on narrow screens. */
export const stickyClassName = "sticky left-0 z-10 bg-surface-950 text-left";

export const figureClassName =
  "px-4 text-right font-mono text-body-sm whitespace-nowrap text-text-100";

/** Every body row has the same height, so the loading skeleton reserves the populated rows. */
export const rowClassName = "h-14 border-b border-base-700 last:border-b-0";

export const Unavailable = () => (
  <span className="font-mono text-body-sm text-text-400">s/d</span>
);

const Change = ({ value }: { value: number | null }) =>
  value === null ? (
    <Unavailable />
  ) : (
    <TrendIndicator value={value} signed className="justify-end" />
  );

interface InstrumentCellProps {
  symbol: string;
  name: string;
  etf?: boolean;
}

const InstrumentCell = ({ symbol, name, etf = false }: InstrumentCellProps) => (
  <th scope="row" className={`${stickyClassName} px-4 font-normal`}>
    <span className="flex items-center gap-2">
      <span className="font-mono text-body-sm text-text-100">{symbol}</span>
      {etf ? (
        <span className="border border-base-700 px-1 font-mono text-label-caps text-text-200 uppercase">
          ETF
        </span>
      ) : null}
    </span>
    {/* The name is truncated visually only; assistive technology reads it whole. */}
    <span
      className="block max-w-24 truncate text-body-sm text-text-400 md:max-w-72"
      title={name !== symbol ? name : undefined}
    >
      {name !== symbol ? name : "\xA0"}
    </span>
  </th>
);

export const SkeletonRow = ({ figures }: { figures: number }) => (
  <tr className={rowClassName} aria-hidden="true">
    <td className={`${stickyClassName} px-4`}>
      <Skeleton className="h-4 w-14" />
      <Skeleton className="mt-1 h-4 w-28" />
    </td>
    {Array.from({ length: figures }, (_, index) => (
      <td key={index} className="px-4">
        <Skeleton className="ml-auto h-3 w-16" />
      </td>
    ))}
  </tr>
);

interface TableFrameProps {
  id: string;
  title: string;
  caption: string;
  /** Data time or report line beside the title, or a skeleton while loading; omitted when the table has none. */
  meta?: ReactNode;
  /** Stale or partial-data notices above the table; omitted when the table never has any. */
  notices?: ReactNode;
  loading: boolean;
  head: ReactNode;
  body: ReactNode;
  /** Explanations under the table, identical in every state; omitted when the title and headers say enough. */
  notes?: ReactNode;
  /** Caps the table's height and scrolls it inside the frame; its headers should be pinned. */
  scrollable?: boolean;
}

/** Shared chrome of both panels: heading and data time, notices, a labelled keyboard-scrollable table region, and the notes. */
export const TableFrame = ({
  id,
  title,
  caption,
  meta,
  notices,
  loading,
  head,
  body,
  notes,
  scrollable = false,
}: TableFrameProps) => (
  <section
    id={id}
    className="stack-4 min-w-0"
    aria-labelledby={`${id}-title`}
    aria-busy={loading}
  >
    {loading ? (
      <span className="sr-only" role="status">
        Cargando {title}.
      </span>
    ) : null}

    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <h2
        id={`${id}-title`}
        className="font-heading text-headline-md text-text-100"
      >
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-data-label text-text-400">
        {meta}
      </div>
    </div>

    {notices}

    {/* Focusable so keyboard users can scroll the columns that do not fit; the caption names the region. */}
    <div
      role="region"
      aria-labelledby={`${id}-caption`}
      tabIndex={0}
      className={`min-w-0 overflow-x-auto border border-base-700 bg-surface-950 ${scrollable ? "max-h-128 overflow-y-auto" : "overflow-y-hidden"}`}
    >
      <table className="w-full min-w-max border-collapse">
        <caption id={`${id}-caption`} className="sr-only">
          {caption}
        </caption>
        {head}
        <tbody>{body}</tbody>
      </table>
    </div>

    {notes ? (
      <div className="stack-2 text-body-sm text-text-400">{notes}</div>
    ) : null}
  </section>
);

interface DataTimeProps {
  panel: EquityPanel<{ latestTradeTime: string | null }> | null;
}

/** Last trade (Buenos Aires time, as BYMA sends it) and when this server received the list. */
const DataTime = ({ panel }: DataTimeProps) => {
  if (panel === null)
    return (
      <>
        <span className="flex h-3 items-center">
          <Skeleton className="h-3 w-36" />
        </span>
        <span className="flex h-3 items-center">
          <Skeleton className="h-3 w-44" />
        </span>
      </>
    );

  const available = panel.status === "available";

  return (
    <>
      <span className="flex h-3 items-center">
        Última operación:{" "}
        {available && panel.data.latestTradeTime
          ? `${formatTradeTime(panel.data.latestTradeTime)} ART`
          : "s/d"}
      </span>
      <span className="flex h-3 items-center">
        Consulta: {available ? `${panel.freshness.fetchedAtLabel} ART` : "s/d"}
      </span>
    </>
  );
};

interface UnavailableBodyProps {
  columns: number;
  children: ReactNode;
}

/** A single row with the notice: the table keeps its header and frame, without empty rows standing in for missing data. */
export const UnavailableBody = ({
  columns,
  children,
}: UnavailableBodyProps) => (
  <tr>
    <td colSpan={columns} className="p-4">
      <UnavailableNotice>{children}</UnavailableNotice>
    </td>
  </tr>
);

const CEDEAR_FIGURES = 6;

const CedearHead = () => (
  <>
    <colgroup span={4} />
    <colgroup span={2} />
    <colgroup span={1} />
    <thead className="border-b border-base-700">
      <tr>
        <th
          scope="col"
          rowSpan={2}
          className={`${headBaseClassName} ${stickyClassName}`}
        >
          Instrumento
        </th>
        <th scope="col" rowSpan={2} className={headClassName}>
          Precio
        </th>
        <th scope="col" rowSpan={2} className={headClassName}>
          Var. día
        </th>
        <th scope="col" rowSpan={2} className={headClassName}>
          Tipo de cambio implícito
        </th>
        <th
          scope="colgroup"
          colSpan={2}
          className={`${headBaseClassName} border-x border-base-700 pb-1 text-center`}
        >
          Descomposición de la variación
        </th>
        <th scope="col" rowSpan={2} className={headClassName}>
          Monto operado
        </th>
      </tr>
      <tr>
        <th
          scope="col"
          className={`${headClassName} border-l border-base-700 pt-1`}
        >
          Subyacente (aprox.)
        </th>
        <th
          scope="col"
          className={`${headClassName} border-r border-base-700 pt-1`}
        >
          Tipo de cambio
        </th>
      </tr>
    </thead>
  </>
);

const CedearTableRow = ({ row }: { row: CedearRow }) => (
  <tr className={rowClassName}>
    <InstrumentCell
      symbol={row.symbol}
      name={row.name}
      etf={row.kind === "etf"}
    />
    <td className={figureClassName}>
      {formatEquityPrice(row.pesos.last, "ARS")}
    </td>
    <td className={figureClassName}>
      <Change value={row.pesos.changePct} />
    </td>
    <td className={figureClassName}>
      {row.impliedRate ? (
        <>
          {formatEquityPrice(row.impliedRate.value, "ARS")}{" "}
          <span className="text-label-caps text-text-400 uppercase">
            {row.impliedRate.basis}
          </span>
        </>
      ) : (
        <Unavailable />
      )}
    </td>
    <td className={`${figureClassName} border-l border-base-700`}>
      <Change value={row.decomposition?.dollarPct ?? null} />
    </td>
    <td className={`${figureClassName} border-r border-base-700`}>
      <Change value={row.decomposition?.ratePct ?? null} />
    </td>
    <td className={figureClassName}>{formatTradedAmount(row.tradedAmount)}</td>
  </tr>
);

const CEDEAR_SOURCE_NAMES = {
  cedears: "CEDEAR de acciones",
  etf: "CEDEAR de ETF",
} as const;

/** The one caveat the table cannot do without; the method is in `/docs`. */
const CedearNotes = () => (
  <p>
    La variación en dólares aproxima la del subyacente; no es su cotización en
    el mercado de origen.
  </p>
);

interface CedearTableProps {
  /** `null` while loading. */
  panel: EquityPanel<CedearPanelData> | null;
}

export const CedearTable = ({ panel }: CedearTableProps) => {
  const loading = panel === null;

  const notices =
    panel?.status === "available" ? (
      <>
        <StaleNotice freshness={panel.freshness} />
        {panel.data.missingSources.length ? (
          <UnavailableNotice>
            No fue posible consultar la lista de{" "}
            {panel.data.missingSources
              .map((source) => CEDEAR_SOURCE_NAMES[source])
              .join(", ")}
            . La tabla muestra el resto de los instrumentos.
          </UnavailableNotice>
        ) : null}
      </>
    ) : null;

  const body =
    panel === null ? (
      Array.from({ length: CEDEAR_ROW_LIMIT }, (_, index) => (
        <SkeletonRow key={index} figures={CEDEAR_FIGURES} />
      ))
    ) : panel.status === "unavailable" ? (
      <UnavailableBody columns={CEDEAR_FIGURES + 1}>
        No fue posible consultar los CEDEAR en BYMA en este momento. La página
        volverá a intentarlo en unos minutos.
      </UnavailableBody>
    ) : panel.data.rows.length ? (
      visibleCedearRows(panel.data.rows).map((row) => (
        <CedearTableRow key={row.symbol} row={row} />
      ))
    ) : (
      <UnavailableBody columns={CEDEAR_FIGURES + 1}>
        BYMA no informó CEDEAR para esta rueda.
      </UnavailableBody>
    );

  return (
    <TableFrame
      id="cedears"
      title="CEDEARs más operados"
      caption={`Los ${CEDEAR_ROW_LIMIT} CEDEAR más operados del día: precio en pesos, variación, tipo de cambio implícito, descomposición de la variación y monto operado.`}
      meta={<DataTime panel={panel} />}
      notices={notices}
      loading={loading}
      head={<CedearHead />}
      body={body}
      notes={<CedearNotes />}
    />
  );
};

const LEADER_FIGURES = 4;

const LeaderHead = () => (
  <thead className="border-b border-base-700">
    <tr>
      <th scope="col" className={`${headBaseClassName} ${stickyClassName}`}>
        Instrumento
      </th>
      <th scope="col" className={`${headBaseClassName} text-left`}>
        Sector
      </th>
      <th scope="col" className={headClassName}>
        Precio
      </th>
      <th scope="col" className={headClassName}>
        Var. día
      </th>
      <th scope="col" className={headClassName}>
        Monto operado
      </th>
    </tr>
  </thead>
);

const LeaderTableRow = ({ row }: { row: LeaderRow }) => (
  <tr className={rowClassName}>
    <InstrumentCell symbol={row.symbol} name={row.name} />
    <td className="px-4 text-body-sm whitespace-nowrap text-text-300">
      {row.sector ?? <Unavailable />}
    </td>
    <td className={figureClassName}>{formatEquityPrice(row.last, "ARS")}</td>
    <td className={figureClassName}>
      <Change value={row.changePct} />
    </td>
    <td className={figureClassName}>{formatTradedAmount(row.tradedAmount)}</td>
  </tr>
);

interface LeaderTableProps {
  /** `null` while loading. */
  panel: EquityPanel<LeaderPanelData> | null;
}

export const LeaderTable = ({ panel }: LeaderTableProps) => {
  const loading = panel === null;

  const body =
    panel === null ? (
      Array.from({ length: LEADER_SKELETON_ROWS }, (_, index) => (
        <SkeletonRow key={index} figures={LEADER_FIGURES} />
      ))
    ) : panel.status === "unavailable" ? (
      <UnavailableBody columns={LEADER_FIGURES + 1}>
        No fue posible consultar el panel líder en BYMA en este momento. La
        página volverá a intentarlo en unos minutos.
      </UnavailableBody>
    ) : panel.data.rows.length ? (
      panel.data.rows.map((row) => (
        <LeaderTableRow key={row.symbol} row={row} />
      ))
    ) : (
      <UnavailableBody columns={LEADER_FIGURES + 1}>
        BYMA no informó acciones del panel líder para esta rueda.
      </UnavailableBody>
    );

  return (
    <TableFrame
      id="lideres"
      title="Panel líder S&P Merval"
      caption="Acciones del panel líder del S&P Merval: sector, precio en pesos, variación del día y monto operado."
      meta={<DataTime panel={panel} />}
      notices={
        panel?.status === "available" ? (
          <StaleNotice freshness={panel.freshness} />
        ) : null
      }
      loading={loading}
      head={<LeaderHead />}
      body={body}
    />
  );
};
