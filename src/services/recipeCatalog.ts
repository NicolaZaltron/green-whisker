import type { RecipeSummary } from '../types/recipe';
import { getCatalogRecipes, getCatalogSummariesByIds } from '../db/database';
import { initializeSearchIndex, markSearchIndexDirty } from './searchService';

// Same arrays for all screens: they are updated in place, so whoever imported them sees the changes.
// Summaries only (no card body): the full recipe is loaded by id with getRecipeDetail.
export const catalogRecipes: RecipeSummary[] = []; // original recipes: search, planner, shopping, favorites
export const catalogVariants: RecipeSummary[] = []; // variants: visible only in the recipe card

// Index by id over originals and variants, rebuilt on every catalog change (see setCatalog)
const recipeById = new Map<string, RecipeSummary>();

function rebuildRecipeIndex(): void {
  recipeById.clear();
  // Same order as the old per-screen map: variants overwrite the id, if duplicated
  catalogRecipes.forEach(r => recipeById.set(r.id, r));
  catalogVariants.forEach(r => recipeById.set(r.id, r));
}

/** Recipe summary (original or variant) by id, O(1). */
export function getRecipeById(id: string): RecipeSummary | undefined {
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

function setCatalog(all: RecipeSummary[]): void {
  // A variant without an original in the catalog is shown as a normal recipe, until the original arrives
  const originalIds = new Set(all.filter(r => !r.variant_of).map(r => r.id));
  catalogRecipes.splice(0, catalogRecipes.length, ...all.filter(r => !r.variant_of || !originalIds.has(r.variant_of)));
  catalogVariants.splice(0, catalogVariants.length, ...all.filter(r => r.variant_of && originalIds.has(r.variant_of)));
  rebuildRecipeIndex();
  initializeSearchIndex(catalogRecipes);
  version++;
  listeners.forEach(listener => listener());
}

/** Loads the catalog summaries from the database. Call after initDatabase and the seeds. */
export async function loadCatalog(): Promise<void> {
  setCatalog(await getCatalogRecipes());
}

function replaceIn(list: RecipeSummary[], item: RecipeSummary): boolean {
  const idx = list.findIndex(r => r.id === item.id);
  if (idx < 0) return false;
  list[idx] = item;
  return true;
}

function removeFrom(list: RecipeSummary[], id: string): void {
  const idx = list.findIndex(r => r.id === id);
  if (idx >= 0) list.splice(idx, 1);
}

/** Updates only the given ids in place, with the same split semantics as setCatalog. */
async function applyChanges(changedIds: string[]): Promise<void> {
  const ids = Array.from(new Set(changedIds));
  const fresh = new Map((await getCatalogSummariesByIds(ids)).map(r => [r.id, r]));
  const all = new Map<string, RecipeSummary>();
  catalogRecipes.forEach(r => all.set(r.id, r));
  catalogVariants.forEach(r => all.set(r.id, r));
  for (const id of ids) {
    const item = fresh.get(id);
    if (item) all.set(id, item);
    else all.delete(id);
  }
  // Affected: changed ids and the variants pointing to them (their placement depends on the original)
  const idSet = new Set(ids);
  const affected = new Map<string, RecipeSummary>();
  for (const id of ids) {
    const item = all.get(id);
    if (item) affected.set(id, item);
    else {
      removeFrom(catalogRecipes, id);
      removeFrom(catalogVariants, id);
    }
  }
  for (const r of all.values()) {
    if (r.variant_of && idSet.has(r.variant_of)) affected.set(r.id, r);
  }
  for (const item of affected.values()) {
    const asVariant = !!item.variant_of && all.has(item.variant_of) && !all.get(item.variant_of)!.variant_of;
    const target = asVariant ? catalogVariants : catalogRecipes;
    const other = asVariant ? catalogRecipes : catalogVariants;
    removeFrom(other, item.id);
    if (!replaceIn(target, item)) target.unshift(item);
  }
  rebuildRecipeIndex();
  markSearchIndexDirty();
  version++;
  listeners.forEach(listener => listener());
}

/**
 * To be called after every database modification. Without ids: reloads the whole catalog;
 * with ids: re-reads only those summaries (removing the ones no longer in the database).
 */
export async function refreshCatalog(changedIds?: string[]): Promise<void> {
  if (!changedIds) return loadCatalog();
  if (changedIds.length === 0) return;
  await applyChanges(changedIds);
}
