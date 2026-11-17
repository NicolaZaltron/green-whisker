import type { Ingredient } from '../types/catalog';

/**
 * Returns the display name for an ingredient, using the i18n translations.
 * If the ingredient has an id, looks up the translation; otherwise falls back to the Italian name.
 *
 * @param ingredient - The ingredient to display
 * @param t - Translation function from react-i18next
 * @param count - Optional counter for the plural (1 = singular, others = plural)
 * @returns The name displayed in the current language
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
 * Returns the display name for an ingredient, using the i18n translations.
 * Plural version (for lists or contexts where the number is not specified).
 *
 * @param ingredient - The ingredient to display
 * @param t - Translation function from react-i18next
 * @returns The plural name displayed in the current language
 */
export function ingredientDisplayNamePlural(
  ingredient: Ingredient,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return ingredientDisplayName(ingredient, t, 2);
}
