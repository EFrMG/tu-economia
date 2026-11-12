import type { ReactNode } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { Form, Link, useLocation, useSubmit } from "react-router";

import {
  Unavailable,
  figureClassName,
  headBaseClassName,
  headClassName,
  rowClassName,
  stickyClassName,
  TableFrame,
} from "~/components/features/EquityTables";
import { Button } from "~/components/ui/Button";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import {
  CARD_SEGMENTS,
  DEFAULT_RATES_PANEL,
  LOAN_BENEFICIARIES,
  LOAN_PROFILES,
  LOAN_TERMS,
  PROVINCES,
  RATES_PANELS,
  formatPesos,
  formatRate,
  formatRatesDate,
  isRatesPanel,
  isUnusuallyLowCft,
  labelOf,
  ratesSearch,
  type CardFilters,
  type CardProduct,
  type LenderRow,
  type LoanFilters,
  type LoanProduct,
  type RatesPage,
  type RatesPanelId,
} from "~/lib/transparency-rates";

const tabClassName =
  "font-mono text-label-caps shrink-0 border-b-2 px-2 sm:px-4 py-3 uppercase motion-safe:transition-colors focus-visible:outline-none";

const fieldClassName = `border-base-700 bg-base-950 text-text-100 h-12 w-full border px-3 font-mono text-body-sm ${fieldFocusClassName}`;

const labelClassName =
  "mb-2 block font-mono text-data-label text-text-200 uppercase";

const textCellClassName =
  "px-4 text-left text-body-sm whitespace-nowrap text-text-300";

const headLeftClassName = `${headBaseClassName} text-left`;

const linkClassName =
  "text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline";

/** The `?panel=` switch. It reads the URL itself, so it is correct in the page and its error state. Switching panels drops the other panel's filters. */
export const RatesPanelSwitch = () => {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("panel");
  const active = isRatesPanel(requested) ? requested : DEFAULT_RATES_PANEL;

  return (
    <nav aria-label="Paneles de Tasas" className="border-b border-base-700">
      {/* Horizontal scrolling forces an overflow box on both axes, so the vertical one is clipped explicitly. */}
      <div className="flex overflow-x-auto overflow-y-hidden">
        {RATES_PANELS.map((item) => (
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
};

interface SelectFieldProps {
  name: string;
  label: string;
  value: string;
  /** The empty option, which removes the filter. */
  anyLabel: string;
  options: readonly { value: string; label: string }[];
}

/** Submits its form on change; the form's button applies it without JavaScript. `key` remounts it when the URL changes the value. */
const SelectField = ({
  name,
  label,
  value,
  anyLabel,
  options,
}: SelectFieldProps) => {
  const submit = useSubmit();

  return (
    <label className="block min-w-0 p-0">
      <span className={labelClassName}>{label}</span>
      <select
        key={value}
        name={name}
        defaultValue={value}
        onChange={(event) =>
          submit(event.currentTarget.form, { preventScrollReset: true })
        }
        className={`${fieldClassName} themed-select`}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
};

const provinceOptions = PROVINCES.map(({ id, label }) => ({
  value: id,
  label,
}));

interface FilterFormProps {
  panel: RatesPanelId;
  children: ReactNode;
  /** Whether any filter is set, which offers to remove them all. */
  filtered: boolean;
  /** Two fields take half the row from `xl`, centered, so they keep the width of the four-field form's fields. */
  compact?: boolean;
}

/** A GET form, so the filters live in the URL and the page works without JavaScript. Applying filters returns to page 1. */
const FilterForm = ({
  panel,
  children,
  filtered,
  compact = false,
}: FilterFormProps) => (
  <Form method="get" preventScrollReset className="stack-4">
    <input type="hidden" name="panel" value={panel} />
    <div
      className={`grid gap-4 sm:grid-cols-2 ${compact ? "xl:mx-auto xl:w-1/2" : "xl:grid-cols-4"}`}
    >
      {children}
    </div>
    <div className="flex flex-wrap items-center justify-center gap-4">
      <Button type="submit" variant="outline" size="sm">
        Aplicar
      </Button>
      {filtered ? (
        <Link
          to={`?panel=${panel}`}
          preventScrollReset
          className={`font-mono text-data-label ${linkClassName}`}
        >
          Quitar filtros
        </Link>
      ) : null}
    </div>
  </Form>
);

export const LoanFilterForm = ({ filters }: { filters: LoanFilters }) => (
  <FilterForm
    panel="prestamos"
    filtered={
      filters.perfil !== null ||
      filters.plazo !== null ||
      filters.monto !== null ||
      filters.provincia !== null
    }
  >
    <SelectField
      name="perfil"
      label="Perfil"
      value={filters.perfil ?? ""}
      anyLabel="Todos los perfiles"
      options={LOAN_PROFILES.map(({ id, label }) => ({ value: id, label }))}
    />
    <SelectField
      name="plazo"
      label="Plazo mínimo"
      value={filters.plazo === null ? "" : String(filters.plazo)}
      anyLabel="Cualquier plazo"
      options={LOAN_TERMS.map((term) => ({
        value: String(term),
        label: `${term} meses`,
      }))}
    />
    <label className="block min-w-0 p-0">
      <span className={labelClassName}>Monto en pesos</span>
      <input
        key={filters.monto ?? ""}
        name="monto"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Cualquier monto"
        defaultValue={filters.monto ?? ""}
        className={fieldClassName}
      />
    </label>
    <SelectField
      name="provincia"
      label="Provincia"
      value={filters.provincia ?? ""}
      anyLabel="Todo el país"
      options={provinceOptions}
    />
  </FilterForm>
);

export const CardFilterForm = ({ filters }: { filters: CardFilters }) => (
  <FilterForm
    panel="tarjetas"
    filtered={filters.segmento !== null || filters.provincia !== null}
    compact
  >
    <SelectField
      name="segmento"
      label="Segmento"
      value={filters.segmento ?? ""}
      anyLabel="Todos los segmentos"
      options={CARD_SEGMENTS.map(({ id, label }) => ({ value: id, label }))}
    />
    <SelectField
      name="provincia"
      label="Provincia"
      value={filters.provincia ?? ""}
      anyLabel="Todo el país"
      options={provinceOptions}
    />
  </FilterForm>
);

/** The lender stays in view while the figures scroll sideways; its legal name is long, so it is truncated visually only. */
const LenderCell = ({ name, matches }: { name: string; matches: number }) => (
  <th scope="row" className={`${stickyClassName} px-4 font-normal`}>
    <span
      className="block max-w-36 truncate text-body-sm text-text-100 md:max-w-72"
      title={name}
    >
      {name}
    </span>
    <span className="block font-mono text-data-label text-text-400">
      {matches === 1 ? "1 producto" : `${matches} productos`}
    </span>
  </th>
);

const ProductCell = ({ name }: { name: string }) => (
  <td className={textCellClassName}>
    <span className="block max-w-56 truncate" title={name}>
      {name}
    </span>
  </td>
);

const Figure = ({ value }: { value: string | null }) => (
  <td className={figureClassName}>{value ?? <Unavailable />}</td>
);

const EmptyBody = ({ columns }: { columns: number }) => (
  <tr>
    <td colSpan={columns} className="p-4 text-body-sm text-text-300">
      Ninguna entidad informa productos que cumplan estos filtros.
    </td>
  </tr>
);

const pageLinkClassName =
  "flex size-10 items-center justify-center text-headline-md";

/** Without a target, an invisible placeholder keeps the page label from shifting at the first and last page. */
const PageLink = ({
  to,
  label,
  icon,
}: {
  to: string | null;
  label: string;
  icon: ReactNode;
}) =>
  to === null ? (
    <span aria-hidden="true" className={`${pageLinkClassName} invisible`}>
      {icon}
    </span>
  ) : (
    <Link
      to={to}
      aria-label={label}
      className={`${pageLinkClassName} text-primary-text-100 focus-visible:outline-none hocus:bg-surface-900/80`}
    >
      {icon}
    </Link>
  );

interface PaginationProps<Filters extends LoanFilters | CardFilters> {
  panel: RatesPanelId;
  filters: Filters;
  page: number;
  pages: number;
}

const Pagination = <Filters extends LoanFilters | CardFilters>({
  panel,
  filters,
  page,
  pages,
}: PaginationProps<Filters>) => {
  if (pages < 2) return null;

  const href = (pagina: number) =>
    `?${ratesSearch(panel, { ...filters, pagina })}`;

  return (
    <nav
      aria-label="Páginas de entidades"
      className="flex items-center justify-center gap-4"
    >
      <PageLink
        to={page > 1 ? href(page - 1) : null}
        label="Página anterior"
        icon={<MdChevronLeft aria-hidden="true" />}
      />
      <span className="text-body-lg text-text-200">
        Página {page} de {pages}
      </span>
      <PageLink
        to={page < pages ? href(page + 1) : null}
        label="Página siguiente"
        icon={<MdChevronRight aria-hidden="true" />}
      />
    </nav>
  );
};

interface PanelMetaProps {
  builtOn: string;
  lenders: number;
  products: number;
}

const PanelMeta = ({ builtOn, lenders, products }: PanelMetaProps) => (
  <>
    <span>
      {lenders === 1 ? "1 entidad" : `${lenders} entidades`} ·{" "}
      {products === 1 ? "1 producto" : `${products} productos`}
    </span>
    <span>Consultado el {formatRatesDate(builtOn)}</span>
  </>
);

interface PanelData<Product> extends RatesPage<Product> {
  builtOn: string;
}

const LOAN_COLUMNS = 8;

const LoanHead = () => (
  <thead className="border-b border-base-700">
    <tr>
      <th scope="col" className={`${headBaseClassName} ${stickyClassName}`}>
        Entidad
      </th>
      <th scope="col" className={headLeftClassName}>
        Producto
      </th>
      <th scope="col" className={headLeftClassName}>
        Destinatarios
      </th>
      <th scope="col" className={headClassName}>
        CFT máx.
      </th>
      <th scope="col" className={headClassName}>
        TEA máx.
      </th>
      <th scope="col" className={headClassName}>
        Plazo máx.
      </th>
      <th scope="col" className={headClassName}>
        Monto
      </th>
      <th scope="col" className={headClassName}>
        Informado
      </th>
    </tr>
  </thead>
);

const LoanRow = ({ row }: { row: LenderRow<LoanProduct> }) => {
  const { best } = row;

  return (
    <tr className={rowClassName}>
      <LenderCell name={best.entity} matches={row.matches} />
      <ProductCell name={best.product} />
      <td className={textCellClassName}>
        {labelOf(LOAN_BENEFICIARIES, best.beneficiary)}
      </td>
      <td className={figureClassName}>
        {formatRate(best.cft)}
        {isUnusuallyLowCft(best) ? (
          <span className="block font-mono text-data-label text-text-400">
            Valor inusualmente bajo
          </span>
        ) : null}
      </td>
      <Figure value={formatRate(best.tea)} />
      <Figure value={`${best.termMonths} meses`} />
      <Figure
        value={
          best.amountMax > 0
            ? `${formatPesos(best.amountMin)} a ${formatPesos(best.amountMax)}`
            : null
        }
      />
      <Figure value={formatRatesDate(best.date)} />
    </tr>
  );
};

export const LoanTable = ({
  data,
  filters,
}: {
  data: PanelData<LoanProduct>;
  filters: LoanFilters;
}) => (
  <TableFrame
    id="prestamos"
    title="Préstamos personales en pesos"
    caption="Por entidad, el préstamo personal en pesos con menor costo financiero total máximo entre los que cumplen los filtros: producto, destinatarios, CFT y TEA máximos, plazo máximo, montos y fecha en que la entidad lo informó."
    meta={
      <PanelMeta
        builtOn={data.builtOn}
        lenders={data.lenders}
        products={data.products}
      />
    }
    loading={false}
    head={<LoanHead />}
    body={
      data.rows.length ? (
        data.rows.map((row) => <LoanRow key={row.best.entityCode} row={row} />)
      ) : (
        <EmptyBody columns={LOAN_COLUMNS} />
      )
    }
    notes={
      <>
        <Pagination
          panel="prestamos"
          filters={filters}
          page={data.page}
          pages={data.pages}
        />
        <p>
          El CFT incluye intereses, comisiones, gastos e impuestos; la TEA, solo
          intereses. Ambos son máximos: la tasa ofrecida puede ser menor según
          el perfil de quien solicita el préstamo.
        </p>
      </>
    }
  />
);

const CARD_COLUMNS = 8;

const CardHead = () => (
  <thead className="border-b border-base-700">
    <tr>
      <th scope="col" className={`${headBaseClassName} ${stickyClassName}`}>
        Entidad
      </th>
      <th scope="col" className={headLeftClassName}>
        Tarjeta
      </th>
      <th scope="col" className={headLeftClassName}>
        Segmento
      </th>
      <th scope="col" className={headClassName}>
        TEA financiación
      </th>
      <th scope="col" className={headClassName}>
        TEA adelanto
      </th>
      <th scope="col" className={headClassName}>
        Comisión mensual
      </th>
      <th scope="col" className={headClassName}>
        Renovación anual
      </th>
      <th scope="col" className={headClassName}>
        Informado
      </th>
    </tr>
  </thead>
);

const CardRow = ({ row }: { row: LenderRow<CardProduct> }) => {
  const { best } = row;

  return (
    <tr className={rowClassName}>
      <LenderCell name={best.entity} matches={row.matches} />
      <ProductCell name={best.product} />
      <td className={textCellClassName}>
        {labelOf(CARD_SEGMENTS, best.segment) ?? <Unavailable />}
      </td>
      <Figure value={formatRate(best.financingTea)} />
      <Figure
        value={
          best.cashAdvanceTea === null ? null : formatRate(best.cashAdvanceTea)
        }
      />
      <Figure
        value={
          best.maintenanceFee === null ? null : formatPesos(best.maintenanceFee)
        }
      />
      <Figure
        value={best.renewalFee === null ? null : formatPesos(best.renewalFee)}
      />
      <Figure value={formatRatesDate(best.date)} />
    </tr>
  );
};

export const CardTable = ({
  data,
  filters,
}: {
  data: PanelData<CardProduct>;
  filters: CardFilters;
}) => (
  <TableFrame
    id="tarjetas"
    title="Tarjetas de crédito"
    caption="Por entidad, la tarjeta de crédito con menor tasa efectiva anual máxima de financiación entre las que cumplen los filtros: segmento, tasas máximas de financiación y de adelanto en efectivo, comisiones de mantenimiento y renovación, y fecha en que la entidad la informó."
    meta={
      <PanelMeta
        builtOn={data.builtOn}
        lenders={data.lenders}
        products={data.products}
      />
    }
    loading={false}
    head={<CardHead />}
    body={
      data.rows.length ? (
        data.rows.map((row) => <CardRow key={row.best.entityCode} row={row} />)
      ) : (
        <EmptyBody columns={CARD_COLUMNS} />
      )
    }
    notes={
      <>
        <Pagination
          panel="tarjetas"
          filters={filters}
          page={data.page}
          pages={data.pages}
        />
        <p>
          Las tasas son efectivas anuales y máximas; las comisiones, de
          tarifario y sin bonificaciones.
        </p>
      </>
    }
  />
);
