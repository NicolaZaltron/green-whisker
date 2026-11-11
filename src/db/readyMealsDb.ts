import {
  NUTRIENTS,
  READY_MEAL_CATEGORIES,
  type Nutrient,
  type ReadyMeal,
  type ReadyMealCategory,
} from '../types/catalog';
import { getDatabase, getWebData, isWebMode, runQueuedTransaction, setWebData, WEB_STORAGE_KEYS } from './database';
import type { MealPlanEntry } from '../types/recipe';

type Nutrients = Partial<Record<Nutrient, number>>;
export type ReadyMealInput = Omit<ReadyMeal, 'id' | 'created_at' | 'updated_at'>;
export type SaveReadyMealInput = ReadyMealInput & { id?: string };

const CATEGORY_SET = new Set<string>(READY_MEAL_CATEGORIES);
const NUTRIENT_SET = new Set<string>(NUTRIENTS);

function newReadyMealId(): string {
  return `rm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

function normalizeNutrients(input: unknown): Nutrients {
  const out: Nutrients = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (NUTRIENT_SET.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      out[key as Nutrient] = value;
    }
  }
  return out;
}

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

/** Validates and normalizes input. Throws on invalid name or category. */
function normalizeInput(input: ReadyMealInput): ReadyMealInput {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('name_required');
  if (!CATEGORY_SET.has(input.category)) throw new Error('invalid_category');
  return {
    name,
    category: input.category,
    tags: normalizeStringList(input.tags),
    slots: normalizeStringList(input.slots),
    default_count: normalizeCount(input.default_count),
    nutrients: normalizeNutrients(input.nutrients),
  };
}

function sortByName(list: ReadyMeal[]): ReadyMeal[] {
  return list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

function requireDb(): any {
  const db = getDatabase();
  if (!db) throw new Error('database_unavailable');
  return db;
}

function runInTransaction<T>(db: any, fn: () => Promise<T>): Promise<T> {
  if (typeof db.withTransactionAsync === 'function') return runQueuedTransaction(db, fn);
  return fn();
}

function readWeb(): ReadyMeal[] {
  return getWebData<ReadyMeal[]>(WEB_STORAGE_KEYS.READY_MEALS, []);
}

function writeWeb(list: ReadyMeal[]): void {
  setWebData(WEB_STORAGE_KEYS.READY_MEALS, list);
}

function rowToReadyMeal(row: any): ReadyMeal {
  return {
    id: row.id,
    name: row.name,
    category: (CATEGORY_SET.has(row.category) ? row.category : 'pronto') as ReadyMealCategory,
    tags: normalizeStringList(safeParseJson<unknown>(row.tags, [])),
    slots: normalizeStringList(safeParseJson<unknown>(row.slots, [])),
    default_count: normalizeCount(row.default_count),
    nutrients: normalizeNutrients(safeParseJson<unknown>(row.nutrients, {})),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Returns all ready meals sorted by name. */
export async function listReadyMeals(): Promise<ReadyMeal[]> {
  if (isWebMode()) {
    return sortByName(readWeb());
  }
  const db = requireDb();
  try {
    const rows: any[] = await db.getAllAsync('SELECT * FROM ready_meals');
    return sortByName(rows.map(rowToReadyMeal));
  } catch (e) {
    console.error('listReadyMeals error', e);
    throw e;
  }
}

/** Creates or updates a ready meal. Returns the saved record. */
export async function saveReadyMeal(input: SaveReadyMealInput): Promise<ReadyMeal> {
  const normalized = normalizeInput(input);
  const id = input.id?.trim() || newReadyMealId();
  const existing = input.id ? (await listReadyMeals()).find(m => m.id === id) ?? null : null;
  const now = Date.now();
  const meal: ReadyMeal = {
    ...normalized,
    id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  if (isWebMode()) {
    const list = readWeb().filter(m => m.id !== id);
    list.push(meal);
    writeWeb(list);
    return meal;
  }

  const db = requireDb();
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO ready_meals
        (id, name, category, tags, slots, default_count, nutrients, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        meal.id,
        meal.name,
        meal.category,
        JSON.stringify(meal.tags),
        JSON.stringify(meal.slots),
        meal.default_count,
        JSON.stringify(meal.nutrients),
        meal.created_at,
        meal.updated_at,
      ],
    );
    return meal;
  } catch (e) {
    console.error('saveReadyMeal error', e);
    throw e;
  }
}

/** Deletes a ready meal by id. */
export async function deleteReadyMeal(id: string): Promise<void> {
  if (isWebMode()) {
    setWebData(WEB_STORAGE_KEYS.PLANNER, getWebData<any[]>(WEB_STORAGE_KEYS.PLANNER, []).filter(p => p.ready_meal_id !== id));
    writeWeb(readWeb().filter(m => m.id !== id));
    return;
  }
  const db = requireDb();
  try {
    await runQueuedTransaction(db, async () => {
      await db.runAsync('DELETE FROM meal_plan WHERE ready_meal_id = ?', [id]);
      await db.runAsync('DELETE FROM ready_meals WHERE id = ?', [id]);
    });
  } catch (e) {
    console.error('deleteReadyMeal error', e);
    throw e;
  }
}

/** Deletes all ready meals and inserts the given ones. Returns the number inserted. */
export async function replaceReadyMeals(items: ReadyMealInput[]): Promise<number> {
  const now = Date.now();
  const meals: ReadyMeal[] = items.map(item => ({
    ...normalizeInput(item),
    id: newReadyMealId(),
    created_at: now,
    updated_at: now,
  }));

  // I pianificati da pronti puntano agli id vecchi: vanno rimossi insieme al catalogo
  if (isWebMode()) {
    writeWeb(meals);
    const planner = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, planner.filter(e => e.kind !== 'ready' && !e.ready_meal_id));
    return meals.length;
  }

  const db = requireDb();
  try {
    await runInTransaction(db, async () => {
      await db.runAsync("DELETE FROM meal_plan WHERE kind = 'ready'");
      await db.runAsync('DELETE FROM ready_meals');
      for (const meal of meals) {
        await db.runAsync(
          `INSERT INTO ready_meals
            (id, name, category, tags, slots, default_count, nutrients, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            meal.id,
            meal.name,
            meal.category,
            JSON.stringify(meal.tags),
            JSON.stringify(meal.slots),
            meal.default_count,
            JSON.stringify(meal.nutrients),
            meal.created_at,
            meal.updated_at,
          ],
        );
      }
    });
    return meals.length;
  } catch (e) {
    console.error('replaceReadyMeals error', e);
    throw e;
  }
}
