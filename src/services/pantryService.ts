import { RecipeSummary } from '../types/recipe';
import { catalogRecipes } from './recipeCatalog';

export interface PantryMatchResult {
  recipe: RecipeSummary;
  percentage: number;
  matchedCount: number;
  requiredCount: number;
  missingCount: number;
  matched: string[];
  missing: string[];
}

export const POPULAR_PANTRY_ITEMS = [
  'Pomodori',
  'Zucchine',
  'Cipolla',
  'Patate',
  'Carote',
  'Zucca',
  'Ceci',
  'Lenticchie',
  'Fagioli',
  'Piselli',
  'Tofu',
  'Pasta',
  'Riso',
  'Farina',
  'Pangrattato',
  'Aglio',
  'Limone',
  'Basilico',
  'Funghi',
  'Spinaci',
  'Melanzane',
  'Latte vegetale',
  'Cioccolato',
  'Mandorle'
];

// Base condiments that normally everyone has at home
export const DEFAULT_STAPLES = ['sale', 'pepe', 'olio', 'acqua'];

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A single collator for the vocabulary: localeCompare recreates the comparison rules on every call (slow on Hermes)
const COLLATOR = new Intl.Collator('it');

export interface IngredientVocabularyItem {
  original: string;
  normalized: string;
}

/**
 * Suggestion vocabulary: the list of common ingredients plus the app's ingredient names.
 * Built once by the screen, so typing does not reread the catalog.
 */
export function buildIngredientVocabulary(ingredientNames: string[]): IngredientVocabularyItem[] {
  const set = new Set<string>();
  POPULAR_PANTRY_ITEMS.forEach(item => set.add(item));
  ingredientNames.forEach(name => {
    const clean = name.trim();
    if (clean) set.add(clean);
  });

  return Array.from(set)
    .sort(COLLATOR.compare)
    .map(item => ({ original: item, normalized: normalize(item) }));
}

/**
 * Returns ingredient autocomplete suggestions based on typed query with pre-normalized matching and early exit.
 */
export function getIngredientSuggestions(
  query: string,
  alreadySelected: string[],
  vocabulary: IngredientVocabularyItem[],
): string[] {
  const trimmed = normalize(query);
  if (!trimmed) return [];

  const selectedNorm = new Set(alreadySelected.map(normalize));
  const suggestions: string[] = [];

  for (let i = 0; i < vocabulary.length; i++) {
    const item = vocabulary[i];
    if (!selectedNorm.has(item.normalized) && item.normalized.includes(trimmed)) {
      suggestions.push(item.original);
      if (suggestions.length >= 8) {
        break;
      }
    }
  }

  return suggestions;
}

/**
 * Fridge cleanout matching algorithm:
 * Finds and sorts recipes based on the ingredients owned.
 */
export function searchPantryRecipes(
  userPantry: string[],
  assumeStaples: boolean = true
): PantryMatchResult[] {
  if (!userPantry || userPantry.length === 0) {
    return [];
  }

  const normalizedPantry = userPantry.map(normalize).filter(Boolean);
  if (normalizedPantry.length === 0) return [];

  const results: PantryMatchResult[] = [];

  for (const recipe of catalogRecipes) {
    let requiredCount = 0;
    let matchedCount = 0;
    const matched: string[] = [];
    const missing: string[] = [];

    const ingList = recipe.ingredients || [];
    for (const rawIng of ingList) {
      const normIng = normalize(rawIng);
      const isStaple = DEFAULT_STAPLES.some(s => normIng.includes(s));

      if (isStaple && assumeStaples) {
        matched.push(rawIng);
        continue;
      }

      requiredCount++;

      // Checks whether the recipe ingredient contains one of the pantry ingredients or vice versa
      const isPresent = normalizedPantry.some(p => {
        // Match by word or substring
        return normIng.includes(p) || p.split(' ').some(w => w.length > 2 && normIng.includes(w));
      });

      if (isPresent) {
        matchedCount++;
        matched.push(rawIng);
      } else {
        missing.push(rawIng);
      }
    }

    // If the user has at least 1 key ingredient of this recipe
    if (matchedCount > 0 && requiredCount > 0) {
      const percentage = Math.round((matchedCount / requiredCount) * 100);
      results.push({
        recipe,
        percentage,
        matchedCount,
        requiredCount,
        missingCount: missing.length,
        matched,
        missing
      });
    }
  }

  // Sorting:
  // 1. Fewest missing ingredients (0 missing = immediately doable at the top)
  // 2. Highest coverage percentage
  // 3. Greatest number of matching ingredients
  results.sort((a, b) => {
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    return b.matchedCount - a.matchedCount;
  });

  return results;
}
