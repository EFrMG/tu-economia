import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useFetcher } from "react-router";

import { money } from "~/components/features/FinanceFields";
import { Button } from "~/components/ui/Button";
import { fieldFocusClassName } from "~/components/ui/input-styles";
import { Skeleton } from "~/components/ui/Skeleton";
import { UnavailableStatus } from "~/components/ui/UnavailableNotice";
import { withUnavailablePreview } from "~/lib/data-preview";
import { useDataPreview } from "~/lib/use-data-preview";
import {
  BASKET_CATEGORIES,
  BASKET_SECTIONS,
  MAX_PRICE_FAVORITES,
  PRICE_LOCATIONS,
  PRICE_SEARCH_INDEX_URL,
  PRICE_SOURCE_DATE,
  basketItem,
  basketItemId,
  defaultPricePreferences,
  loadPricePreferences,
  locationById,
  locationByLabel,
  prepareCatalog,
  savePricePreferences,
  searchCatalog,
  type CatalogProduct,
  type ChainPrice,
  type PriceCatalog,
  type PricePreferences,
  type PriceProduct,
  type PricesResponse,
} from "~/lib/prices";

const MIN_QUERY_LENGTH = 2;

const pesos = (value: number) => money(Math.round(value * 100));

const sourceDateLabel = PRICE_SOURCE_DATE.split("-").reverse().join("/");

const inputClassName = `border-base-700 bg-surface-900 text-text-100 text-body-sm w-full border px-3 py-2.5 ${fieldFocusClassName}`;

const labelClassName = "font-mono text-data-label text-text-200 uppercase";

const footerLinkClassName =
  "text-primary-text-100 hocus:underline w-fit underline-offset-4 focus-visible:outline-none";

/** What the headline price means, known before it loads so the slot never changes. */
const priceCaption = (id: string) => {
  const item = basketItem(id);

  if (item?.kind === "fresh") return `Por ${item.unit ?? "kg"}, precio típico`;
  if (item?.kind === "group") return `Por ${item.unit ?? "unidad"}`;

  return "Por unidad";
};

/** One line under the price: where it is cheapest and how far the others go. */
const chainSummary = (chains: ChainPrice[]) => {
  const [best] = chains;
  const highest = chains.at(-1)!;

  return chains.length > 1
    ? `${best.chain} · hasta ${pesos(highest.price)} en ${chains.length} cadenas`
    : best.chain;
};

interface PriceRowProps {
  product: PriceProduct;
  /** Undefined while the price is loading; null chains when it could not be read. */
  chains: ChainPrice[] | null | undefined;
  /** True when the live request failed and the prices come from the SEPA archive of `sourceDateLabel`. Fresh food always does, and says so in its caption. */
  archived: boolean;
  /** Grows open on insertion; only for items added on this visit, so saved ones do not animate on load. */
  entering: boolean;
  leaving: boolean;
  onRemove: () => void;
}

/** How long a row takes to open or collapse; removal waits this long before the item leaves the list. */
const ROW_MOTION_MS = 200;

/**
 * Each line keeps its two-line price block in every state, so loading and failure never move the list.
 * Rows open and collapse through their grid track, so whatever sits below slides instead of jumping.
 */
const PriceRow = ({
  product,
  chains,
  archived,
  entering,
  leaving,
  onRemove,
}: PriceRowProps) => (
  <li
    className={`grid max-w-none motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-200 motion-safe:ease-out ${leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"} ${entering ? "starting:grid-rows-[0fr] starting:opacity-0" : ""}`}
    inert={leaving}
  >
    <div className="min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 py-3 pr-2 pl-4">
        <div className="grid min-w-0 flex-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_20rem] sm:items-center">
          <div className="stack-1 min-w-0">
            <h3 className="text-body-lg wrap-break-word text-text-100">
              {product.name}
            </h3>
            <p className="font-mono text-label-caps text-text-400 uppercase">
              {priceCaption(product.id)}
              {archived ? (
                <span className="text-tertiary-text-400">
                  {" "}
                  · Referencia SEPA {sourceDateLabel}
                </span>
              ) : null}
            </p>
          </div>

          <div className="stack-1 min-w-0 sm:text-right">
            {chains === undefined ? (
              <>
                <Skeleton className="h-6 w-28 sm:ml-auto" />
                <Skeleton className="h-5 w-44 sm:ml-auto" />
              </>
            ) : chains?.length ? (
              <>
                <span className="block font-mono text-data-display text-text-100">
                  {pesos(chains[0].price)}
                </span>
                <span
                  className="block truncate text-body-sm leading-5 text-text-400"
                  title={chainSummary(chains)}
                >
                  {chainSummary(chains)}
                </span>
              </>
            ) : (
              <>
                <span className="block font-mono text-data-display text-text-400">
                  s/d
                </span>
                <UnavailableStatus className="block truncate leading-5">
                  {chains === null
                    ? "No disponible en este momento"
                    : "Sin precios cerca de esta ubicación"}
                </UnavailableStatus>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${product.name}`}
          className="flex size-10 shrink-0 items-center justify-center font-mono text-body-lg text-text-400 focus-visible:outline-none hocus:bg-surface-900/80 hocus:text-text-100"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  </li>
);

interface ToggleControlsProps {
  favoriteIds: Set<string>;
  onToggle: (product: PriceProduct) => void;
}

/** The trailing state of a toggleable product: added, addable, or blocked by the limit. */
const ToggleLabel = ({ added, full }: { added: boolean; full: boolean }) => (
  <span
    className={`shrink-0 font-mono text-label-caps uppercase ${added ? "text-primary-text-100" : full ? "text-text-400" : "text-text-200"}`}
  >
    {added ? "✓ Agregado" : full ? "Límite" : "+ Agregar"}
  </span>
);

/** Undefined until the first search, null while the index downloads, "failed" if it could not be read. */
type CatalogState = CatalogProduct[] | null | undefined | "failed";

const popoverClassName =
  "bg-overlay-950 border-base-700 absolute inset-x-0 top-full z-40 mt-1 border";

const SearchField = ({ favoriteIds, onToggle }: ToggleControlsProps) => {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogState>(undefined);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();

  const full = favoriteIds.size >= MAX_PRICE_FAVORITES;
  const text = query.trim();
  const hasQuery = text.length >= MIN_QUERY_LENGTH;

  // The index is a static file of a few hundred kilobytes, downloaded only when the visitor starts a search.
  const loadCatalog = () => {
    if (catalog !== undefined && catalog !== "failed") return;

    setCatalog(null);

    fetch(PRICE_SEARCH_INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));

        return response.json() as Promise<PriceCatalog>;
      })
      .then((index) => {
        if (!Array.isArray(index?.products))
          throw new Error("Índice inválido.");

        setCatalog(prepareCatalog(index));
      })
      .catch(() => setCatalog("failed"));
  };

  const matches =
    Array.isArray(catalog) && hasQuery ? searchCatalog(catalog, text) : [];

  const expanded = open && matches.length > 0;

  const toggle = (match: CatalogProduct) =>
    onToggle({ id: match.id, name: match.name });

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);

      return;
    }

    if (!matches.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (open ? (index + 1) % matches.length : 0));
      setOpen(true);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveIndex((index) =>
        open
          ? (index - 1 + matches.length) % matches.length
          : matches.length - 1,
      );

      setOpen(true);
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();
      toggle(matches[activeIndex] ?? matches[0]);
    }
  };

  // Every search state floats over the page, so typing never moves the content below.
  const status =
    catalog === null || catalog === undefined ? (
      <span className="text-text-300">Cargando productos…</span>
    ) : catalog === "failed" ? (
      <UnavailableStatus>
        La búsqueda no está disponible en este momento.
      </UnavailableStatus>
    ) : (
      <>
        No encontramos productos para «{text}». La búsqueda incluye los
        envasados que venden al menos cinco cadenas; los frescos están en la
        canasta de referencia.
      </>
    );

  return (
    <div className="stack-2" role="search">
      <label htmlFor="price-search" className={labelClassName}>
        Agregar un producto
      </label>
      <div className="relative">
        <input
          id="price-search"
          type="search"
          value={query}
          onFocus={() => {
            loadCatalog();
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
            loadCatalog();
          }}
          onKeyDown={onKeyDown}
          placeholder="Por ejemplo: yerba, aceite Cocinero"
          autoComplete="off"
          maxLength={60}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listboxId : undefined}
          aria-activedescendant={
            expanded ? `${listboxId}-${activeIndex}` : undefined
          }
          className={inputClassName}
        />

        {open && hasQuery ? (
          matches.length ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label={`Productos para ${text}`}
              className={`${popoverClassName} max-h-80 overflow-y-auto p-1`}
            >
              {matches.map((match, index) => {
                const added = favoriteIds.has(match.id);

                return (
                  <div
                    key={match.id}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    aria-disabled={!added && full}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggle(match)}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${index === activeIndex ? "bg-surface-900" : ""} ${!added && full ? "cursor-not-allowed" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="text-body-sm wrap-break-word text-text-100">
                        {match.name}
                      </p>
                      <p className="mt-1 font-mono text-data-label text-text-400">
                        {[match.brand, match.size]
                          .filter(Boolean)
                          .join(" · ") || "s/d"}
                      </p>
                    </div>
                    <ToggleLabel added={added} full={full} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p
              className={`${popoverClassName} px-3 py-2 text-body-sm text-text-300`}
              role="status"
            >
              {status}
            </p>
          )
        ) : null}
      </div>
    </div>
  );
};

/** The curated basket, grouped by section; groups and fresh food are only reachable from here. Each line toggles its item. */
const BasketPicker = ({ favoriteIds, onToggle }: ToggleControlsProps) => {
  const full = favoriteIds.size >= MAX_PRICE_FAVORITES;

  return (
    <details className="border border-base-700 bg-surface-950">
      <summary className="cursor-pointer px-4 py-3 font-mono text-label-caps text-text-200 uppercase focus-visible:outline-none hocus:text-text-100">
        Canasta de referencia
      </summary>
      <div className="stack-6 border-t border-base-700 p-4">
        {BASKET_SECTIONS.map((section) => (
          <section key={section} className="stack-2" aria-label={section}>
            <h3 className={labelClassName}>{section}</h3>
            <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
              {BASKET_CATEGORIES.filter(
                (category) => category.section === section,
              ).map((category) => {
                const id = basketItemId(category);
                const added = favoriteIds.has(id);

                return (
                  <li key={category.id}>
                    <button
                      type="button"
                      aria-pressed={added}
                      disabled={!added && full}
                      onClick={() => onToggle({ id, name: category.name })}
                      className="flex w-full items-center justify-between gap-3 px-2 py-2 text-left focus-visible:outline-none disabled:cursor-not-allowed hocus:bg-surface-900/80"
                    >
                      <span
                        className={`min-w-0 text-body-sm wrap-break-word ${added ? "text-text-100" : "text-text-300"}`}
                      >
                        {category.name}
                        {category.unit ? (
                          <span className="text-text-400">
                            {" "}
                            · por {category.unit}
                          </span>
                        ) : null}
                      </span>
                      <ToggleLabel added={added} full={full} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
};

export const FinancePricesTab = () => {
  const pricesFetcher = useFetcher<PricesResponse>();
  const previewUnavailable = useDataPreview();
  const [preferences, setPreferences] = useState<PricePreferences | null>(null);
  const [locationDraft, setLocationDraft] = useState("");
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(new Set());
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(new Set());
  const [pricesAttempted, setPricesAttempted] = useState(false);

  const location = preferences ? locationById(preferences.locationId) : null;
  const idsKey = preferences?.products.map((product) => product.id).join(",");

  const favoriteIds = new Set(
    preferences?.products.map((product) => product.id),
  );

  // Prices already read for this location stay on screen while a request runs, so only items without one show a placeholder.
  const loaded =
    preferences && pricesFetcher.data?.location === preferences.locationId
      ? pricesFetcher.data.products
      : [];

  // Storage is read after mount so the server and first client render agree.
  useEffect(() => {
    const saved = loadPricePreferences();

    setPreferences(saved);
    setLocationDraft(locationById(saved.locationId)?.label ?? "");
  }, []);

  /** A finished request with no prices for the current location is a failure, not a pending row. */
  const pricesUnavailable =
    pricesAttempted &&
    pricesFetcher.state === "idle" &&
    pricesFetcher.data?.location !== preferences?.locationId;

  useEffect(() => {
    if (!preferences || !idsKey) return;

    // Removing an item leaves every remaining one priced, so no request is needed.
    const covered = preferences.products.every((product) =>
      loaded.some((result) => result.id === product.id),
    );

    if (covered) return;

    setPricesAttempted(true);

    pricesFetcher.load(
      withUnavailablePreview(
        `/resources/prices?${new URLSearchParams({ location: preferences.locationId, ids: idsKey })}`,
        previewUnavailable,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reruns only when the location, product set or preview flag changes; listing `loaded` would resend the request on every render while one is in flight.
  }, [preferences?.locationId, idsKey, previewUnavailable]);

  const update = (next: PricePreferences) => {
    setPreferences(next);
    savePricePreferences(next);
  };

  const chooseLocation = (value: string) => {
    setLocationDraft(value);

    const match = locationByLabel(value);

    if (match && preferences && match.id !== preferences.locationId)
      update({ ...preferences, locationId: match.id });
  };

  // The row collapses first and the item leaves the saved list once it has closed; reduced motion removes it at once.
  const removeProduct = (id: string) => {
    if (!preferences || leavingIds.has(id)) return;

    const commit = () => {
      setLeavingIds((ids) => new Set([...ids].filter((item) => item !== id)));

      setPreferences((current) => {
        if (!current) return current;

        const next = {
          ...current,
          products: current.products.filter((product) => product.id !== id),
        };

        savePricePreferences(next);

        return next;
      });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit();

      return;
    }

    setLeavingIds((ids) => new Set(ids).add(id));
    window.setTimeout(commit, ROW_MOTION_MS);
  };

  const toggleProduct = (product: PriceProduct) => {
    if (!preferences) return;

    if (favoriteIds.has(product.id)) {
      removeProduct(product.id);

      return;
    }

    if (preferences.products.length >= MAX_PRICE_FAVORITES) return;

    setAddedIds((ids) => new Set(ids).add(product.id));
    update({ ...preferences, products: [...preferences.products, product] });
  };

  const products = preferences?.products ?? defaultPricePreferences().products;

  return (
    <section aria-labelledby="prices-title" className="stack-10">
      <div className="stack-2">
        <h2
          id="prices-title"
          className="font-heading text-headline-md text-text-100"
        >
          Precios de consumo
        </h2>
        <p className="max-w-2xl text-body-sm text-text-300">
          Una referencia de lo que cuestan los productos habituales en las
          cadenas cercanas. Sus productos y su ubicación se guardan solo en este
          dispositivo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="stack-2">
          <label htmlFor="price-location" className={labelClassName}>
            Ubicación
          </label>
          <input
            id="price-location"
            list="price-locations"
            value={locationDraft}
            onChange={(event) => chooseLocation(event.target.value)}
            onBlur={() => setLocationDraft(location?.label ?? "")}
            onFocus={(event) => event.target.select()}
            autoComplete="off"
            disabled={!preferences}
            className={inputClassName}
          />
          <datalist id="price-locations">
            {PRICE_LOCATIONS.map((item) => (
              <option key={item.id} value={item.label} />
            ))}
          </datalist>
        </div>

        <SearchField favoriteIds={favoriteIds} onToggle={toggleProduct} />
      </div>

      <div className="mx-auto stack-2 w-full max-w-3xl">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={labelClassName}>Sus productos</h3>
          <span className="font-mono text-data-label text-text-400">
            {favoriteIds.size >= MAX_PRICE_FAVORITES
              ? `${MAX_PRICE_FAVORITES} de ${MAX_PRICE_FAVORITES}, quite uno para agregar otro`
              : `${products.length} de ${MAX_PRICE_FAVORITES}`}
          </span>
        </div>

        {preferences && !preferences.products.length ? (
          <div className="stack-4 border border-base-700 bg-surface-950 p-4">
            <p className="text-body-sm text-text-300">
              No tiene productos guardados. Busque uno, elija de la canasta de
              referencia o restaure los sugeridos.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() =>
                update({
                  ...preferences,
                  products: defaultPricePreferences().products,
                })
              }
            >
              Restaurar sugeridos
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-base-700 border border-base-700 bg-surface-950">
            {products.map((product) => (
              <PriceRow
                key={product.id}
                product={product}
                chains={
                  pricesUnavailable
                    ? null
                    : loaded.find((result) => result.id === product.id)?.chains
                }
                archived={
                  !pricesUnavailable &&
                  basketItem(product.id)?.kind !== "fresh" &&
                  Boolean(
                    loaded.find((result) => result.id === product.id)?.snapshot,
                  )
                }
                entering={addedIds.has(product.id)}
                leaving={leavingIds.has(product.id)}
                onRemove={() => removeProduct(product.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {preferences ? (
        <BasketPicker favoriteIds={favoriteIds} onToggle={toggleProduct} />
      ) : null}

      <footer className="stack-2 border-t border-base-700 pt-4 text-center text-body-sm text-text-400">
        <p className="mx-auto">
          Fuente: SEPA, Subsecretaría de Defensa del Consumidor y Lealtad
          Comercial, bajo licencia CC BY 4.0. Catálogo y canasta de referencia
          procesados por Tu Economía con datos del {sourceDateLabel}.
        </p>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <a
            href="https://datos.produccion.gob.ar/dataset/sepa-precios"
            target="_blank"
            rel="noopener noreferrer"
            className={footerLinkClassName}
          >
            Datos SEPA ↗
          </a>
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.es"
            target="_blank"
            rel="noopener noreferrer"
            className={footerLinkClassName}
          >
            Licencia CC BY 4.0 ↗
          </a>
          <a
            href="https://www.preciosclaros.gob.ar/"
            target="_blank"
            rel="noopener noreferrer"
            className={footerLinkClassName}
          >
            Precios Claros ↗
          </a>
        </div>
      </footer>
    </section>
  );
};
