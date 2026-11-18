import type { RecipeSummary } from '../types/recipe';
import { orderWithFavoritesFirst } from '../utils/pickerRanking';

// Without duplicates by id: the first occurrence wins
export function uniquePickerRecipes(recipes: RecipeSummary[]): RecipeSummary[] {
  const seen = new Set<string>();
  return recipes.filter(r => {
    if (!r || !r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

interface SortedPickerCache {
  recipes: RecipeSummary[];
  favoriteIds: ReadonlySet<string>;
  collator: Intl.Collator;
  result: RecipeSummary[];
}

// Last result: the key is the identity of the recipes array and of the favorites Set
let sortedCache: SortedPickerCache | null = null;

/**
 * Meal picker recipes with an empty query: without duplicates, favorites first, then alphabetical.
 * The result is memoized and returned again until recipes and favorites change identity.
 */
export function getSortedPickerRecipes(
  recipes: RecipeSummary[],
  favoriteIds: ReadonlySet<string>,
  collator: Intl.Collator
): RecipeSummary[] {
  if (
    sortedCache &&
    sortedCache.recipes === recipes &&
    sortedCache.favoriteIds === favoriteIds &&
    sortedCache.collator === collator
  ) {
    return sortedCache.result;
  }
  const result = orderWithFavoritesFirst(uniquePickerRecipes(recipes), favoriteIds, collator);
  sortedCache = { recipes, favoriteIds, collator, result };
  return result;
}
