import {
  INGREDIENT_TAGS,
  INGREDIENT_TYPES,
  NUTRIENTS,
  type Ingredient,
  type IngredientTag,
  type IngredientType,
  type Nutrient,
} from '../types/catalog';
import { getDatabase, getWebData, isWebMode, runQueuedTransaction, setWebData, WEB_STORAGE_KEYS } from './database';

type Nutrients = Partial<Record<Nutrient, number>>;
export type IngredientInput = Omit<Ingredient, 'id' | 'created_at' | 'updated_at'> & { aliases?: string[] };
export type SaveIngredientInput = IngredientInput & { id?: string };

const TYPE_SET = new Set<string>(INGREDIENT_TYPES);
const TAG_SET = new Set<string>(INGREDIENT_TAGS);
const NUTRIENT_SET = new Set<string>(NUTRIENTS);

// Cache in memoria di listIngredients (planner e suggerimenti spesa). Invalidata da ogni scrittura
// su ingredients e ingredient_nutrients. La versione evita di salvare una lettura iniziata prima di una scrittura.
let ingredientsCache: Ingredient[] | null = null;
let ingredientsCacheVersion = 0;

function invalidateIngredientsCache(): void {
  ingredientsCache = null;
  ingredientsCacheVersion++;
}

/** Cambia a ogni invalidazione della cache: permette ai chiamanti di sapere se gli ingredienti sono cambiati. */
export function getIngredientsCacheVersion(): number {
  return ingredientsCacheVersion;
}

function newIngredientId(): string {
  return `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
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

function normalizeTags(tags: unknown): IngredientTag[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is IngredientTag => typeof t === 'string' && TAG_SET.has(t));
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

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Validates and normalizes user or import input. Throws on invalid name or type. */
function normalizeInput(input: IngredientInput): IngredientInput {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('name_required');
  if (!TYPE_SET.has(input.type)) throw new Error('invalid_type');
  return {
    name,
    type: input.type,
    tags: normalizeTags(input.tags),
    edible_alone: !!input.edible_alone,
    default_amount: optionalNumber(input.default_amount),
    default_unit: (input.default_unit ?? '').trim(),
    purchase_amount: optionalNumber(input.purchase_amount),
    purchase_unit: (input.purchase_unit ?? '').trim(),
    density_g_per_ml: optionalNumber(input.density_g_per_ml),
    nutrients: normalizeNutrients(input.nutrients),
    aliases: Array.isArray(input.aliases) ? input.aliases : [],
  };
}

function sortByName(list: Ingredient[]): Ingredient[] {
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

function readWeb(): Ingredient[] {
  return getWebData<Ingredient[]>(WEB_STORAGE_KEYS.INGREDIENTS, []);
}

function writeWeb(list: Ingredient[]): void {
  setWebData(WEB_STORAGE_KEYS.INGREDIENTS, list);
}

function rowToIngredient(row: any, nutrients: Nutrients): Ingredient {
  return {
    id: row.id,
    name: row.name,
    type: row.type as IngredientType,
    tags: normalizeTags(safeParseJson<unknown>(row.tags, [])),
    edible_alone: !!row.edible_alone,
    default_amount: optionalNumber(row.default_amount),
    default_unit: row.default_unit ?? '',
    purchase_amount: optionalNumber(row.purchase_amount),
    purchase_unit: row.purchase_unit ?? '',
    density_g_per_ml: optionalNumber(row.density_g_per_ml),
    nutrients,
    aliases: safeParseJson<unknown>(row.aliases, []) as string[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function insertNutrientRows(db: any, id: string, nutrients: Nutrients): Promise<void> {
  for (const [nutrient, value] of Object.entries(nutrients)) {
    await db.runAsync(
      'INSERT INTO ingredient_nutrients (ingredient_id, nutrient, value) VALUES (?, ?, ?)',
      [id, nutrient, value],
    );
  }
}

async function replaceNutrientRows(db: any, id: string, nutrients: Nutrients): Promise<void> {
  await db.runAsync('DELETE FROM ingredient_nutrients WHERE ingredient_id = ?', [id]);
  await insertNutrientRows(db, id, nutrients);
}

export async function listIngredients(): Promise<Ingredient[]> {
  if (ingredientsCache) return [...ingredientsCache];
  const version = ingredientsCacheVersion;
  if (isWebMode()) {
    const list = sortByName(readWeb());
    if (version === ingredientsCacheVersion) ingredientsCache = list;
    return [...list];
  }
  const db = requireDb();
  try {
    const rows: any[] = await db.getAllAsync('SELECT * FROM ingredients');
    const nutrientRows: any[] = await db.getAllAsync(
      'SELECT ingredient_id, nutrient, value FROM ingredient_nutrients',
    );
    const byId = new Map<string, Nutrients>();
    for (const r of nutrientRows) {
      if (!NUTRIENT_SET.has(r.nutrient) || typeof r.value !== 'number') continue;
      const current = byId.get(r.ingredient_id) ?? {};
      current[r.nutrient as Nutrient] = r.value;
      byId.set(r.ingredient_id, current);
    }
    const list = sortByName(rows.map(r => rowToIngredient(r, byId.get(r.id) ?? {})));
    if (version === ingredientsCacheVersion) ingredientsCache = list;
    return [...list];
  } catch (e) {
    console.error('listIngredients error', e);
    throw e;
  }
}

export async function getIngredient(id: string): Promise<Ingredient | null> {
  if (isWebMode()) {
    return readWeb().find(i => i.id === id) ?? null;
  }
  const db = requireDb();
  try {
    const row: any = await db.getFirstAsync('SELECT * FROM ingredients WHERE id = ?', [id]);
    if (!row) return null;
    const nutrientRows: any[] = await db.getAllAsync(
      'SELECT nutrient, value FROM ingredient_nutrients WHERE ingredient_id = ?',
      [id],
    );
    const nutrients: Nutrients = {};
    for (const r of nutrientRows) {
      if (NUTRIENT_SET.has(r.nutrient) && typeof r.value === 'number') {
        nutrients[r.nutrient as Nutrient] = r.value;
      }
    }
    return rowToIngredient(row, nutrients);
  } catch (e) {
    console.error('getIngredient error', e);
    throw e;
  }
}

export async function saveIngredient(input: SaveIngredientInput): Promise<Ingredient> {
  const normalized = normalizeInput(input);
  const id = input.id?.trim() || newIngredientId();
  const existing = input.id ? await getIngredient(id) : null;
  const now = Date.now();
  const ingredient: Ingredient = {
    ...normalized,
    id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  if (isWebMode()) {
    const list = readWeb().filter(i => i.id !== id);
    list.push(ingredient);
    writeWeb(list);
    invalidateIngredientsCache();
    return ingredient;
  }

  const db = requireDb();
  try {
    await runInTransaction(db, async () => {
      await db.runAsync(
        `INSERT OR REPLACE INTO ingredients
          (id, name, type, tags, edible_alone, default_amount, default_unit, purchase_amount, purchase_unit, density_g_per_ml, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          ingredient.name,
          ingredient.type,
          JSON.stringify(ingredient.tags),
          ingredient.edible_alone ? 1 : 0,
          ingredient.default_amount,
          ingredient.default_unit,
          ingredient.purchase_amount,
          ingredient.purchase_unit,
          ingredient.density_g_per_ml,
          ingredient.created_at,
          ingredient.updated_at,
        ],
      );
      await replaceNutrientRows(db, id, ingredient.nutrients);
    });
    return ingredient;
  } catch (e) {
    console.error('saveIngredient error', e);
    throw e;
  } finally {
    invalidateIngredientsCache();
  }
}

export async function deleteIngredient(id: string): Promise<void> {
  if (isWebMode()) {
    writeWeb(readWeb().filter(i => i.id !== id));
    setWebData(WEB_STORAGE_KEYS.PLANNER, getWebData<any[]>(WEB_STORAGE_KEYS.PLANNER, []).filter(p => p.ingredient_id !== id));
    setWebData(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, getWebData<any[]>(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, []).filter(r => r.ingredient_id !== id));
    invalidateIngredientsCache();
    return;
  }
  const db = requireDb();
  try {
    await runInTransaction(db, async () => {
      await db.runAsync('DELETE FROM meal_plan WHERE ingredient_id = ?', [id]);
      await db.runAsync('DELETE FROM recipe_ingredients WHERE ingredient_id = ?', [id]);
      await db.runAsync('DELETE FROM ingredient_nutrients WHERE ingredient_id = ?', [id]);
      await db.runAsync('DELETE FROM ingredients WHERE id = ?', [id]);
    });
  } catch (e) {
    console.error('deleteIngredient error', e);
    throw e;
  } finally {
    invalidateIngredientsCache();
  }
}

/**
 * Inserts or updates ingredients matched by name (case-insensitive).
 * On update, nutrients are replaced only when the item carries at least one nutrient.
 * Ids and created_at of existing rows are kept. The whole batch is atomic.
 */
export async function upsertIngredientsByName(
  items: IngredientInput[],
): Promise<{ inserted: number; updated: number }> {
  const normalized = items.map(item => {
    const data = normalizeInput(item);
    return { key: nameKey(data.name), data };
  });
  const now = Date.now();

  if (isWebMode()) {
    const list = readWeb();
    const indexByKey = new Map<string, number>();
    list.forEach((i, idx) => indexByKey.set(nameKey(i.name), idx));
    let inserted = 0;
    let updated = 0;
    for (const { key, data } of normalized) {
      const idx = indexByKey.get(key);
      if (idx !== undefined) {
        const current = list[idx];
        list[idx] = {
          ...current,
          ...data,
          nutrients: Object.keys(data.nutrients).length > 0 ? data.nutrients : current.nutrients,
          updated_at: now,
        };
        updated++;
      } else {
        const id = newIngredientId();
        list.push({ ...data, id, created_at: now, updated_at: now });
        indexByKey.set(key, list.length - 1);
        inserted++;
      }
    }
    writeWeb(list);
    invalidateIngredientsCache();
    return { inserted, updated };
  }

  const db = requireDb();
  try {
    return await runInTransaction(db, async () => {
      const existingRows: any[] = await db.getAllAsync('SELECT id, name FROM ingredients');
      const idByKey = new Map<string, string>();
      for (const r of existingRows) idByKey.set(nameKey(r.name), r.id);

      let inserted = 0;
      let updated = 0;
      for (const { key, data } of normalized) {
        const existingId = idByKey.get(key);
        if (existingId) {
          await db.runAsync(
            `UPDATE ingredients
             SET name = ?, type = ?, tags = ?, edible_alone = ?, default_amount = ?,
                 default_unit = ?, purchase_amount = ?, purchase_unit = ?, density_g_per_ml = ?, updated_at = ?
             WHERE id = ?`,
            [
              data.name,
              data.type,
              JSON.stringify(data.tags),
              data.edible_alone ? 1 : 0,
              data.default_amount,
              data.default_unit,
              data.purchase_amount,
              data.purchase_unit,
              data.density_g_per_ml,
              now,
              existingId,
            ],
          );
          if (Object.keys(data.nutrients).length > 0) {
            await replaceNutrientRows(db, existingId, data.nutrients);
          }
          updated++;
        } else {
          const id = newIngredientId();
          await db.runAsync(
            `INSERT INTO ingredients
              (id, name, type, tags, edible_alone, default_amount, default_unit, purchase_amount, purchase_unit, density_g_per_ml, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              data.name,
              data.type,
              JSON.stringify(data.tags),
              data.edible_alone ? 1 : 0,
              data.default_amount,
              data.default_unit,
              data.purchase_amount,
              data.purchase_unit,
              data.density_g_per_ml,
              now,
              now,
            ],
          );
          await insertNutrientRows(db, id, data.nutrients);
          idByKey.set(key, id);
          inserted++;
        }
      }
      return { inserted, updated };
    });
  } catch (e) {
    console.error('upsertIngredientsByName error', e);
    throw e;
  } finally {
    invalidateIngredientsCache();
  }
}

/** Exact name match, case-insensitive, trimmed. */
export async function findIngredientByName(name: string): Promise<Ingredient | null> {
  const key = nameKey(name);
  if (!key) return null;
  const all = await listIngredients();
  return all.find(i => nameKey(i.name) === key) ?? null;
}
