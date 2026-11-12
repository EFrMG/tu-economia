import { useId, useMemo, useState, type KeyboardEvent, type Ref } from "react";
import {
  MdOutlineMenu,
  MdOutlineRefresh,
  MdOutlineSearch,
} from "react-icons/md";
import { Link, useLocation, useNavigate } from "react-router";
import { equityPanelSearchResults } from "~/lib/equity-search";
import { EXCHANGE_RATE_SEARCH_RESULTS } from "~/lib/exchange-rate-search";
import { INDICATOR_SEARCH_RESULTS } from "~/lib/indicator-search";
import { RATES_PANEL_SEARCH_RESULTS } from "~/lib/rates-search";
import {
  searchEntities,
  searchEntityKey,
  type SearchEntity,
} from "~/lib/search-entities";
import { Wordmark } from "~/components/ui/Wordmark";
import { fieldFocusClassName } from "~/components/ui/input-styles";

/** Quotations first, so a term that matches both keeps the rate cards on top; the Acciones panels follow the BYMA flag. */
function searchIndex(equitiesBymaEnabled: boolean): readonly SearchEntity[] {
  return [
    ...EXCHANGE_RATE_SEARCH_RESULTS,
    ...equityPanelSearchResults(equitiesBymaEnabled),
    ...RATES_PANEL_SEARCH_RESULTS,
    ...INDICATOR_SEARCH_RESULTS,
  ];
}

interface TopBarProps {
  onOpenNav: () => void;
  navTriggerRef: Ref<HTMLButtonElement>;
  onRefresh: () => void;
  isRefreshing: boolean;
  /** A route transition or data refresh is in flight; surfaced as a scan line. */
  isLoading?: boolean;
  /** `EQUITIES_BYMA_ENABLED` from the layout loader; the BYMA panels are searchable only while it is on. */
  equitiesBymaEnabled: boolean;
}

const TopBar = ({
  onOpenNav,
  navTriggerRef,
  onRefresh,
  isRefreshing,
  isLoading = false,
  equitiesBymaEnabled,
}: TopBarProps) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();
  const listboxId = useId();

  const index = useMemo(
    () => searchIndex(equitiesBymaEnabled),
    [equitiesBymaEnabled],
  );

  const results = searchEntities(query, index);
  const hasQuery = query.trim().length > 0;

  const selectResult = (result: SearchEntity) => {
    const { pathname, searchParams, focusId, hash } = result.target;
    const currentParams = new URLSearchParams(location.search);

    const params =
      location.pathname === pathname
        ? new URLSearchParams(location.search)
        : new URLSearchParams();

    for (const [key, value] of Object.entries(searchParams ?? {}))
      params.set(key, value);

    setQuery("");
    setOpen(false);
    setActiveIndex(0);

    if (
      location.pathname === pathname &&
      focusId &&
      Object.entries(searchParams ?? {}).every(
        ([key, value]) => currentParams.get(key) === value,
      )
    ) {
      const target = document.getElementById(focusId);
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });

      return;
    }

    const search = params.toString();
    navigate({
      pathname,
      search: search ? `?${search}` : "",
      hash: hash ? `#${hash}` : "",
    });
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);

      return;
    }

    if (!results.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (open ? (index + 1) % results.length : 0));
      setOpen(true);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveIndex((index) =>
        open
          ? (index - 1 + results.length) % results.length
          : results.length - 1,
      );

      setOpen(true);
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();
      selectResult(results[activeIndex] ?? results[0]);
    }
  };

  return (
    <header className="relative z-30 flex w-full items-center justify-between gap-3 border-b border-base-700 bg-base-950 px-4 py-4 md:px-8">
      <div className="flex items-center gap-4">
        <button
          ref={navTriggerRef}
          type="button"
          onClick={onOpenNav}
          className="text-text-200 transition-colors focus-visible:outline-none md:hidden hocus:text-primary-text-100"
          aria-label="Abrir navegación"
        >
          <MdOutlineMenu className="text-2xl" aria-hidden="true" />
        </button>
        <Link to="/" className="hidden compact:block md:hidden">
          <Wordmark />
        </Link>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label={
            isRefreshing
              ? "Actualizando datos de esta página"
              : "Actualizar datos de esta página"
          }
          aria-busy={isRefreshing}
          className="btn-click-soft flex h-9 shrink-0 items-center gap-2 border border-base-700 px-2.5 text-text-200 transition-colors focus-visible:outline-none disabled:cursor-wait disabled:opacity-50 hocus:border-primary-500/50 hocus:text-primary-text-100"
        >
          <MdOutlineRefresh className="text-lg" aria-hidden="true" />
          <span className="hidden font-mono text-data-label lg:inline">
            {isRefreshing ? "Actualizando…" : "Actualizar"}
          </span>
        </button>
      </div>

      <div className="flex flex-1 items-center justify-end gap-4 sm:flex-none">
        <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <MdOutlineSearch
            className="absolute top-1/2 left-3 -translate-y-1/2 text-lg text-text-200"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={onSearchKeyDown}
            placeholder="Buscar cotización..."
            aria-label="Buscar cotización"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && results.length > 0}
            aria-controls={open && results.length ? listboxId : undefined}
            aria-activedescendant={
              open && results.length ? `${listboxId}-${activeIndex}` : undefined
            }
            className={`w-full border border-base-700 bg-surface-900 py-1.5 pr-3 pl-9 font-mono text-data-label text-text-100 placeholder:text-text-200 ${fieldFocusClassName}`}
          />
          {open &&
            hasQuery &&
            (results.length ? (
              <div
                id={listboxId}
                role="listbox"
                aria-label="Resultados de cotizaciones"
                className="absolute inset-x-0 top-full z-40 mt-1 border border-base-700 bg-overlay-950 p-1"
              >
                {results.map((result, index) => (
                  <div
                    key={searchEntityKey(result)}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectResult(result)}
                    className={`cursor-pointer px-3 py-2 font-mono text-data-label ${index === activeIndex ? "bg-primary-900 text-primary-text-100" : "text-text-300 hocus:bg-surface-900/80 hocus:text-text-100"}`}
                  >
                    {result.title}
                  </div>
                ))}
              </div>
            ) : (
              <p
                className="absolute inset-x-0 top-full z-40 mt-1 border border-base-700 bg-overlay-950 px-3 py-2 text-body-sm text-text-200"
                role="status"
              >
                No hay cotizaciones que coincidan con la búsqueda.
              </p>
            ))}
        </div>
      </div>

      {isLoading && (
        <div
          className="absolute inset-x-0 -bottom-px h-px overflow-hidden"
          role="status"
          aria-label="Cargando datos"
        >
          <div className="h-full w-1/5 bg-primary-500 motion-safe:animate-scan" />
        </div>
      )}
    </header>
  );
};

export { TopBar };
