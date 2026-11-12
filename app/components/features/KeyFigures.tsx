import { Link } from "react-router";

import { Skeleton } from "~/components/ui/Skeleton";
import {
  formatChange,
  formatIndecPeriod,
  formatPesos,
  type IndecData,
} from "~/lib/indec";
import { indicatorCardId } from "~/lib/indicator-search";
import {
  formatIndicatorPeriod,
  formatIndicatorValue,
  INDICATOR_DEFINITIONS,
  indicatorGroupPathname,
  type IndicatorId,
  type IndicatorResult,
} from "~/lib/indicators";

interface Figure {
  id: string;
  label: string;
  /** `null` when the source could not be read. */
  value: string | null;
  period: string | null;
  /** Where the figure is shown in full, with its element id. */
  href: string;
  destination: string;
}

const indicatorFigure = (
  id: IndicatorId,
  results: IndicatorResult[],
  destination: string,
): Figure => {
  const definition = INDICATOR_DEFINITIONS.find((item) => item.id === id)!;
  const point = results.find((result) => result.id === id)?.point ?? null;

  return {
    id,
    label: definition.title,
    value: point ? formatIndicatorValue(point.value, definition.unit) : null,
    period: point ? formatIndicatorPeriod(point.date, definition.period) : null,
    href: `${indicatorGroupPathname(definition.group)}#${indicatorCardId(id)}`,
    destination,
  };
};

/** The headline figure of each subject page, in sidebar order. */
const figuresOf = (results: IndicatorResult[], indec: IndecData): Figure[] => {
  const cbt = indec.baskets?.rows.find((row) => row.id === "CBT");
  const wages = indec.wages?.rows.find((row) => row.code === "0");

  return [
    indicatorFigure("inflation-monthly", results, "Precios e ingresos"),
    {
      id: "cbt",
      label: "Canasta básica total",
      value: cbt?.perAdult != null ? formatPesos(cbt.perAdult) : null,
      period:
        indec.baskets && cbt?.perAdult != null
          ? `${formatIndecPeriod(indec.baskets.period)}, por adulto`
          : null,
      href: "/precios#canasta-basica",
      destination: "Precios e ingresos",
    },
    {
      id: "real-wages",
      label: "Salario real, interanual",
      value: wages?.realYearly != null ? formatChange(wages.realYearly) : null,
      period:
        indec.wages && wages?.realYearly != null
          ? formatIndecPeriod(indec.wages.period)
          : null,
      href: "/precios#salarios",
      destination: "Precios e ingresos",
    },
    indicatorFigure("country-risk", results, "Dólar"),
  ];
};

const FIGURE_COUNT = 4;

const frameClassName = "stack-2 border border-base-700 bg-surface-950 p-5";

interface KeyFiguresProps {
  /** Both omitted while loading. */
  indicators?: IndicatorResult[];
  indec?: IndecData;
}

/** A row of headline figures from the other pages; each opens its page at the full card or table. */
export const KeyFigures = ({ indicators, indec }: KeyFiguresProps) => {
  const loading = indicators === undefined || indec === undefined;

  return (
    <section
      className="stack-4"
      aria-labelledby="key-figures-title"
      aria-busy={loading || undefined}
    >
      <h2
        id="key-figures-title"
        className="font-heading text-headline-md text-text-100"
      >
        Cifras clave
      </h2>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: FIGURE_COUNT }, (_, index) => (
              <li key={index} className={frameClassName} aria-hidden="true">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-32" />
              </li>
            ))
          : figuresOf(indicators, indec).map((figure) => (
              <li key={figure.id}>
                <Link
                  to={figure.href}
                  aria-label={`${figure.label}: ${figure.value ?? "sin datos"}. Ver en ${figure.destination}`}
                  className={`${frameClassName} block h-full transition-colors duration-200 hover:border-primary-500/50 focus-visible:border-primary-500/50 focus-visible:bg-surface-900/80 focus-visible:outline-none`}
                >
                  <span className="block font-mono text-label-caps text-text-200 uppercase">
                    {figure.label}
                  </span>
                  <span className="block font-mono text-data-display text-text-100">
                    {figure.value ?? "s/d"}
                  </span>
                  <span className="block font-mono text-data-label text-text-400 first-letter:uppercase">
                    {figure.period ?? "No disponible en este momento"}
                  </span>
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
};
