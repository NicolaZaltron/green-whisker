import { Recipe } from '../types/recipe';
import { getCatalogRecipes, getKV, initCatalog, setKV, upsertCatalogRecipes } from '../db/database';
import { normalizeImported } from './catalogFormat';
import { initializeSearchIndex } from './searchService';

// One-time recomputation of diet and tags on the recipes already present (previous versions did not do it)
const DIET_RULES_KEY = 'catalog_diet_rules_v3';

// Same arrays for all screens: they are updated in place, so whoever imported them sees the changes.
export const catalogRecipes: Recipe[] = []; // original recipes: search, planner, shopping, favorites
export const catalogVariants: Recipe[] = []; // variants: visible only in the recipe card

// Index by id over originals and variants, rebuilt on every catalog change (see setCatalog)
const recipeById = new Map<string, Recipe>();

function rebuildRecipeIndex(): void {
  recipeById.clear();
  // Same order as the old per-screen map: variants overwrite the id, if duplicated
  catalogRecipes.forEach(r => recipeById.set(r.id, r));
  catalogVariants.forEach(r => recipeById.set(r.id, r));
}

/** Recipe (original or variant) by id, O(1). */
export function getRecipeById(id: string): Recipe | undefined {
  return recipeById.get(id);
}

let version = 0;
const listeners = new Set<() => void>();

export function getCatalogVersion(): number {
  return version;
}

export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setCatalog(all: Recipe[]): void {
  // A variant without an original in the catalog is shown as a normal recipe, until the original arrives
  const originalIds = new Set(all.filter(r => !r.variant_of).map(r => r.id));
  catalogRecipes.splice(0, catalogRecipes.length, ...all.filter(r => !r.variant_of || !originalIds.has(r.variant_of)));
  catalogVariants.splice(0, catalogVariants.length, ...all.filter(r => r.variant_of && originalIds.has(r.variant_of)));
  rebuildRecipeIndex();
  initializeSearchIndex(catalogRecipes);
  version++;
  listeners.forEach(listener => listener());
}

/** Loads the catalog from the database (with the one-time migration). Call after initDatabase. */
export async function loadCatalog(): Promise<void> {
  // If a migration fails (upsertCatalogRecipes rethrows) startup is not blocked:
  // the flag is not set, so the migration repeats at the next load
  try {
    await initCatalog();
    if ((await getKV(DIET_RULES_KEY)) !== '1') {
      const now = Date.now();
      await upsertCatalogRecipes((await getCatalogRecipes()).map(r => normalizeImported(r, now)), 'overwrite');
      await setKV(DIET_RULES_KEY, '1');
    }
  } catch (e) {
    console.warn('Catalog migration failed, it will be retried:', e);
  }
  setCatalog(await getCatalogRecipes());
}

/** To be called after every database modification: reloads the shared catalog */
export const refreshCatalog = loadCatalog;
