import type { RecipeIngredient } from '../types/catalog';
import type { IngredientItem, Recipe } from '../types/recipe';
import { getDatabase, getWebData, isWebMode, planCatalogUpsert, runQueuedTransaction, setWebData, WEB_STORAGE_KEYS, writeCatalogRecipesInTx, writeCatalogRecipesWeb } from './database';
import { listIngredients } from './ingredientsDb';
import { matchCatalogName } from '../utils/catalogNameMatch';

export type RecipeIngredientDetail = RecipeIngredient & {
  ingredient_name: string;
  ingredient_type: string;
};

function requireDb(): any {
  const db = getDatabase();
  if (!db) throw new Error('database_unavailable');
  return db;
}

function runInTransaction<T>(db: any, fn: () => Promise<T>): Promise<T> {
  if (typeof db.withTransactionAsync === 'function') return runQueuedTransaction(db, fn);
  return fn();
}

function readWeb(): RecipeIngredient[] {
  return getWebData<RecipeIngredient[]>(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, []);
}

export interface RecipeLinkEntry {
  recipeId: string;
  items: IngredientItem[];
}

interface ResolvedLinks {
  recipeIds: string[];
  rows: RecipeIngredient[];
  linked: number;
  unresolved: number;
}

// 100 rows x 6 columns = 600 variables per INSERT, below SQLite's limit of 999
const INSERT_CHUNK_ROWS = 100;

/**
 * Resolves the rows of several recipes into links: a single read of the ingredients.
 * Uses the row id if it exists in the database, otherwise looks up the (normalized) name.
 */
async function resolveLinks(entries: RecipeLinkEntry[]): Promise<ResolvedLinks> {
  const ingredients = await listIngredients();
  const knownIds = new Set(ingredients.map(i => i.id));
  const names = ingredients.map(i => ({ id: i.id, name: i.name }));
  const rows: RecipeIngredient[] = [];
  let unresolved = 0;
  for (const { recipeId, items } of entries) {
    items.forEach((item, index) => {
      const id = item.ingredient_id && knownIds.has(item.ingredient_id)
        ? item.ingredient_id
        : matchCatalogName(item.ingredient || item.text, names).id;
      if (!id) {
        unresolved++;
        return;
      }
      rows.push({ recipe_id: recipeId, ingredient_id: id, amount: item.amount, unit: item.unit, note: '', position: index });
    });
  }
  return { recipeIds: entries.map(e => e.recipeId), rows, linked: rows.length, unresolved };
}

// Web: a single localStorage read and write for the whole batch.
// Known limit: localStorage has a quota (~5 MB); with the full recipe book (thousands of rows)
// the links may exceed it and, in that case, stay in memory only (see setWebData).
function writeLinksWeb(resolved: ResolvedLinks): void {
  const replaced = new Set(resolved.recipeIds);
  const others = readWeb().filter(r => !replaced.has(r.recipe_id));
  setWebData(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, [...others, ...resolved.rows]);
}

/**
 * Writes the links to SQLite WITHOUT opening a transaction: call it from inside a
 * runQueuedTransaction. It must never call runQueuedTransaction/runWrite (the queue cannot be nested).
 */
async function writeLinksInTx(db: any, resolved: ResolvedLinks): Promise<void> {
  for (const recipeId of resolved.recipeIds) {
    await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
  }
  for (let i = 0; i < resolved.rows.length; i += INSERT_CHUNK_ROWS) {
    const chunk = resolved.rows.slice(i, i + INSERT_CHUNK_ROWS);
    const params: (string | number | null)[] = [];
    for (const r of chunk) params.push(r.recipe_id, r.ingredient_id, r.amount, r.unit, r.note, r.position);
    await db.runAsync(
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, note, position) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
      params,
    );
  }
}

/**
 * Links the rows of several recipes to ingredients: ingredients read once, everything in one transaction.
 * For each recipe it replaces the previous links (even with an empty list: it deletes them), without touching the others.
 * Rows without a match stay as text only: they are counted, not linked.
 */
export async function saveRecipeLinksBatch(entries: RecipeLinkEntry[]): Promise<{ linked: number; unresolved: number }> {
  if (entries.length === 0) return { linked: 0, unresolved: 0 };
  const resolved = await resolveLinks(entries);
  if (isWebMode()) {
    writeLinksWeb(resolved);
    return { linked: resolved.linked, unresolved: resolved.unresolved };
  }
  const db = requireDb();
  try {
    await runInTransaction(db, () => writeLinksInTx(db, resolved));
    return { linked: resolved.linked, unresolved: resolved.unresolved };
  } catch (e) {
    console.error('saveRecipeLinksBatch error', e);
    throw e;
  }
}

/**
 * Links the rows of a recipe to ingredients (batch wrapper).
 * Note: the section of the rows is not kept in the links, only ingredient, quantity, unit and position.
 */
export async function saveRecipeLinks(recipeId: string, items: IngredientItem[]): Promise<{ linked: number; unresolved: number }> {
  return saveRecipeLinksBatch([{ recipeId, items }]);
}

/**
 * Saves recipes and links in ONE transaction (SQLite): either everything is written or nothing.
 * With mode 'keep' links are created only for the recipes actually written.
 * On web there are no transactions: recipes are written first, then links, without rollback.
 * Errors are rethrown. Entries of `links` with an empty list delete the recipe's links:
 * whoever does not want to touch them must omit the entry.
 */
export async function saveCatalogRecipesWithLinks(
  recipes: Recipe[],
  mode: 'overwrite' | 'keep',
  links: RecipeLinkEntry[],
): Promise<{ inserted: number; updated: number; skipped: number; linked: number; unresolved: number }> {
  const { toWrite, result } = await planCatalogUpsert(recipes, mode);
  const written = new Set(toWrite.map(r => r.id));
  const resolved = await resolveLinks(links.filter(l => written.has(l.recipeId)));

  if (isWebMode()) {
    await writeCatalogRecipesWeb(toWrite);
    if (resolved.recipeIds.length > 0) writeLinksWeb(resolved);
    return { ...result, linked: resolved.linked, unresolved: resolved.unresolved };
  }
  const db = requireDb();
  try {
    await runInTransaction(db, async () => {
      await writeCatalogRecipesInTx(db, toWrite);
      await writeLinksInTx(db, resolved);
    });
  } catch (e) {
    console.error('saveCatalogRecipesWithLinks error', e);
    throw e;
  }
  return { ...result, linked: resolved.linked, unresolved: resolved.unresolved };
}

/** Lists the ingredients of a recipe ordered by position, with the ingredient name and type. */
export async function listRecipeIngredients(recipeId: string): Promise<RecipeIngredientDetail[]> {
  if (isWebMode()) {
    const ingredients = await listIngredients();
    const byId = new Map(ingredients.map(i => [i.id, i]));
    const out: RecipeIngredientDetail[] = [];
    for (const row of readWeb()) {
      if (row.recipe_id !== recipeId) continue;
      const ingredient = byId.get(row.ingredient_id);
      if (!ingredient) continue;
      out.push({
        ...row,
        ingredient_name: ingredient.name,
        ingredient_type: ingredient.type,
      });
    }
    return out.sort((a, b) => a.position - b.position);
  }
  const db = requireDb();
  try {
    const rows: any[] = await db.getAllAsync(
      `SELECT ri.recipe_id, ri.ingredient_id, ri.amount, ri.unit, ri.note, ri.position,
              i.name AS ingredient_name, i.type AS ingredient_type
       FROM recipe_ingredients ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = ?
       ORDER BY ri.position`,
      [recipeId],
    );
    return rows.map(r => ({
      recipe_id: r.recipe_id,
      ingredient_id: r.ingredient_id,
      amount: typeof r.amount === 'number' ? r.amount : null,
      unit: r.unit ?? '',
      note: r.note ?? '',
      position: r.position,
      ingredient_name: r.ingredient_name,
      ingredient_type: r.ingredient_type,
    }));
  } catch (e) {
    console.error('listRecipeIngredients error', e);
    throw e;
  }
}

/** Returns the distinct recipe ids that use the given ingredient. */
export async function listRecipeIdsForIngredient(ingredientId: string): Promise<string[]> {
  if (isWebMode()) {
    const ids = new Set<string>();
    for (const row of readWeb()) {
      if (row.ingredient_id === ingredientId) ids.add(row.recipe_id);
    }
    return [...ids].sort();
  }
  const db = requireDb();
  try {
    const rows: any[] = await db.getAllAsync(
      'SELECT DISTINCT recipe_id FROM recipe_ingredients WHERE ingredient_id = ? ORDER BY recipe_id',
      [ingredientId],
    );
    return rows.map(r => r.recipe_id as string);
  } catch (e) {
    console.error('listRecipeIdsForIngredient error', e);
    throw e;
  }
}
