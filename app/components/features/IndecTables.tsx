import type { ReactNode } from "react";

import {
  figureClassName,
  headBaseClassName,
  headClassName,
  rowClassName,
  SkeletonRow,
  stickyClassName,
  TableFrame,
  Unavailable,
  UnavailableBody,
} from "~/components/features/EquityTables";
import { Skeleton } from "~/components/ui/Skeleton";
import {
  BASKETS,
  BASKETS_SERVICE,
  PRICES_SERVICE,
  WAGES_SERVICE,
  formatChange,
  formatIndecPeriod,
  formatPesos,
  indecServiceUrl,
  type BasketsData,
  type ConsumerPricesData,
  type IndecData,
  type PriceRow,
  type WagesData,
} from "~/lib/indec";
import { formatReleaseDate, nextRelease } from "~/lib/indec-calendar";

const linkClassName =
  "shrink-0 self-end font-mono sm:self-start text-data-label text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline";

const Figure = ({ value }: { value: string | null }) => (
  <td className={figureClassName}>{value ?? <Unavailable />}</td>
);

const Change = ({ value }: { value: number | null }) => (
  <Figure value={value === null ? null : formatChange(value)} />
);

const RowHeader = ({ label, detail }: { label: string; detail?: string }) => (
  <th scope="row" className={`${stickyClassName} px-4 font-normal`}>
    <span className="block text-body-sm text-text-100">{label}</span>
    {detail ? (
      <span className="block font-mono text-data-label text-text-400">
        {detail}
      </span>
    ) : null}
  </th>
);

/** A row's bottom border does not travel with a sticky cell, so pinned headers draw it as an inset shadow. */
const pinnedClassName =
  "sticky top-0 bg-surface-950 shadow-[inset_0_-1px_0_var(--color-base-700)]";

interface HeadProps {
  first: string;
  figures: string[];
  /** Keeps the headers in view while the table scrolls inside its frame. */
  pinned?: boolean;
}

const Head = ({ first, figures, pinned = false }: HeadProps) => (
  <thead className="border-b border-base-700">
    <tr>
      <th
        scope="col"
        className={
          pinned
            ? `${headBaseClassName} ${pinnedClassName} left-0 z-30 text-left`
            : `${headBaseClassName} ${stickyClassName}`
        }
      >
        {first}
      </th>
      {figures.map((figure) => (
        <th
          key={figure}
          scope="col"
          className={
            pinned ? `${headClassName} ${pinnedClassName} z-20` : headClassName
          }
        >
          {figure}
        </th>
      ))}
    </tr>
  </thead>
);

const Period = ({
  period,
  place,
  nextRelease: nextReleaseDate,
}: {
  period: string | null;
  place?: string;
  nextRelease?: string | null;
}) =>
  period === null ? (
    <Skeleton className="h-3 w-32" />
  ) : (
    <span className="first-letter:uppercase">
      {formatIndecPeriod(period)}
      {nextReleaseDate
        ? ` (Próxima: ${formatReleaseDate(nextReleaseDate)})`
        : null}
      {place ? ` · ${place}` : null}
    </span>
  );

/** The explanation, with the link to the service at its top right, or below it on narrow screens. */
const Notes = ({
  service,
  children,
}: {
  service: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
    <p className="max-w-3xl">{children}</p>
    <a
      href={indecServiceUrl(service)}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
    >
      Ver el servicio en el INDEC ↗
    </a>
  </div>
);

/** `undefined` while loading, `null` when the service could not be read. */
type Part<Data> = Data | null | undefined;

const skeletonRows = (count: number, figures: number) =>
  Array.from({ length: count }, (_, index) => (
    <SkeletonRow key={index} figures={figures} />
  ));

const unavailableBody = (figures: number) => (
  <UnavailableBody columns={figures + 1}>
    No fue posible consultar este dato del INDEC en este momento.
  </UnavailableBody>
);

const BASKET_FIGURES = 4;

const BasketsTable = ({ data }: { data: Part<BasketsData> }) => (
  <TableFrame
    id="canasta-basica"
    title="Canasta básica"
    caption="Valor mensual de la canasta básica alimentaria y de la canasta básica total en Gran Buenos Aires, por adulto equivalente y para un hogar de cuatro personas, con su variación mensual e interanual."
    meta={
      data === null ? undefined : (
        <Period
          period={data?.period ?? null}
          place="Gran Buenos Aires"
          nextRelease={nextRelease("canasta")?.releaseDate ?? null}
        />
      )
    }
    loading={data === undefined}
    head={
      <Head
        first="Canasta"
        figures={[
          "Por adulto equivalente",
          "Hogar de 4 personas",
          "Var. mensual",
          "Var. interanual",
        ]}
      />
    }
    body={
      data === undefined
        ? skeletonRows(BASKETS.length, BASKET_FIGURES)
        : data === null
          ? unavailableBody(BASKET_FIGURES)
          : data.rows.map((row) => {
              const basket = BASKETS.find(({ id }) => id === row.id)!;

              return (
                <tr key={row.id} className={rowClassName}>
                  <RowHeader label={basket.label} detail={basket.line} />
                  <Figure
                    value={
                      row.perAdult === null ? null : formatPesos(row.perAdult)
                    }
                  />
                  <Figure
                    value={
                      row.household === null ? null : formatPesos(row.household)
                    }
                  />
                  <Change value={row.monthly} />
                  <Change value={row.yearly} />
                </tr>
              );
            })
    }
    notes={
      <Notes service={BASKETS_SERVICE}>
        El hogar de 4 personas es el hogar tipo 2 del INDEC: un varón de 35
        años, una mujer de 31, un hijo de 6 y una hija de 8. Un hogar es pobre
        cuando sus ingresos no alcanzan la canasta total de su composición, e
        indigente cuando no alcanzan la alimentaria.
      </Notes>
    }
  />
);

const WAGE_FIGURES = 3;

const WagesTable = ({ data }: { data: Part<WagesData> }) => (
  <TableFrame
    id="salarios"
    title="Salarios"
    caption="Variación mensual e interanual del índice de salarios por sector, y la variación interanual descontada la inflación del mismo mes."
    meta={
      data === null ? undefined : (
        <Period
          period={data?.period ?? null}
          nextRelease={nextRelease("salarios")?.releaseDate ?? null}
        />
      )
    }
    loading={data === undefined}
    head={
      <Head
        first="Sector"
        figures={["Var. mensual", "Var. interanual", "Interanual real"]}
      />
    }
    body={
      data === undefined
        ? skeletonRows(4, WAGE_FIGURES)
        : data === null
          ? unavailableBody(WAGE_FIGURES)
          : data.rows.map((row) => (
              <tr key={row.code} className={rowClassName}>
                <RowHeader label={row.label} />
                <Change value={row.monthly} />
                <Change value={row.yearly} />
                <Change value={row.realYearly} />
              </tr>
            ))
    }
    notes={
      <Notes service={WAGES_SERVICE}>
        La variación real descuenta la inflación interanual del mismo mes
        {data?.inflationYearly != null
          ? ` (${formatChange(data.inflationYearly)})`
          : ""}
        : un valor positivo indica que los salarios aumentaron más que los
        precios.
      </Notes>
    }
  />
);

const PRICE_FIGURES = 2;

const GroupRow = ({ children }: { children: ReactNode }) => (
  <tr className="border-b border-base-700 bg-surface-900">
    <th
      scope="rowgroup"
      colSpan={PRICE_FIGURES + 1}
      className="px-4 py-2 text-left font-mono text-data-label font-bold text-text-100 uppercase"
    >
      {children}
    </th>
  </tr>
);

const PriceRows = ({ rows }: { rows: PriceRow[] }) =>
  rows.map((row) => (
    <tr key={row.code} className={rowClassName}>
      <RowHeader label={row.label} />
      <Change value={row.monthly} />
      <Change value={row.yearly} />
    </tr>
  ));

const PricesTable = ({ data }: { data: Part<ConsumerPricesData> }) => (
  <TableFrame
    id="inflacion-por-rubro"
    title="Inflación por rubro y región"
    caption="Variación mensual e interanual del índice de precios al consumidor: nivel general, divisiones y categorías a nivel nacional, y nivel general de cada región."
    meta={
      data === null ? undefined : (
        <Period
          period={data?.period ?? null}
          nextRelease={nextRelease("ipc")?.releaseDate ?? null}
        />
      )
    }
    loading={data === undefined}
    head={
      <Head
        first="Rubro"
        figures={["Var. mensual", "Var. interanual"]}
        pinned
      />
    }
    scrollable
    body={
      data === undefined ? (
        skeletonRows(6, PRICE_FIGURES)
      ) : data === null ? (
        unavailableBody(PRICE_FIGURES)
      ) : (
        <>
          <PriceRows rows={[data.general]} />
          <GroupRow>Divisiones</GroupRow>
          <PriceRows rows={data.divisions} />
          <GroupRow>Categorías</GroupRow>
          <PriceRows rows={data.categories} />
          <GroupRow>Regiones</GroupRow>
          <PriceRows rows={data.regions} />
        </>
      )
    }
    notes={
      <Notes service={PRICES_SERVICE}>
        Las divisiones y las categorías corresponden al total del país. Los
        precios regulados dependen de decisiones del Estado y los estacionales
        tienen variaciones propias de cada época del año; el resto forma la
        inflación núcleo.
      </Notes>
    }
  />
);

/** `data` is `undefined` while loading; each table shows its own unavailable state. */
export const IndecTables = ({ data }: { data?: IndecData }) => (
  <>
    <BasketsTable data={data?.baskets} />
    <WagesTable data={data?.wages} />
    <PricesTable data={data?.prices} />
  </>
);
