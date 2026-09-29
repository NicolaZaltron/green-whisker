import Fuse from 'fuse.js';
import { Recipe } from '../types/recipe';

const defaultRecipes = require('../../assets/ricette.json') as Recipe[];

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
let fuseInstance: Fuse<Recipe> | null = createFuse(defaultRecipes);

export function initializeSearchIndex(recipes: Recipe[]): void {
  currentDataset = recipes;
  fuseInstance = createFuse(recipes);
}

export function searchRecipes(query: string, categoryFilter: string, tagFilter: string | null): Recipe[] {
  let list = currentDataset;

  // 1. Text Search (Fuzzy or Exact)
  const trimmed = query.trim();
  if (trimmed && fuseInstance) {
    const results = fuseInstance.search(trimmed);
    list = results.map(r => r.item);
  }

  // 2. Category Filter
  if (categoryFilter && categoryFilter !== 'Tutte') {
    list = list.filter(r => r.categoria === categoryFilter);
  }

  // 3. Quick Tag Filter
  if (tagFilter) {
    if (tagFilter === '< 30 min') {
      list = list.filter(r => r.tempi.tempo_totale_minuti > 0 && r.tempi.tempo_totale_minuti <= 30);
    } else if (tagFilter === 'Senza Glutine') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('senza glutine')));
    } else if (tagFilter === 'Al forno') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('al forno')));
    } else if (tagFilter === 'Senza cottura') {
      list = list.filter(r => r.tags.some(t => t.toLowerCase().includes('senza cottura')));
    } else if (tagFilter === 'Facile') {
      list = list.filter(r => r.difficolta === 'Facile');
    }
  }

  return list;
}
