export type SearchEntityKind =
  | "exchange-rate"
  | "equity-panel"
  | "rates-panel"
  | "indicator"
  | "news"
  | "tracked-asset";

export interface SearchTarget {
  pathname: string;
  /** Shareable selection state belongs in the URL once the destination exists. */
  searchParams?: Readonly<Record<string, string>>;
  /** The id of the element to reveal, carried as the URL hash from any page, the current one included; the terminal shell scrolls to it and the element highlights itself. */
  hash?: string;
}

/** Where a selected result navigates; `replace` avoids a duplicate history entry when the URL is already the destination's. */
export interface SearchDestination {
  pathname: string;
  search: string;
  hash: string;
  replace: boolean;
}

/** The current URL's query is kept on its own page, so a result there changes only what it names. */
export function searchDestination(
  target: SearchTarget,
  current: { pathname: string; search: string; hash: string },
): SearchDestination {
  const samePage = current.pathname === target.pathname;
  const params = new URLSearchParams(samePage ? current.search : "");

  for (const [key, value] of Object.entries(target.searchParams ?? {}))
    params.set(key, value);

  const query = params.toString();
  const search = query ? `?${query}` : "";
  const hash = target.hash ? `#${target.hash}` : "";

  return {
    pathname: target.pathname,
    search,
    hash,
    replace: samePage && search === current.search && hash === current.hash,
  };
}

/** Only entities with a working destination belong in the active search index. */
export interface SearchEntity<
  Kind extends SearchEntityKind = SearchEntityKind,
> {
  kind: Kind;
  id: string;
  title: string;
  aliases: readonly string[];
  target: SearchTarget;
}

export function searchEntityKey(entity: SearchEntity): string {
  return `${entity.kind}:${entity.id}`;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-AR")
    .trim();

export function searchEntities<Entity extends SearchEntity>(
  query: string,
  entities: readonly Entity[],
): Entity[] {
  const term = normalize(query);
  if (!term) return [];

  return entities.filter(({ title, aliases }) =>
    [title, ...aliases].some((value) => normalize(value).includes(term)),
  );
}
