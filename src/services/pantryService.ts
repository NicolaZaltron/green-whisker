import { Recipe } from '../types/recipe';

const defaultRecipes = require('../../assets/ricette.json') as Recipe[];

export interface PantryMatchResult {
  recipe: Recipe;
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

// Condimenti base che normalmente chiunque ha a casa
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

interface NormalizedIngredientItem {
  original: string;
  normalized: string;
}

let cachedNormalizedIngredients: NormalizedIngredientItem[] | null = null;

/**
 * Lazily extracts and caches unique ingredient terms to avoid blocking JS thread during app boot.
 */
function getNormalizedIngredients(): NormalizedIngredientItem[] {
  if (cachedNormalizedIngredients !== null) {
    return cachedNormalizedIngredients;
  }

  const set = new Set<string>();
  const stopWords = new Set([
    'q.b.', 'qb', 'g', 'grammi', 'kg', 'ml', 'cl', 'l', 'litri',
    'cucchiai', 'cucchiaio', 'cucchiaini', 'cucchiaino', 'pizzico',
    'fette', 'fetta', 'bicchiere', 'bicchieri', 'spicchio', 'spicchi',
    'vasetto', 'vasetti', 'bustina', 'bustine', 'rotolo', 'rotoli',
    'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'il', 'lo',
    'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'del', 'della', 'dello',
    'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
    'e', 'o', 'raso', 'abbondante', 'facoltativo', 'opzionale', 'circa'
  ]);

  POPULAR_PANTRY_ITEMS.forEach(item => set.add(item));

  for (const recipe of defaultRecipes) {
    if (!recipe.ingredienti) continue;
    for (const raw of recipe.ingredienti) {
      const words = raw
        .toLowerCase()
        .replace(/[^a-zàèéìòù\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      if (words.length > 0) {
        words.forEach(w => {
          if (w.length >= 3) {
            set.add(w.charAt(0).toUpperCase() + w.slice(1));
          }
        });
      }
    }
  }

  const sorted = Array.from(set).sort((a, b) => a.localeCompare('it'));
  cachedNormalizedIngredients = sorted.map(item => ({
    original: item,
    normalized: normalize(item)
  }));

  return cachedNormalizedIngredients;
}

/**
 * Returns ingredient autocomplete suggestions based on typed query with pre-normalized matching and early exit.
 */
export function getIngredientSuggestions(query: string, alreadySelected: string[] = []): string[] {
  const trimmed = normalize(query);
  if (!trimmed) return [];

  const selectedNorm = new Set(alreadySelected.map(normalize));
  const items = getNormalizedIngredients();
  const suggestions: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
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
 * Algoritmo di matching Svuotafrigo:
 * Trova e ordina le ricette in base agli ingredienti posseduti.
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

  for (const recipe of defaultRecipes) {
    let requiredCount = 0;
    let matchedCount = 0;
    const matched: string[] = [];
    const missing: string[] = [];

    for (const rawIng of recipe.ingredienti) {
      const normIng = normalize(rawIng);
      const isStaple = DEFAULT_STAPLES.some(s => normIng.includes(s));

      if (isStaple && assumeStaples) {
        matched.push(rawIng);
        continue;
      }

      requiredCount++;

      // Verifica se l'ingrediente della ricetta contiene uno degli ingredienti del pantry o viceversa
      const isPresent = normalizedPantry.some(p => {
        // Corrispondenza per parola o sottostringa
        return normIng.includes(p) || p.split(' ').some(w => w.length > 2 && normIng.includes(w));
      });

      if (isPresent) {
        matchedCount++;
        matched.push(rawIng);
      } else {
        missing.push(rawIng);
      }
    }

    // Se l'utente ha almeno 1 ingrediente chiave di questa ricetta
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

  // Ordinamento:
  // 1. Meno ingredienti mancanti (0 mancanti = subito realizzabili in cima)
  // 2. Percentuale di copertura più alta
  // 3. Maggior numero di ingredienti combacianti
  results.sort((a, b) => {
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    return b.matchedCount - a.matchedCount;
  });

  return results;
}
