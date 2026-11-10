export type SearchEntityKind =
  "exchange-rate" | "equity-panel" | "indicator" | "news" | "tracked-asset";

export interface SearchTarget {
  pathname: string;
  /** Shareable selection state belongs in the URL once the destination exists. */
  searchParams?: Readonly<Record<string, string>>;
  /** An existing element to reveal when the destination is already open. */
  focusId?: string;
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
