import { getDatabase, isWebMode, runWrite, runQueuedTransaction } from './connection';
import { WEB_STORAGE_KEYS, getWebData, setWebData } from './webStorage';
import { Recipe, RecipeSummary, RECIPE_BODY_KEYS, MealPlanEntry } from '../types/recipe';
import { expandDeletion } from '../services/catalogFormat';

// --- CATALOG ---
// All the phone's recipes (originals and variants). Variants have base_id set.

/** Light summary of a recipe: everything except the card body (see RECIPE_BODY_KEYS). */
export function summaryOf(recipe: Recipe): RecipeSummary {
  const summary: Record<string, unknown> = { ...recipe };
  for (const key of RECIPE_BODY_KEYS) delete summary[key];
  return summary as RecipeSummary;
}

function bodyOf(recipe: Recipe): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of RECIPE_BODY_KEYS) {
    if (recipe[key] !== undefined) body[key] = recipe[key];
  }
  return body;
}

// Columns of the 'recipe' table used by the queries, kept next to the summary JSON
function indexFieldsOf(recipe: Recipe) {
  const now = Date.now();
  return {
    category: recipe.category,
    diet: recipe.diet ?? 'omnivore',
    origin: recipe.origin ?? 'file',
    variantOf: recipe.variant_of ?? null,
    created: recipe.created_at ?? now,
    updated: recipe.updated_at ?? now,
  };
}

function parseJson<T>(raw: unknown): T | null {
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

// Summary and body are read in a single query; a row that does not parse is skipped
function recipeFromRow(row: any): Recipe | null {
  const summary = parseJson<RecipeSummary>(row.summary_json);
  if (!summary) return null;
  const body = row.body_json ? parseJson<Partial<Recipe>>(row.body_json) : null;
  return { ...summary, ...(body ?? {}) } as Recipe;
}

/** Light summaries of all recipes, for the lists, the planner, the picker and the search. */
export async function getCatalogRecipes(): Promise<RecipeSummary[]> {
  if (isWebMode()) {
    return getWebData<Recipe[]>(WEB_STORAGE_KEYS.CATALOG, []).map(summaryOf);
  }

  try {
    const rows = await getDatabase().getAllAsync('SELECT summary_json FROM recipe ORDER BY created_at DESC');
    return rows.flatMap((r: any) => {
      const summary = parseJson<RecipeSummary>(r.summary_json);
      return summary ? [summary] : [];
    });
  } catch (e) {
    console.error('getCatalogRecipes error', e);
    return [];
  }
}

/** Summaries of the given ids only (chunks of 500). Ids no longer in the database are absent. */
export async function getCatalogSummariesByIds(ids: string[]): Promise<RecipeSummary[]> {
  if (ids.length === 0) return [];
  if (isWebMode()) {
    const wanted = new Set(ids);
    return getWebData<Recipe[]>(WEB_STORAGE_KEYS.CATALOG, []).filter(r => wanted.has(r.id)).map(summaryOf);
  }

  try {
    const result: RecipeSummary[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rows = await getDatabase().getAllAsync(
        `SELECT summary_json FROM recipe WHERE id IN (${chunk.map(() => '?').join(',')})`,
        chunk,
      );
      for (const r of rows as any[]) {
        const summary = parseJson<RecipeSummary>(r.summary_json);
        if (summary) result.push(summary);
      }
    }
    return result;
  } catch (e) {
    console.error('getCatalogSummariesByIds error', e);
    return [];
  }
}

/** Full recipes (summary and body). Only for export and migrations: it reads the whole catalog. */
export async function getFullCatalogRecipes(): Promise<Recipe[]> {
  if (isWebMode()) {
    return getWebData<Recipe[]>(WEB_STORAGE_KEYS.CATALOG, []);
  }

  try {
    const rows = await getDatabase().getAllAsync(
      'SELECT r.summary_json, b.body_json FROM recipe r LEFT JOIN recipe_body b ON b.recipe_id = r.id ORDER BY r.created_at DESC',
    );
    return rows.flatMap((r: any) => {
      const recipe = recipeFromRow(r);
      return recipe ? [recipe] : [];
    });
  } catch (e) {
    console.error('getFullCatalogRecipes error', e);
    return [];
  }
}

/** Full recipe by id (card body included), or null. */
export async function getRecipeDetail(id: string): Promise<Recipe | null> {
  if (isWebMode()) {
    return getWebData<Recipe[]>(WEB_STORAGE_KEYS.CATALOG, []).find(r => r.id === id) ?? null;
  }

  try {
    const row: any = await getDatabase().getFirstAsync(
      'SELECT r.summary_json, b.body_json FROM recipe r LEFT JOIN recipe_body b ON b.recipe_id = r.id WHERE r.id = ?',
      [id],
    );
    return row ? recipeFromRow(row) : null;
  } catch (e) {
    console.error('getRecipeDetail error', e);
    return null;
  }
}

async function getCatalogIds(db?: any): Promise<Set<string>> {
  if (isWebMode()) {
    return new Set(getWebData<Recipe[]>(WEB_STORAGE_KEYS.CATALOG, []).map(r => r.id));
  }
  const rows: any[] = await (db ?? getDatabase()).getAllAsync('SELECT id FROM recipe');
  return new Set(rows.map(r => r.id));
}

/**
 * Decides which recipes to write: with mode 'keep' those with an id already present are skipped.
 */
// Pass the open transaction's db to decide on the rows that the transaction will see
export async function planCatalogUpsert(recipes: Recipe[], mode: 'overwrite' | 'keep' = 'overwrite', db?: any): Promise<{ toWrite: Recipe[]; result: { inserted: number; updated: number; skipped: number } }> {
  const existing = await getCatalogIds(db);
  const result = { inserted: 0, updated: 0, skipped: 0 };
  const toWrite = recipes.filter(r => {
    if (!existing.has(r.id)) {
      result.inserted++;
      return true;
    }
    if (mode === 'keep') {
      result.skipped++;
      return false;
    }
    result.updated++;
    return true;
  });
  return { toWrite, result };
}

/** Writes the recipes to the web catalog (localStorage): one read and one write. */
export async function writeCatalogRecipesWeb(toWrite: Recipe[]): Promise<void> {
  const byId = new Map(getWebData<Recipe[]>(WEB_STORAGE_KEYS.CATALOG, []).map(r => [r.id, r]));
  toWrite.forEach(r => byId.set(r.id, r));
  setWebData(WEB_STORAGE_KEYS.CATALOG, Array.from(byId.values()));
}

/**
 * Writes the recipes to SQLite WITHOUT opening a transaction: call it from inside a
 * runQueuedTransaction (or where atomicity is not needed). It never calls runQueuedTransaction/runWrite.
 */
// onRecipe(index) is called after each recipe is written (used for the import progress)
export async function writeCatalogRecipesInTx(db: any, toWrite: Recipe[], onRecipe?: (index: number) => void): Promise<void> {
  for (const [index, recipe] of toWrite.entries()) {
    const f = indexFieldsOf(recipe);
    await db.runAsync(`
      INSERT INTO recipe (id, summary_json, category, diet, origin, variant_of, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary_json = excluded.summary_json,
        category = excluded.category,
        diet = excluded.diet,
        origin = excluded.origin,
        variant_of = excluded.variant_of,
        updated_at = excluded.updated_at
    `, [recipe.id, JSON.stringify(summaryOf(recipe)), f.category, f.diet, f.origin, f.variantOf, f.created, f.updated]);
    await db.runAsync(`
      INSERT INTO recipe_body (recipe_id, body_json) VALUES (?, ?)
      ON CONFLICT(recipe_id) DO UPDATE SET body_json = excluded.body_json
    `, [recipe.id, JSON.stringify(bodyOf(recipe))]);
    onRecipe?.(index);
  }
}

/**
 * Inserts or updates recipes. With mode 'keep' recipes with an id already present are not touched.
 * On a write error it rethrows after logging it: callers must handle it.
 */
export async function upsertCatalogRecipes(recipes: Recipe[], mode: 'overwrite' | 'keep' = 'overwrite'): Promise<{ inserted: number; updated: number; skipped: number }> {
  if (isWebMode()) {
    const { toWrite, result } = await planCatalogUpsert(recipes, mode);
    await writeCatalogRecipesWeb(toWrite);
    return result;
  }

  const db = getDatabase();
  // The keep/overwrite decision is read inside the transaction, so it sees the rows the writes will see
  const planAndWrite = async () => {
    const { toWrite, result } = await planCatalogUpsert(recipes, mode, db);
    await writeCatalogRecipesInTx(db, toWrite);
    return result;
  };
  try {
    if (typeof (db as any).withTransactionAsync === 'function') {
      return await runQueuedTransaction(db, planAndWrite);
    }
    return await planAndWrite();
  } catch (e) {
    console.error('upsertCatalogRecipes error', e);
    throw e;
  }
}

/**
 * Removes from the planner, favorites and notes the recipes deleted from the catalog.
 * The shopping list is not touched: it already keeps the ingredient text.
 */
export async function removeRecipeReferences(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const gone = new Set(ids);

  if (isWebMode()) {
    setWebData(WEB_STORAGE_KEYS.FAVORITES, getWebData<string[]>(WEB_STORAGE_KEYS.FAVORITES, []).filter(id => !gone.has(id)));
    const notes = getWebData<Record<string, string>>(WEB_STORAGE_KEYS.NOTES, {});
    ids.forEach(id => { delete notes[id]; });
    setWebData(WEB_STORAGE_KEYS.NOTES, notes);
    const plans = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, plans
      .filter(p => !p.recipe_id || !gone.has(p.recipe_id)));
    setWebData(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, getWebData<any[]>(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, []).filter(r => !gone.has(r.recipe_id)));
    return;
  }

  // Native: the foreign keys (ON DELETE CASCADE) already remove favorites, notes, planned entries and links
}

/**
 * Deletes the given recipes and their variants. Returns the deleted ids, to clean up references.
 */
export async function deleteCatalogRecipes(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const all = await getCatalogRecipes();
  const deleted = expandDeletion(ids, all);

  if (isWebMode()) {
    const gone = new Set(deleted);
    setWebData(WEB_STORAGE_KEYS.CATALOG, getWebData<Recipe[]>(WEB_STORAGE_KEYS.CATALOG, []).filter(r => !gone.has(r.id)));
    return deleted;
  }

  // Errors must not be swallowed: the caller needs to know the deletion did not happen.
  // recipe_body and the links are removed by the foreign keys (ON DELETE CASCADE)
  const placeholders = deleted.map(() => '?').join(',');
  await runWrite(() => getDatabase().runAsync(`DELETE FROM recipe WHERE id IN (${placeholders})`, deleted));
  return deleted;
}
