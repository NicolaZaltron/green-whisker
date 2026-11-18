// Order of the recipe lists: alphabetical by title, creation date or last change date, ascending or descending.
export type RecipeSortKey = 'alpha' | 'created' | 'updated';
export type SortDirection = 'asc' | 'desc';

export interface RecipeSort {
  key: RecipeSortKey;
  direction: SortDirection;
}

export const DEFAULT_RECIPE_SORT: RecipeSort = { key: 'alpha', direction: 'asc' };

const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

interface Sortable {
  title: string;
  created_at?: number;
  updated_at?: number;
}

/** A new array in the requested order. Ties are broken by title, so the order is stable. */
export function sortRecipes<T extends Sortable>(list: readonly T[], sort: RecipeSort): T[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const byTitle = (a: T, b: T) => collator.compare(a.title, b.title);
  const byDate = (field: 'created_at' | 'updated_at') => (a: T, b: T) => {
    const diff = (a[field] ?? 0) - (b[field] ?? 0);
    return diff !== 0 ? diff : byTitle(a, b);
  };
  const compare = sort.key === 'alpha' ? byTitle : byDate(sort.key === 'created' ? 'created_at' : 'updated_at');
  return [...list].sort((a, b) => sign * compare(a, b));
}
