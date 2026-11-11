import type { RecipeIngredient } from '../types/catalog';
import { getDatabase, getWebData, isWebMode, runQueuedTransaction, setWebData, WEB_STORAGE_KEYS } from './database';
import { listIngredients } from './ingredientsDb';

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

/** Replaces every recipe-ingredient link with the given rows. Returns the number of rows written. */
export async function replaceRecipeIngredients(rows: RecipeIngredient[]): Promise<number> {
  if (isWebMode()) {
    setWebData(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, rows);
    return rows.length;
  }
  const db = requireDb();
  try {
    await runInTransaction(db, async () => {
      await db.runAsync('DELETE FROM recipe_ingredients');
      for (const row of rows) {
        await db.runAsync(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, note, position)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [row.recipe_id, row.ingredient_id, row.amount, row.unit, row.note, row.position],
        );
      }
    });
    return rows.length;
  } catch (e) {
    console.error('replaceRecipeIngredients error', e);
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
