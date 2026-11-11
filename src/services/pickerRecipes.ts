import type { Recipe } from '../types/recipe';
import { orderWithFavoritesFirst } from '../utils/pickerRanking';

// Senza duplicati per id: vince la prima occorrenza
export function uniquePickerRecipes(recipes: Recipe[]): Recipe[] {
  const seen = new Set<string>();
  return recipes.filter(r => {
    if (!r || !r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

interface SortedPickerCache {
  recipes: Recipe[];
  favoriteIds: ReadonlySet<string>;
  result: Recipe[];
}

// Ultimo risultato: la chiave è l'identità dell'array ricette e del Set dei preferiti
let sortedCache: SortedPickerCache | null = null;

/**
 * Ricette del selettore pasti con query vuota: senza duplicati, preferite prima, poi alfabetico.
 * Il risultato è memorizzato e restituito di nuovo finché ricette e preferiti non cambiano identità.
 */
export function getSortedPickerRecipes(
  recipes: Recipe[],
  favoriteIds: ReadonlySet<string>
): Recipe[] {
  if (sortedCache && sortedCache.recipes === recipes && sortedCache.favoriteIds === favoriteIds) {
    return sortedCache.result;
  }
  const result = orderWithFavoritesFirst(uniquePickerRecipes(recipes), favoriteIds);
  sortedCache = { recipes, favoriteIds, result };
  return result;
}
