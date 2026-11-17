import { normalizeIngredientKey } from './ingredientAggregator';

// Approximate densities (grams per milliliter) to convert volume and weight.
// They are rounded standard values: they serve to merge shopping quantities, not for precise recipes.
// Ingredients not in the table keep their units (no conversion between weight and volume).
export const INGREDIENT_DENSITY: { keyword: string; gPerMl: number }[] = [
  { keyword: 'acqua', gPerMl: 1 },
  { keyword: 'latte', gPerMl: 1.03 },
  { keyword: 'panna', gPerMl: 1 },
  { keyword: 'yogurt', gPerMl: 1.03 },
  { keyword: 'olio', gPerMl: 0.92 },
  { keyword: 'burro', gPerMl: 0.91 },
  { keyword: 'miele', gPerMl: 1.4 },
  { keyword: 'farina', gPerMl: 0.55 },
  { keyword: 'zucchero', gPerMl: 0.85 },
  { keyword: 'sale', gPerMl: 1.2 },
  { keyword: 'cannella', gPerMl: 0.5 },
  { keyword: 'cacao', gPerMl: 0.5 },
  { keyword: 'curcuma', gPerMl: 0.6 },
  { keyword: 'curry', gPerMl: 0.5 },
  { keyword: 'paprika', gPerMl: 0.5 },
  { keyword: 'origano', gPerMl: 0.3 },
  { keyword: 'prezzemolo', gPerMl: 0.3 },
  { keyword: 'basilico', gPerMl: 0.3 },
  { keyword: 'lievito', gPerMl: 0.8 },
  { keyword: 'riso', gPerMl: 0.8 },
  { keyword: 'pasta', gPerMl: 0.5 },
  { keyword: 'avena', gPerMl: 0.4 },
  { keyword: 'cereali', gPerMl: 0.2 },
  { keyword: 'cereali soffiati', gPerMl: 0.1 },
  { keyword: 'lenticchie', gPerMl: 0.8 },
  { keyword: 'ceci', gPerMl: 0.8 },
  { keyword: 'fagioli', gPerMl: 0.8 },
  { keyword: 'semi', gPerMl: 0.6 },
  { keyword: 'mandorle', gPerMl: 0.55 },
  { keyword: 'noci', gPerMl: 0.5 },
  { keyword: 'uvetta', gPerMl: 0.6 },
];

// A pinch weighs about half a gram, for any ingredient (approximation)
export const PINCH_GRAMS = 0.5;

// Ingredient keys are stemmed ("cacao amaro" -> "caca amar"): the keywords must be stemmed too
const STEMMED_DENSITY = INGREDIENT_DENSITY
  .map(entry => ({ keyword: normalizeIngredientKey(entry.keyword), gPerMl: entry.gPerMl }))
  .sort((a, b) => b.keyword.length - a.keyword.length);

export function densityFor(ingredientKey: string): number | null {
  const key = ingredientKey.trim().toLowerCase();
  // Longest match first, so "cereali soffiati" wins over "cereali"
  for (const entry of STEMMED_DENSITY) {
    if (key.includes(entry.keyword)) return entry.gPerMl;
  }
  return null;
}
