export type PickerMatchKind = 'ingredient' | 'ready' | 'recipe' | 'out';

// Default collator (Italian). The caller passes the one for the app language: it must be created once, not on every comparison
export const DEFAULT_PICKER_COLLATOR = new Intl.Collator('it', { sensitivity: 'base' });

export interface PickerMatchItem<T> {
  kind: PickerMatchKind;
  label: string;
  value: T;
  // Recipe id (only kind 'recipe'), used for comparison with favorites
  id?: string;
}

// Group order: first the matches that start with the query, then those that contain it
const GROUP_ORDER: { kind: PickerMatchKind; startsWith: boolean }[] = [
  { kind: 'ingredient', startsWith: true },
  { kind: 'ready', startsWith: true },
  { kind: 'recipe', startsWith: true },
  { kind: 'out', startsWith: true },
  { kind: 'ingredient', startsWith: false },
  { kind: 'ready', startsWith: false },
  { kind: 'recipe', startsWith: false },
  { kind: 'out', startsWith: false },
];

/**
 * Sorts the results of the "All" tab of the meal picker.
 * Empty query: returns the items in the order received.
 * Non-empty query: only the items containing the query (case-insensitive),
 * grouped by type and by start/containment, sorted alphabetically within each group.
 * With favoriteIds: within each group, favorite recipes come before the others.
 */
export function rankPickerMatches<T>(
  items: PickerMatchItem<T>[],
  query: string,
  favoriteIds?: ReadonlySet<string>,
  collator: Intl.Collator = DEFAULT_PICKER_COLLATOR
): PickerMatchItem<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];

  const isFavorite = (item: PickerMatchItem<T>) =>
    !!favoriteIds && item.kind === 'recipe' && item.id !== undefined && favoriteIds.has(item.id);

  const compare = (a: PickerMatchItem<T>, b: PickerMatchItem<T>) => {
    if (favoriteIds) {
      const favA = isFavorite(a);
      const favB = isFavorite(b);
      if (favA !== favB) return favA ? -1 : 1;
    }
    return collator.compare(a.label, b.label);
  };

  const result: PickerMatchItem<T>[] = [];
  for (const group of GROUP_ORDER) {
    const members = items
      .filter(item => {
        if (item.kind !== group.kind) return false;
        const label = item.label.toLowerCase();
        if (!label.includes(q)) return false;
        return label.startsWith(q) === group.startsWith;
      })
      .sort(compare);
    result.push(...members);
  }
  return result;
}

/**
 * Order with an empty query: favorite recipes first, then the others; alphabetical in each part.
 * Does not discard any item.
 */
export function orderWithFavoritesFirst<T extends { id: string; title: string }>(
  recipes: T[],
  favoriteIds: ReadonlySet<string>,
  collator: Intl.Collator = DEFAULT_PICKER_COLLATOR
): T[] {
  const byTitle = (a: T, b: T) => collator.compare(a.title, b.title);
  const favorites = recipes.filter(r => favoriteIds.has(r.id)).sort(byTitle);
  const others = recipes.filter(r => !favoriteIds.has(r.id)).sort(byTitle);
  return [...favorites, ...others];
}
