import type { RecipeIngredient } from '../types/catalog';
import type { IngredientItem, Recipe } from '../types/recipe';
import { getDatabase, getWebData, isWebMode, planCatalogUpsert, requireDb, runInTransaction, setWebData, WEB_STORAGE_KEYS, writeCatalogRecipesInTx, writeCatalogRecipesWeb } from './database';
import { listIngredients, writeImportIngredientsInTx, writeImportIngredientsWeb } from './ingredientsDb';
import type { ImportIngredientPlan } from './ingredientsDb';
import { resolveRowIdWithChoices } from '../utils/importResolution';
import type { KnownIngredient } from '../utils/importResolution';

export type RecipeIngredientDetail = RecipeIngredient & {
  ingredient_name: string;
  ingredient_type: string;
};

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

/** Ingredients the database knows, with their aliases (the same on native and web). */
export async function knownIngredients(): Promise<KnownIngredient[]> {
  if (isWebMode()) {
    const ingredients = await listIngredients();
    return ingredients.map(i => ({ id: i.id, name: i.name, aliases: i.aliases }));
  }
  // Native: two light reads (no nutrients) instead of the whole ingredient table
  const db = getDatabase();
  const rows: { id: string; name: string }[] = await db.getAllAsync('SELECT id, name FROM ingredient');
  const aliases: { alias_key: string; ingredient_id: string }[] = await db.getAllAsync('SELECT alias_key, ingredient_id FROM ingredient_alias');
  const byId = new Map<string, string[]>();
  for (const a of aliases) byId.set(a.ingredient_id, [...(byId.get(a.ingredient_id) ?? []), a.alias_key]);
  return rows.map(r => ({ id: r.id, name: r.name, aliases: byId.get(r.id) ?? [] }));
}

/**
 * Resolves the rows of several recipes into links: a single read of the ingredients.
 * Uses the row id if it exists in the database, otherwise the name or an alias, otherwise the user's choice.
 */
async function resolveLinks(entries: RecipeLinkEntry[], choiceIds: ReadonlyMap<string, string> = new Map(), preloaded?: readonly KnownIngredient[]): Promise<ResolvedLinks> {
  const known = preloaded ?? await knownIngredients();
  const knownIds = new Set(known.map(i => i.id));
  const rows: RecipeIngredient[] = [];
  let unresolved = 0;
  for (const { recipeId, items } of entries) {
    items.forEach((item, index) => {
      const id = resolveRowIdWithChoices(item, knownIds, known, choiceIds);
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
    await db.runAsync('DELETE FROM recipe_ingredient WHERE recipe_id = ?', [recipeId]);
  }
  for (let i = 0; i < resolved.rows.length; i += INSERT_CHUNK_ROWS) {
    const chunk = resolved.rows.slice(i, i + INSERT_CHUNK_ROWS);
    const params: (string | number | null)[] = [];
    for (const r of chunk) params.push(r.recipe_id, r.ingredient_id, r.amount, r.unit, r.note, r.position);
    await db.runAsync(
      `INSERT INTO recipe_ingredient (recipe_id, ingredient_id, amount, unit, note, position) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
      params,
    );
  }
}

/**
 * Saves recipes and links in ONE transaction (SQLite): either everything is written or nothing.
 * With mode 'keep' links are created only for the recipes actually written.
 * On web there are no transactions: recipes are written first, then links, without rollback.
 * Errors are rethrown. Entries of `links` with an empty list delete the recipe's links:
 * whoever does not want to touch them must omit the entry.
 */
export interface ImportPlan {
  // Ingredients to create and aliases to add, decided by the user before the import
  ingredients: ImportIngredientPlan;
  // Unknown ingredient names (normalized) mapped to the id that the user chose for them
  choiceIds: ReadonlyMap<string, string>;
  // Known ingredients read once for the whole import (read from the database when absent)
  known?: readonly KnownIngredient[];
}

const NO_IMPORT_PLAN: ImportPlan = { ingredients: { created: [], aliases: [] }, choiceIds: new Map() };

export async function saveCatalogRecipesWithLinks(
  recipes: Recipe[],
  mode: 'overwrite' | 'keep',
  links: RecipeLinkEntry[],
  plan: ImportPlan = NO_IMPORT_PLAN,
  onProgress?: (done: number, total: number) => void,
): Promise<{ inserted: number; updated: number; skipped: number; linked: number; unresolved: number }> {
  if (isWebMode()) {
    const { toWrite, result } = await planCatalogUpsert(recipes, mode);
    const alreadyDone = recipes.length - toWrite.length;
    onProgress?.(alreadyDone, recipes.length);
    const written = new Set(toWrite.map(r => r.id));
    const resolved = await resolveLinks(links.filter(l => written.has(l.recipeId)), plan.choiceIds, plan.known);
    await writeCatalogRecipesWeb(toWrite);
    onProgress?.(recipes.length, recipes.length);
    await writeImportIngredientsWeb(plan.ingredients);
    if (resolved.recipeIds.length > 0) writeLinksWeb(resolved);
    return { ...result, linked: resolved.linked, unresolved: resolved.unresolved };
  }

  const db = requireDb();
  try {
    return await runInTransaction(db, async () => {
      // The keep/overwrite decision and the link resolution read the rows inside the transaction that writes them
      const { toWrite, result } = await planCatalogUpsert(recipes, mode, db);
      // Recipes skipped in 'keep' mode count as processed from the start
      const alreadyDone = recipes.length - toWrite.length;
      onProgress?.(alreadyDone, recipes.length);
      const written = new Set(toWrite.map(r => r.id));
      const resolved = await resolveLinks(links.filter(l => written.has(l.recipeId)), plan.choiceIds, plan.known);
      await writeCatalogRecipesInTx(db, toWrite, index => onProgress?.(alreadyDone + index + 1, recipes.length));
      await writeImportIngredientsInTx(db, plan.ingredients);
      await writeLinksInTx(db, resolved);
      return { ...result, linked: resolved.linked, unresolved: resolved.unresolved };
    });
  } catch (e) {
    console.error('saveCatalogRecipesWithLinks error', e);
    throw e;
  }
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
       FROM recipe_ingredient ri
       JOIN ingredient i ON i.id = ri.ingredient_id
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

