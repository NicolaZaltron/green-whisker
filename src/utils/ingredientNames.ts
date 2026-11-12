import type { Ingredient } from '../types/catalog';

/**
 * Restituisce il nome visualizzato per un ingrediente, usando le traduzioni i18n.
 * Se l'ingrediente ha un id, cerca la traduzione; altrimenti fa fallback sul nome italiano.
 *
 * @param ingredient - L'ingrediente da visualizzare
 * @param t - Funzione di traduzione da react-i18next
 * @param count - Contatore opzionale per il plurale (1 = singolare, altri = plurale)
 * @returns Il nome visualizzato nella lingua corrente
 */
export function ingredientDisplayName(
  ingredient: Ingredient,
  t: (key: string, options?: Record<string, unknown>) => string,
  count?: number,
): string {
  const id = ingredient.id;
  if (!id) return ingredient.name;

  const suffix = count !== undefined && count > 1 ? '_other' : '_one';
  const i18nKey = `ingredients.names.${id}${suffix}`;

  try {
    const translated = t(i18nKey, {
      count,
      defaultValue: ingredient.name,
    });
    return translated;
  } catch {
    return ingredient.name;
  }
}

/**
 * Restituisce il nome visualizzato per un ingrediente, usando le traduzioni i18n.
 * Versione plurale (per liste o contesti dove il numero non è specificato).
 *
 * @param ingredient - L'ingrediente da visualizzare
 * @param t - Funzione di traduzione da react-i18next
 * @returns Il nome visualizzato al plurale nella lingua corrente
 */
export function ingredientDisplayNamePlural(
  ingredient: Ingredient,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return ingredientDisplayName(ingredient, t, 2);
}
