import Fuse from 'fuse.js';
import { Recipe } from '../types/recipe';

const defaultRecipes = require('../../assets/ricette.json') as Recipe[];

export interface AdvancedFilterOptions {
  maxMinutes?: number | null; // e.g. 20, 35, 50
  difficolta?: 'Facile' | 'Media' | 'Difficile' | null;
  tag?: string | null; // e.g. 'Senza Glutine', 'Al forno', 'Senza cottura'
  sottocategoria?: string | null;
}

function createFuse(recipes: Recipe[]): Fuse<Recipe> {
  return new Fuse(recipes, {
    keys: [
      { name: 'titolo', weight: 0.6 },
      { name: 'ingredienti', weight: 0.3 },
      { name: 'categoria', weight: 0.1 }
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true
  });
}

let currentDataset: Recipe[] = defaultRecipes;
let fuseInstance: Fuse<Recipe> | null = null;

function getFuseInstance(): Fuse<Recipe> {
  if (!fuseInstance) {
    fuseInstance = createFuse(currentDataset);
  }
  return fuseInstance;
}

export function initializeSearchIndex(recipes: Recipe[]): void {
  currentDataset = recipes;
  fuseInstance = createFuse(recipes);
}

export function searchRecipes(
  query: string,
  categoryFilter: string,
  filters?: string | AdvancedFilterOptions | null
): Recipe[] {
  let list = currentDataset;

  // 1. Text Search (Fuzzy or Exact)
  const trimmed = query.trim();
  if (trimmed) {
    const fuse = getFuseInstance();
    const results = fuse.search(trimmed);
    list = results.map(r => r.item);
  }

  // 2. Category Filter (Macro)
  if (categoryFilter && categoryFilter !== 'Tutte') {
    list = list.filter(r => r.categoria === categoryFilter || r.macro_categoria === categoryFilter);
  }

  // 3. String Tag Filter (backward compat)
  if (typeof filters === 'string' && filters) {
    if (filters === '< 30 min') {
      list = list.filter(r => r.tempi.tempo_totale_minuti > 0 && r.tempi.tempo_totale_minuti <= 30);
    } else if (filters === 'Senza Glutine') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('senza glutine')));
    } else if (filters === 'Al forno') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('al forno')));
    } else if (filters === 'Senza cottura') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('senza cottura')));
    } else if (filters === 'Facile') {
      list = list.filter(r => r.difficolta === 'Facile');
    }
  } else if (filters && typeof filters === 'object') {
    // 4. Advanced Filters
    if (filters.sottocategoria && filters.sottocategoria !== 'Tutte') {
      list = list.filter(r => r.sottocategoria === filters.sottocategoria);
    }
    if (filters.maxMinutes) {
      list = list.filter(r => r.tempi.tempo_totale_minuti > 0 && r.tempi.tempo_totale_minuti <= filters.maxMinutes!);
    }
    if (filters.difficolta) {
      list = list.filter(r => r.difficolta === filters.difficolta);
    }
    if (filters.tag) {
      const lower = filters.tag.toLowerCase();
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes(lower)));
    }
  }

  return list;
}
