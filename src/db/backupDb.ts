// Reads and replaces the user's own tables for the backup restore. Each replacement is one transaction.
import type { MealPlanEntry, ShoppingItem } from '../types/recipe';
import { getDatabase, isWebMode, runQueuedTransaction } from './database';

function requireSql(): any {
  if (isWebMode()) throw new Error('backup_unavailable');
  return getDatabase();
}

export async function readAllKv(): Promise<Record<string, string>> {
  if (isWebMode()) return {};
  const rows: { key: string; value: string }[] = await getDatabase().getAllAsync('SELECT key, value FROM kv_store');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function replaceAllKv(entries: Record<string, string>): Promise<void> {
  const db = requireSql();
  await runQueuedTransaction(db, async () => {
    await db.runAsync('DELETE FROM kv_store');
    for (const [key, value] of Object.entries(entries)) {
      await db.runAsync('INSERT INTO kv_store (key, value) VALUES (?, ?)', [key, value]);
    }
  });
}

export async function replacePlannerEntries(entries: MealPlanEntry[]): Promise<void> {
  const db = requireSql();
  await runQueuedTransaction(db, async () => {
    await db.runAsync('DELETE FROM meal_plan');
    for (const e of entries) {
      await db.runAsync(
        `INSERT INTO meal_plan (id, date, slot, kind, recipe_id, recipe_source, ingredient_id, ready_meal_id, label, amount, unit, count, servings, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.date, e.slot, e.kind, e.recipe_id ?? null, e.recipe_source ?? null, e.ingredient_id ?? null,
          e.ready_meal_id ?? null, e.label ?? null, e.amount ?? null, e.unit ?? '', e.count ?? 1, e.servings ?? 2,
          e.notes ?? null, e.created_at],
      );
    }
  });
}

export async function replaceShoppingItems(items: ShoppingItem[]): Promise<void> {
  const db = requireSql();
  await runQueuedTransaction(db, async () => {
    await db.runAsync('DELETE FROM shopping_item');
    for (const i of items) {
      await db.runAsync(
        `INSERT INTO shopping_item (id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [i.id, i.recipe_id ?? null, i.recipe_title ?? null, i.ingredient_text, i.name, i.amount, i.unit,
          i.checked ? 1 : 0, i.category, i.created_at],
      );
    }
  });
}

export async function replaceFavorites(recipeIds: string[]): Promise<void> {
  const db = requireSql();
  await runQueuedTransaction(db, async () => {
    await db.runAsync('DELETE FROM favorite');
    for (const id of recipeIds) {
      await db.runAsync('INSERT INTO favorite (recipe_id, created_at) VALUES (?, ?)', [id, Date.now()]);
    }
  });
}

export async function replaceRecipeNotes(notes: Record<string, string>): Promise<void> {
  const db = requireSql();
  const now = Date.now();
  await runQueuedTransaction(db, async () => {
    await db.runAsync('DELETE FROM recipe_note');
    for (const [recipeId, text] of Object.entries(notes)) {
      await db.runAsync('INSERT INTO recipe_note (recipe_id, notes, updated_at) VALUES (?, ?, ?)', [recipeId, text, now]);
    }
  });
}
