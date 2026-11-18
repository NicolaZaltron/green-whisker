import {
  READY_MEAL_CATEGORIES,
  type ReadyMeal,
  type ReadyMealCategory,
} from '../types/catalog';
import { normalizeNutrients } from '../utils/nutrientValues';
import { getWebData, isWebMode, requireDb, runInTransaction, runQueuedTransaction, setWebData, WEB_STORAGE_KEYS } from './database';

export type ReadyMealInput = Omit<ReadyMeal, 'id' | 'created_at' | 'updated_at'>;
export type SaveReadyMealInput = ReadyMealInput & { id?: string };

const CATEGORY_SET = new Set<string>(READY_MEAL_CATEGORIES);

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
    const rows: any[] = await db.getAllAsync('SELECT * FROM ready_meal');
    return sortByName(rows.map(rowToReadyMeal));
  } catch (e) {
    console.error('listReadyMeals error', e);
    throw e;
  }
}

/** Creation date of a ready meal already saved, or null if it is new. */
async function readCreatedAt(id: string): Promise<number | null> {
  if (isWebMode()) return (await listReadyMeals()).find(m => m.id === id)?.created_at ?? null;
  const row: { created_at: number } | null = await requireDb().getFirstAsync('SELECT created_at FROM ready_meal WHERE id = ?', [id]);
  return row?.created_at ?? null;
}

/** Creates or updates a ready meal. Returns the saved record. */
export async function saveReadyMeal(input: SaveReadyMealInput): Promise<ReadyMeal> {
  const normalized = normalizeInput(input);
  const id = input.id?.trim() || newReadyMealId();
  // Only the creation date of this row is needed: the native read is one row, the web read stays on the list
  const existingCreatedAt = input.id ? await readCreatedAt(id) : null;
  const now = Date.now();
  const meal: ReadyMeal = {
    ...normalized,
    id,
    created_at: existingCreatedAt ?? now,
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
      `INSERT INTO ready_meal
        (id, name, category, tags, slots, default_count, nutrients, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, category = excluded.category, tags = excluded.tags, slots = excluded.slots,
        default_count = excluded.default_count, nutrients = excluded.nutrients, updated_at = excluded.updated_at`,
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
      await db.runAsync('DELETE FROM ready_meal WHERE id = ?', [id]);
    });
  } catch (e) {
    console.error('deleteReadyMeal error', e);
    throw e;
  }
}

/** Deletes all ready meals and inserts the given ones. Returns the number inserted. */
export type SeedReadyMealInput = ReadyMealInput & { id: string };

// Upserts the seed by id: planned entries keep pointing to the same ready meal, nothing is deleted
export async function upsertReadyMeals(items: SeedReadyMealInput[]): Promise<number> {
  const now = Date.now();

  if (isWebMode()) {
    const list = readWeb();
    for (const item of items) {
      const data = normalizeInput(item);
      const idx = list.findIndex(m => m.id === item.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...data, updated_at: now };
      else list.push({ ...data, id: item.id, created_at: now, updated_at: now });
    }
    writeWeb(list);
    return items.length;
  }

  const db = requireDb();
  try {
    await runInTransaction(db, async () => {
      for (const item of items) {
        const data = normalizeInput(item);
        await db.runAsync(
          `INSERT INTO ready_meal
            (id, name, category, tags, slots, default_count, nutrients, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, category = excluded.category, tags = excluded.tags, slots = excluded.slots,
            default_count = excluded.default_count, nutrients = excluded.nutrients, updated_at = excluded.updated_at`,
          [
            item.id,
            data.name,
            data.category,
            JSON.stringify(data.tags),
            JSON.stringify(data.slots),
            data.default_count,
            JSON.stringify(data.nutrients),
            now,
            now,
          ],
        );
      }
    });
    return items.length;
  } catch (e) {
    console.error('upsertReadyMeals error', e);
    throw e;
  }
}
