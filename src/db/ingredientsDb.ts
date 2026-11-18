import {
  INGREDIENT_TAGS,
  INGREDIENT_TYPES,
  NUTRIENTS,
  type Ingredient,
  type IngredientTag,
  type IngredientType,
} from '../types/catalog';
import { normalizeNutrients, type Nutrients } from '../utils/nutrientValues';
import { getWebData, isWebMode, requireDb, runInTransaction, setWebData, WEB_STORAGE_KEYS } from './database';
import { normalizeIngredientName } from '../utils/catalogNameMatch';

export type IngredientInput = Omit<Ingredient, 'id' | 'created_at' | 'updated_at'> & { aliases?: string[] };
export type SaveIngredientInput = IngredientInput & { id?: string };

const TYPE_SET = new Set<string>(INGREDIENT_TYPES);
const TAG_SET = new Set<string>(INGREDIENT_TAGS);

// In-memory cache of listIngredients (planner and shopping suggestions). Invalidated by every write
// to ingredients and ingredient_nutrition. The version avoids saving a read that started before a write.
let ingredientsCache: Ingredient[] | null = null;
let ingredientsCacheVersion = 0;

function invalidateIngredientsCache(): void {
  ingredientsCache = null;
  ingredientsCacheVersion++;
}

/** Changes on every cache invalidation: lets callers know whether the ingredients changed. */
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

// A single multi-row INSERT per ingredient: 16 nutrients do not become 16 round trips to SQLite
// Nutrients are one row per ingredient with one column per nutrient (NUTRIENTS): a missing value is NULL
async function insertNutrientRows(db: any, id: string, nutrients: Nutrients): Promise<void> {
  if (Object.keys(nutrients).length === 0) return;
  const columns = NUTRIENTS.join(', ');
  const placeholders = NUTRIENTS.map(() => '?').join(', ');
  const params = [id, ...NUTRIENTS.map(n => nutrients[n] ?? null)];
  await db.runAsync(
    `INSERT INTO ingredient_nutrition (ingredient_id, ${columns}) VALUES (?, ${placeholders})`,
    params,
  );
}

// Alias keys grouped by ingredient id
function aliasesByIdOf(rows: any[]): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const r of rows) byId.set(r.ingredient_id, [...(byId.get(r.ingredient_id) ?? []), r.alias_key]);
  return byId;
}

// The wide row back to the nutrients object (only the values present)
function nutrientsOfRow(row: any): Nutrients {
  const nutrients: Nutrients = {};
  for (const n of NUTRIENTS) {
    if (typeof row?.[n] === 'number') nutrients[n] = row[n];
  }
  return nutrients;
}

// Aliases point to the ingredient: a later import or search resolves the name through this table.
// The aliases the user saved replace every alias of the ingredient
async function replaceUserAliasRows(db: any, ingredientId: string, aliases: string[]): Promise<void> {
  await db.runAsync('DELETE FROM ingredient_alias WHERE ingredient_id = ?', [ingredientId]);
  for (const alias of aliases) {
    const aliasKey = normalizeIngredientName(alias);
    if (!aliasKey) continue;
    await db.runAsync("INSERT OR REPLACE INTO ingredient_alias (alias_key, ingredient_id, source) VALUES (?, ?, 'user')", [aliasKey, ingredientId]);
  }
}

// A seed re-run replaces only the seed aliases of the ingredient, and never takes a key the user owns
async function replaceSeedAliasRows(db: any, ingredientId: string, aliases: string[]): Promise<void> {
  await db.runAsync("DELETE FROM ingredient_alias WHERE ingredient_id = ? AND source = 'seed'", [ingredientId]);
  for (const alias of aliases) {
    const aliasKey = normalizeIngredientName(alias);
    if (!aliasKey) continue;
    await db.runAsync(
      `INSERT INTO ingredient_alias (alias_key, ingredient_id, source) VALUES (?, ?, 'seed')
       ON CONFLICT(alias_key) DO UPDATE SET ingredient_id = excluded.ingredient_id, source = 'seed'
       WHERE ingredient_alias.source = 'seed'`,
      [aliasKey, ingredientId],
    );
  }
}

async function replaceNutrientRows(db: any, id: string, nutrients: Nutrients): Promise<void> {
  await db.runAsync('DELETE FROM ingredient_nutrition WHERE ingredient_id = ?', [id]);
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
    const rows: any[] = await db.getAllAsync('SELECT * FROM ingredient');
    const nutrientRows: any[] = await db.getAllAsync('SELECT * FROM ingredient_nutrition');
    const byId = new Map<string, Nutrients>();
    for (const r of nutrientRows) byId.set(r.ingredient_id, nutrientsOfRow(r));
    const aliasRows: any[] = await db.getAllAsync('SELECT alias_key, ingredient_id FROM ingredient_alias');
    const aliasesById = aliasesByIdOf(aliasRows);
    const list = sortByName(rows.map(r => ({
      ...rowToIngredient(r, byId.get(r.id) ?? {}),
      aliases: aliasesById.get(r.id) ?? [],
    })));
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
    const row: any = await db.getFirstAsync('SELECT * FROM ingredient WHERE id = ?', [id]);
    if (!row) return null;
    const nutrientRow: any = await db.getFirstAsync('SELECT * FROM ingredient_nutrition WHERE ingredient_id = ?', [id]);
    const aliasRows: any[] = await db.getAllAsync('SELECT alias_key, ingredient_id FROM ingredient_alias WHERE ingredient_id = ?', [id]);
    return { ...rowToIngredient(row, nutrientsOfRow(nutrientRow)), aliases: aliasRows.map(r => r.alias_key) };
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
        `INSERT INTO ingredient
          (id, name, name_key, type, tags, edible_alone, default_amount, default_unit, purchase_amount, purchase_unit, density_g_per_ml, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, name_key = excluded.name_key, type = excluded.type, tags = excluded.tags,
          edible_alone = excluded.edible_alone, default_amount = excluded.default_amount,
          default_unit = excluded.default_unit, purchase_amount = excluded.purchase_amount,
          purchase_unit = excluded.purchase_unit, density_g_per_ml = excluded.density_g_per_ml,
          updated_at = excluded.updated_at`,
        [
          id,
          ingredient.name,
          nameKey(ingredient.name),
          ingredient.type,
          JSON.stringify(ingredient.tags),
          ingredient.edible_alone ? 1 : 0,
          ingredient.default_amount,
          ingredient.default_unit,
          ingredient.purchase_amount,
          ingredient.purchase_unit,
          ingredient.density_g_per_ml,
          'user',
          ingredient.created_at,
          ingredient.updated_at,
        ],
      );
      await replaceNutrientRows(db, id, ingredient.nutrients);
      await replaceUserAliasRows(db, id, ingredient.aliases ?? []);
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
      await db.runAsync('DELETE FROM ingredient WHERE id = ?', [id]);
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
// Seed items carry a stable id, used when present; the name is the fallback for rows without one
export async function upsertIngredientsByName(
  items: (IngredientInput & { id?: string })[],
): Promise<{ inserted: number; updated: number }> {
  const normalized = items.map(item => {
    const data = normalizeInput(item);
    return { id: item.id?.trim() || null, key: nameKey(data.name), data };
  });
  const now = Date.now();

  if (isWebMode()) {
    const list = readWeb();
    const indexById = new Map<string, number>();
    const indexByKey = new Map<string, number>();
    list.forEach((i, idx) => {
      indexById.set(i.id, idx);
      indexByKey.set(nameKey(i.name), idx);
    });
    let inserted = 0;
    let updated = 0;
    for (const { id: seedId, key, data } of normalized) {
      const idx = seedId !== null && indexById.has(seedId) ? indexById.get(seedId) : indexByKey.get(key);
      if (idx !== undefined) {
        const current = list[idx];
        list[idx] = {
          ...current,
          ...data,
          // Union: the aliases the user added survive a re-seed (web has no owner column, see replaceSeedAliasRows)
          aliases: [...new Set([...current.aliases, ...data.aliases])],
          nutrients: Object.keys(data.nutrients).length > 0 ? data.nutrients : current.nutrients,
          updated_at: now,
        };
        updated++;
      } else {
        const id = seedId ?? newIngredientId();
        list.push({ ...data, id, created_at: now, updated_at: now });
        indexById.set(id, list.length - 1);
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
      const existingRows: any[] = await db.getAllAsync('SELECT id, name FROM ingredient');
      const existingIds = new Set<string>(existingRows.map(r => r.id));
      const idByKey = new Map<string, string>();
      for (const r of existingRows) idByKey.set(nameKey(r.name), r.id);

      let inserted = 0;
      let updated = 0;
      for (const { id: seedId, key, data } of normalized) {
        const existingId = seedId !== null && existingIds.has(seedId) ? seedId : idByKey.get(key);
        if (existingId) {
          await db.runAsync(
            `UPDATE ingredient
             SET name = ?, name_key = ?, type = ?, tags = ?, edible_alone = ?, default_amount = ?,
                 default_unit = ?, purchase_amount = ?, purchase_unit = ?, density_g_per_ml = ?, updated_at = ?
             WHERE id = ?`,
            [
              data.name,
              key,
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
          await replaceSeedAliasRows(db, existingId, data.aliases);
          updated++;
        } else {
          const id = seedId ?? newIngredientId();
          await db.runAsync(
            `INSERT INTO ingredient
              (id, name, name_key, type, tags, edible_alone, default_amount, default_unit, purchase_amount, purchase_unit, density_g_per_ml, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              data.name,
              key,
              data.type,
              JSON.stringify(data.tags),
              data.edible_alone ? 1 : 0,
              data.default_amount,
              data.default_unit,
              data.purchase_amount,
              data.purchase_unit,
              data.density_g_per_ml,
              'seed',
              now,
              now,
            ],
          );
          await insertNutrientRows(db, id, data.nutrients);
          await replaceSeedAliasRows(db, id, data.aliases);
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

// Ingredients created while importing a recipe book, and the aliases given by the user's choices.
// Both must be written in the same transaction as the recipes (native) or right after them (web).
export interface ImportIngredientPlan {
  created: { id: string; name: string }[];
  aliases: { key: string; ingredientId: string }[];
}

export async function writeImportIngredientsInTx(db: any, plan: ImportIngredientPlan): Promise<void> {
  const now = Date.now();
  for (const item of plan.created) {
    await db.runAsync(
      `INSERT INTO ingredient
        (id, name, name_key, type, tags, edible_alone, default_amount, default_unit, purchase_amount, purchase_unit, density_g_per_ml, source, created_at, updated_at)
       VALUES (?, ?, ?, 'altro', '[]', 0, NULL, '', NULL, '', NULL, 'user', ?, ?)`,
      [item.id, item.name, nameKey(item.name), now, now],
    );
  }
  for (const alias of plan.aliases) {
    await db.runAsync("INSERT OR REPLACE INTO ingredient_alias (alias_key, ingredient_id, source) VALUES (?, ?, 'user')", [alias.key, alias.ingredientId]);
  }
}

export async function writeImportIngredientsWeb(plan: ImportIngredientPlan): Promise<void> {
  const now = Date.now();
  const list = readWeb();
  for (const item of plan.created) {
    list.push({
      id: item.id, aliases: [], name: item.name, type: 'altro', tags: [], edible_alone: false,
      default_amount: null, default_unit: '', purchase_amount: null, purchase_unit: '',
      density_g_per_ml: null, nutrients: {}, created_at: now, updated_at: now,
    });
  }
  for (const alias of plan.aliases) {
    const target = list.find(i => i.id === alias.ingredientId);
    if (target && !target.aliases.includes(alias.key)) target.aliases = [...target.aliases, alias.key];
  }
  writeWeb(list);
  invalidateIngredientsCache();
}
