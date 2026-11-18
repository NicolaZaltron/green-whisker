import Fuse from 'fuse.js';
import { RecipeSummary } from '../types/recipe';

export interface AdvancedFilterOptions {
  maxMinutes?: number | null; // e.g. 20, 35, 50
  difficolta?: 'Facile' | 'Media' | 'Difficile' | null;
  tag?: string | null; // e.g. 'Senza Glutine', 'Al forno', 'Senza cottura'
  sottocategoria?: string | null;
}

function createFuse(recipes: RecipeSummary[]): Fuse<RecipeSummary> {
  return new Fuse(recipes, {
    keys: [
      { name: 'title', weight: 0.6 },
      { name: 'ingredients', weight: 0.3 },
      { name: 'category', weight: 0.1 }
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true
  });
}

let currentDataset: RecipeSummary[] = [];
let fuseInstance: Fuse<RecipeSummary> | null = null;

let indexDirty = false;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

function rebuildIfDirty(): void {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
    rebuildTimer = null;
  }
  if (indexDirty) {
    indexDirty = false;
    fuseInstance = createFuse(currentDataset);
  }
}

/** The dataset array was changed in place: the Fuse index is rebuilt once, shortly after, or before the next search. */
export function markSearchIndexDirty(): void {
  indexDirty = true;
  if (rebuildTimer) return;
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    rebuildIfDirty();
  }, 50);
}

function getFuseInstance(): Fuse<RecipeSummary> {
  rebuildIfDirty();
  if (!fuseInstance) {
    fuseInstance = createFuse(currentDataset);
  }
  return fuseInstance;
}

export function initializeSearchIndex(recipes: RecipeSummary[]): void {
  currentDataset = recipes;
  indexDirty = false;
  fuseInstance = createFuse(recipes);
}

// Typo tolerance for queries with several words: every word must be close to a word of the title (cost 0)
// or of the ingredients (cost 0.2 more). Distance is Levenshtein divided by the longer word, so one typo in
// a 8-letter word costs 0.125. Recipes are sorted by the sum of the word costs.
const MAX_WORD_COST = 0.34;

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

function normalizedTokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function wordCost(word: string, tokens: string[]): number {
  let best = Infinity;
  for (const token of tokens) {
    if (token.startsWith(word)) return 0;
    best = Math.min(best, levenshtein(word, token) / Math.max(word.length, token.length));
  }
  return best;
}

function fuzzyWordsSearch(words: string[]): RecipeSummary[] {
  const scored: { item: RecipeSummary; cost: number }[] = [];
  for (const item of currentDataset) {
    const titleTokens = normalizedTokens(item.title);
    const ingredientTokens = normalizedTokens((item.ingredients ?? []).join(' '));
    let cost = 0;
    for (const word of words) {
      const c = Math.min(wordCost(word, titleTokens), wordCost(word, ingredientTokens) + 0.2);
      if (c > MAX_WORD_COST) {
        cost = Infinity;
        break;
      }
      cost += c;
    }
    if (cost !== Infinity) scored.push({ item, cost });
  }
  return scored.sort((a, b) => a.cost - b.cost).map(s => s.item);
}

// Single word: Fuse (weighted title, ingredients and category); several words: word by word
function fuzzySearch(query: string): RecipeSummary[] {
  // Short words ("al", "di") match almost everything: they are ignored when there are longer words
  const all = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  const longer = all.filter(w => w.length >= 3);
  const words = longer.length > 0 ? longer : all;
  if (words.length <= 1) return getFuseInstance().search(query).map(r => r.item);
  return fuzzyWordsSearch(words);
}

export function searchRecipes(
  query: string,
  categoryFilter: string,
  filters?: string | AdvancedFilterOptions | null
): RecipeSummary[] {
  let list = currentDataset;

  // 1. Text Search (Fuzzy or Exact)
  const trimmed = query.trim();
  if (trimmed) {
    list = fuzzySearch(trimmed);
  }

  // 2. Category Filter (Macro)
  if (categoryFilter && categoryFilter !== 'Tutte') {
    list = list.filter(r => r.category === categoryFilter || r.macro_category === categoryFilter);
  }

  // 3. String Tag Filter (backward compat)
  if (typeof filters === 'string' && filters) {
    if (filters === '< 30 min') {
      list = list.filter(r => r.times.total_minutes > 0 && r.times.total_minutes <= 30);
    } else if (filters === 'Senza Glutine') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('senza glutine')));
    } else if (filters === 'Al forno') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('al forno')));
    } else if (filters === 'Senza cottura') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('senza cottura')));
    } else if (filters === 'Facile') {
      list = list.filter(r => r.difficulty === 'Facile' || r.difficulty === 'easy');
    }
  } else if (filters && typeof filters === 'object') {
    // 4. Advanced Filters
    if (filters.sottocategoria && filters.sottocategoria !== 'Tutte') {
      list = list.filter(r => r.subcategory === filters.sottocategoria);
    }
    if (filters.maxMinutes) {
      list = list.filter(r => r.times.total_minutes > 0 && r.times.total_minutes <= filters.maxMinutes!);
    }
    if (filters.difficolta) {
      list = list.filter(r => r.difficulty === filters.difficolta || (filters.difficolta === 'Facile' && r.difficulty === 'easy') || (filters.difficolta === 'Media' && r.difficulty === 'medium') || (filters.difficolta === 'Difficile' && r.difficulty === 'hard'));
    }
    if (filters.tag) {
      const lower = filters.tag.toLowerCase();
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes(lower)));
    }
  }

  return list;
}
