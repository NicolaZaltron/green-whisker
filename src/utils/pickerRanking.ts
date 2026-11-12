export type PickerMatchKind = 'ingredient' | 'ready' | 'recipe' | 'out';

// Collator di default (italiano). Il chiamante passa quello della lingua dell'app: va creato una volta sola, non a ogni confronto
export const DEFAULT_PICKER_COLLATOR = new Intl.Collator('it', { sensitivity: 'base' });

export interface PickerMatchItem<T> {
  kind: PickerMatchKind;
  label: string;
  value: T;
  // Id della ricetta (solo kind 'recipe'), usato per il confronto con i preferiti
  id?: string;
}

// Ordine dei gruppi: prima i match che iniziano con la query, poi quelli che la contengono
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
 * Ordina i risultati della scheda "Tutti" del selettore pasti.
 * Query vuota: restituisce gli elementi nell'ordine ricevuto.
 * Query non vuota: solo gli elementi che contengono la query (case-insensitive),
 * raggruppati per tipo e per inizio/contenimento, ordinati alfabeticamente in ogni gruppo.
 * Con favoriteIds: dentro ogni gruppo, le ricette preferite vengono prima delle altre.
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
 * Ordine con query vuota: le ricette preferite prima, poi le altre; in ogni parte alfabetico.
 * Non scarta nessun elemento.
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
