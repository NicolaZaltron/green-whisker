import { Platform } from 'react-native';
import { Recipe, ShoppingItem, MealPlanEntry } from '../types/recipe';
import { cleanShoppingIngredientText } from '../utils/servingsScaler';
import { classifyShoppingDepartment } from '../utils/shoppingClassifier';
import {
  normalizeIngredientKey,
  cleanSupermarketIngredientName,
  formatSupermarketIngredientText,
  accumulateSupermarketItem,
  mergeRecipeTitles,
  ConsolidatedSupermarketItem,
} from '../utils/ingredientAggregator';

let dbInstance: any = null;
let isWebFallback = false;

// Fallback in-memory/localStorage store for Web if SQLite WASM is unavailable
const WEB_STORAGE_KEYS = {
  FAVORITES: 'gw_favorites',
  SHOPPING: 'gw_shopping',
  PLANNER: 'gw_planner',
  NOTES: 'gw_notes',
  PLANNER_PREFS: 'gw_planner_prefs',
  PLANNER_LAST_GEN: 'gw_planner_last_gen',
  CUSTOM_RECIPES: 'gw_custom_recipes',
};

function getWebData<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    }
  } catch (e) {
    console.warn('Error reading from localStorage', e);
  }
  return defaultValue;
}

function setWebData<T>(key: string, value: T): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {
    console.warn('Error saving to localStorage', e);
  }
}

export async function initDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    isWebFallback = true;
    return;
  }

  try {
    const SQLite = await import('expo-sqlite');
    dbInstance = await SQLite.openDatabaseAsync('greenwhisker.db');

    await dbInstance.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS favorites (
        recipe_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shopping_items (
        id TEXT PRIMARY KEY,
        recipe_id TEXT,
        recipe_title TEXT,
        ingredient_text TEXT NOT NULL,
        name TEXT NOT NULL,
        amount REAL,
        unit TEXT,
        checked INTEGER NOT NULL DEFAULT 0,
        category TEXT NOT NULL DEFAULT 'Dispensa',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meal_plan (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        slot TEXT NOT NULL,
        recipe_id TEXT NOT NULL,
        side_recipe_id TEXT,
        servings INTEGER NOT NULL DEFAULT 2,
        notes TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recipe_notes (
        recipe_id TEXT PRIMARY KEY,
        notes TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_meal_plan_date ON meal_plan(date);

      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS custom_recipes (
        id TEXT PRIMARY KEY,
        json_data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // Migrazione safe per database esistenti dove la colonna non era ancora presente
    try {
      await dbInstance.execAsync('ALTER TABLE meal_plan ADD COLUMN side_recipe_id TEXT;');
    } catch {
      // Ignora: colonna già esistente
    }
  } catch (error) {
    console.warn('SQLite init failed, falling back to local storage:', error);
    isWebFallback = true;
  }
}

// --- FAVORITES ---
export async function getFavoriteIds(): Promise<string[]> {
  if (isWebFallback || !dbInstance) {
    return getWebData<string[]>(WEB_STORAGE_KEYS.FAVORITES, []);
  }

  try {
    const rows = await dbInstance.getAllAsync('SELECT recipe_id FROM favorites ORDER BY created_at DESC');
    return rows.map((r: any) => r.recipe_id);
  } catch (e) {
    console.error('getFavoriteIds error', e);
    return [];
  }
}

export async function isFavorite(recipeId: string): Promise<boolean> {
  if (isWebFallback || !dbInstance) {
    const favs = getWebData<string[]>(WEB_STORAGE_KEYS.FAVORITES, []);
    return favs.includes(recipeId);
  }

  try {
    const row = await dbInstance.getFirstAsync('SELECT recipe_id FROM favorites WHERE recipe_id = ?', [recipeId]);
    return !!row;
  } catch (e) {
    console.error('isFavorite error', e);
    return false;
  }
}

export async function toggleFavorite(recipeId: string): Promise<boolean> {
  const currentlyFav = await isFavorite(recipeId);

  if (isWebFallback || !dbInstance) {
    let favs = getWebData<string[]>(WEB_STORAGE_KEYS.FAVORITES, []);
    if (currentlyFav) {
      favs = favs.filter(id => id !== recipeId);
    } else {
      favs = [recipeId, ...favs];
    }
    setWebData(WEB_STORAGE_KEYS.FAVORITES, favs);
    return !currentlyFav;
  }

  try {
    if (currentlyFav) {
      await dbInstance.runAsync('DELETE FROM favorites WHERE recipe_id = ?', [recipeId]);
      return false;
    } else {
      await dbInstance.runAsync('INSERT INTO favorites (recipe_id, created_at) VALUES (?, ?)', [recipeId, Date.now()]);
      return true;
    }
  } catch (e) {
    console.error('toggleFavorite error', e);
    return currentlyFav;
  }
}

// --- SHOPPING LIST ---
export async function getShoppingItems(): Promise<ShoppingItem[]> {
  if (isWebFallback || !dbInstance) {
    const items = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    return items.map(item => ({
      ...item,
      category: classifyShoppingDepartment(item.name || item.ingredient_text, item.category)
    }));
  }

  try {
    const rows = await dbInstance.getAllAsync(`
      SELECT id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at 
      FROM shopping_items 
      ORDER BY checked ASC, created_at DESC
    `);
    return rows.map((r: any) => ({
      ...r,
      checked: Boolean(r.checked),
      category: classifyShoppingDepartment(r.name || r.ingredient_text, r.category)
    }));
  } catch (e) {
    console.error('getShoppingItems error', e);
    return [];
  }
}

export async function addShoppingItems(items: Array<{
  recipeId?: string;
  recipeTitle?: string;
  ingredientText: string;
  name: string;
  amount?: number | null;
  unit?: string;
  category?: string;
}>): Promise<void> {
  if (!items || items.length === 0) return;

  const rawNewItems: ShoppingItem[] = items
    .filter(item => {
      const clean = cleanSupermarketIngredientName(item.name || item.ingredientText);
      const key = normalizeIngredientKey(clean);
      return Boolean(clean) && key !== 'ghiaccio' && key !== 'cubetti di ghiaccio' && key !== 'cubetto di ghiaccio';
    })
    .map(item => {
      const cleanName = cleanSupermarketIngredientName(item.name || item.ingredientText);
      const category = classifyShoppingDepartment(cleanName, item.category);

      return {
        id: `shop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        recipe_id: item.recipeId,
        recipe_title: item.recipeTitle,
        ingredient_text: item.ingredientText || cleanName,
        name: cleanName,
        amount: item.amount ?? null,
        unit: item.unit || '',
        checked: false,
        category,
        created_at: Date.now()
      };
    });

  if (isWebFallback || !dbInstance) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, [...rawNewItems, ...existing]);
    await consolidateShoppingList();
    return;
  }

  try {
    if (typeof (dbInstance as any).withTransactionAsync === 'function') {
      await (dbInstance as any).withTransactionAsync(async () => {
        for (const item of rawNewItems) {
          await dbInstance.runAsync(
            `INSERT INTO shopping_items (id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.recipe_id || null,
              item.recipe_title || null,
              item.ingredient_text,
              item.name,
              item.amount ?? null,
              item.unit || '',
              0,
              item.category,
              item.created_at
            ]
          );
        }
      });
    } else {
      for (const item of rawNewItems) {
        await dbInstance.runAsync(
          `INSERT INTO shopping_items (id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.recipe_id || null,
            item.recipe_title || null,
            item.ingredient_text,
            item.name,
            item.amount ?? null,
            item.unit || '',
            0,
            item.category,
            item.created_at
          ]
        );
      }
    }
    // Consolida e somma immediatamente per evitare duplicati e unità da cucina
    await consolidateShoppingList();
  } catch (e) {
    console.error('addShoppingItems error', e);
  }
}

/**
 * Consolida l'intera lista della spesa:
 * - Unisce gli stessi alimenti (es. "Yogurt di soia", "Pasta sfoglia", "Tofu")
 * - Elimina cucchiai, cucchiaini, pizzichi e milligrammi confusi
 * - Arrotonda per eccesso rotoli, panetti e confezioni (1.3 rotoli -> 2 rotoli)
 * - Somma pesi e volumi in grandezze reali da supermercato
 */
export async function consolidateShoppingList(): Promise<number> {
  const all = await getShoppingItems();
  if (all.length === 0) return 0;

  const unchecked = all.filter(i => !i.checked);
  const checked = all.filter(i => i.checked);

  const groupMap = new Map<string, {
    id?: string;
    cleanName: string;
    category: string;
    recipeTitles: string[];
    weightGrams: number | null;
    volumeMl: number | null;
    discreteCount: number | null;
    discreteUnit: string | null;
    hasKitchenUnitOnly: boolean;
  }>();

  for (const item of unchecked) {
    const cleanName = cleanSupermarketIngredientName(item.name || item.ingredient_text);
    const key = normalizeIngredientKey(cleanName);
    if (!cleanName || key === 'ghiaccio' || key === 'cubetti di ghiaccio' || key === 'cubetto di ghiaccio') {
      continue;
    }
    const category = classifyShoppingDepartment(cleanName, item.category);

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        id: item.id,
        cleanName,
        category,
        recipeTitles: item.recipe_title ? [item.recipe_title] : [],
        weightGrams: null,
        volumeMl: null,
        discreteCount: null,
        discreteUnit: null,
        hasKitchenUnitOnly: false,
      });
    }

    const group = groupMap.get(key)!;
    if (item.recipe_title && !group.recipeTitles.includes(item.recipe_title)) {
      group.recipeTitles.push(item.recipe_title);
    }

    accumulateSupermarketItem(
      group as any,
      item.amount,
      item.unit,
      item.recipe_title,
      item.ingredient_text || item.name
    );
  }

  const consolidatedNewItems: ShoppingItem[] = [];
  for (const group of groupMap.values()) {
    const text = formatSupermarketIngredientText(
      group.cleanName,
      group.discreteCount,
      group.discreteUnit,
      group.weightGrams,
      group.volumeMl,
      group.hasKitchenUnitOnly
    );

    consolidatedNewItems.push({
      id: group.id || `shop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: group.cleanName,
      ingredient_text: text,
      amount: group.discreteCount !== null
        ? Math.max(1, Math.ceil(group.discreteCount))
        : group.weightGrams !== null
        ? (group.weightGrams < 50 ? 50 : Math.round(group.weightGrams / 25) * 25)
        : group.volumeMl !== null
        ? Math.round(group.volumeMl / 25) * 25
        : null,
      unit: group.discreteCount !== null
        ? (group.discreteUnit || '')
        : group.weightGrams !== null
        ? (group.weightGrams >= 1000 ? 'kg' : 'g')
        : group.volumeMl !== null
        ? (group.volumeMl >= 1000 ? 'L' : 'ml')
        : '',
      checked: false,
      category: group.category,
      created_at: Date.now(),
      recipe_title: group.recipeTitles.length > 0 ? group.recipeTitles.join(', ') : undefined,
    });
  }

  const hasChanges = unchecked.length !== consolidatedNewItems.length ||
    unchecked.some((u, idx) => {
      const c = consolidatedNewItems[idx];
      return !c || c.id !== u.id || c.ingredient_text !== u.ingredient_text || c.category !== u.category;
    });

  if (!hasChanges) {
    return consolidatedNewItems.length;
  }

  const fullConsolidated = [...consolidatedNewItems, ...checked];

  if (isWebFallback || !dbInstance) {
    setWebData(WEB_STORAGE_KEYS.SHOPPING, fullConsolidated);
    return consolidatedNewItems.length;
  }

  try {
    const executeConsolidation = async () => {
      // 1. Elimina SOLO gli ingredienti non spuntati oggetto di consolidamento
      // Gli articoli già spuntati nel carrello rimangono intatti e protetti al 100%
      await dbInstance.runAsync('DELETE FROM shopping_items WHERE checked = 0');

      // 2. Inserisce i nuovi articoli consolidati
      for (const item of consolidatedNewItems) {
        await dbInstance.runAsync(
          `INSERT INTO shopping_items (id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.recipe_id || null,
            item.recipe_title || null,
            item.ingredient_text,
            item.name,
            item.amount ?? null,
            item.unit || '',
            0,
            item.category,
            item.created_at
          ]
        );
      }
    };

    if (typeof (dbInstance as any).withTransactionAsync === 'function') {
      await (dbInstance as any).withTransactionAsync(executeConsolidation);
    } else {
      await executeConsolidation();
    }
  } catch (e) {
    console.error('consolidateShoppingList error', e);
  }

  return consolidatedNewItems.length;
}

export async function toggleShoppingItem(id: string): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    const updated = existing.map(item => item.id === id ? { ...item, checked: !item.checked } : item);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, updated);
    return;
  }

  try {
    await dbInstance.runAsync(`UPDATE shopping_items SET checked = 1 - checked WHERE id = ?`, [id]);
  } catch (e) {
    console.error('toggleShoppingItem error', e);
  }
}

export async function deleteShoppingItem(id: string): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, existing.filter(i => i.id !== id));
    return;
  }

  try {
    await dbInstance.runAsync('DELETE FROM shopping_items WHERE id = ?', [id]);
  } catch (e) {
    console.error('deleteShoppingItem error', e);
  }
}

export async function clearCheckedShoppingItems(): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, existing.filter(i => !i.checked));
    return;
  }

  try {
    await dbInstance.runAsync('DELETE FROM shopping_items WHERE checked = 1');
  } catch (e) {
    console.error('clearCheckedShoppingItems error', e);
  }
}

export async function clearAllShoppingItems(): Promise<void> {
  if (isWebFallback || !dbInstance) {
    setWebData(WEB_STORAGE_KEYS.SHOPPING, []);
    return;
  }

  try {
    await dbInstance.runAsync('DELETE FROM shopping_items');
  } catch (e) {
    console.error('clearAllShoppingItems error', e);
  }
}

// --- MEAL PLANNER ---
export async function getMealPlans(): Promise<MealPlanEntry[]> {
  if (isWebFallback || !dbInstance) {
    return getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
  }

  try {
    const rows = await dbInstance.getAllAsync(`
      SELECT id, date, slot, recipe_id, side_recipe_id, servings, notes, created_at 
      FROM meal_plan 
      ORDER BY date ASC, slot ASC
    `);
    return rows as MealPlanEntry[];
  } catch (e) {
    console.error('getMealPlans error', e);
    return [];
  }
}

export async function saveMealPlanEntry(entry: {
  date: string;
  slot: 'colazione' | 'spuntino_mattina' | 'pranzo' | 'spuntino_pomeriggio' | 'cena';
  recipeId: string;
  sideRecipeId?: string;
  servings: number;
  notes?: string;
}): Promise<MealPlanEntry> {
  const newEntry: MealPlanEntry = {
    id: `plan-${entry.date}-${entry.slot}-${Date.now().toString(36)}`,
    date: entry.date,
    slot: entry.slot,
    recipe_id: entry.recipeId,
    side_recipe_id: entry.sideRecipeId || undefined,
    servings: entry.servings,
    notes: entry.notes || '',
    created_at: Date.now()
  };

  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    // Replace if same date and slot
    const filtered = existing.filter(p => !(p.date === entry.date && p.slot === entry.slot));
    const updated = [...filtered, newEntry];
    setWebData(WEB_STORAGE_KEYS.PLANNER, updated);
    return newEntry;
  }

  try {
    // Delete existing slot entry if any
    await dbInstance.runAsync('DELETE FROM meal_plan WHERE date = ? AND slot = ?', [entry.date, entry.slot]);
    await dbInstance.runAsync(`
      INSERT INTO meal_plan (id, date, slot, recipe_id, side_recipe_id, servings, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [newEntry.id, newEntry.date, newEntry.slot, newEntry.recipe_id, newEntry.side_recipe_id || null, newEntry.servings, newEntry.notes, newEntry.created_at]);
    return newEntry;
  } catch (e) {
    console.error('saveMealPlanEntry error', e);
    return newEntry;
  }
}

export async function updateMealPlanServings(id: string, delta: number): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    const updated = existing.map(p => {
      if (p.id === id) {
        const next = Math.max(1, Math.min(24, p.servings + delta));
        return { ...p, servings: next };
      }
      return p;
    });
    setWebData(WEB_STORAGE_KEYS.PLANNER, updated);
    return;
  }

  try {
    const current = await dbInstance.getFirstAsync('SELECT servings FROM meal_plan WHERE id = ?', [id]);
    if (current) {
      const next = Math.max(1, Math.min(24, (current as any).servings + delta));
      await dbInstance.runAsync('UPDATE meal_plan SET servings = ? WHERE id = ?', [next, id]);
    }
  } catch (e) {
    console.error('updateMealPlanServings error', e);
  }
}

export async function updateMealPlanSideRecipe(id: string, sideRecipeId: string | null): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    const updated = existing.map(p => p.id === id ? { ...p, side_recipe_id: sideRecipeId || undefined } : p);
    setWebData(WEB_STORAGE_KEYS.PLANNER, updated);
    return;
  }

  try {
    await dbInstance.runAsync('UPDATE meal_plan SET side_recipe_id = ? WHERE id = ?', [sideRecipeId, id]);
  } catch (e) {
    console.error('updateMealPlanSideRecipe error', e);
  }
}


export async function saveMealPlanEntriesBulk(entries: MealPlanEntry[]): Promise<void> {
  if (!entries || entries.length === 0) return;

  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    // Map of date-slot for new entries
    const newKeys = new Set(entries.map(e => `${e.date}-${e.slot}`));
    const filtered = existing.filter(p => !newKeys.has(`${p.date}-${p.slot}`));
    setWebData(WEB_STORAGE_KEYS.PLANNER, [...filtered, ...entries]);
    return;
  }

  try {
    if (typeof (dbInstance as any).withTransactionAsync === 'function') {
      await (dbInstance as any).withTransactionAsync(async () => {
        for (const entry of entries) {
          await dbInstance.runAsync('DELETE FROM meal_plan WHERE date = ? AND slot = ?', [entry.date, entry.slot]);
          await dbInstance.runAsync(
            'INSERT INTO meal_plan (id, date, slot, recipe_id, side_recipe_id, servings, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [entry.id, entry.date, entry.slot, entry.recipe_id, entry.side_recipe_id || null, entry.servings, entry.notes || '', entry.created_at]
          );
        }
      });
    } else {
      for (const entry of entries) {
        await dbInstance.runAsync('DELETE FROM meal_plan WHERE date = ? AND slot = ?', [entry.date, entry.slot]);
        await dbInstance.runAsync(
          'INSERT INTO meal_plan (id, date, slot, recipe_id, side_recipe_id, servings, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [entry.id, entry.date, entry.slot, entry.recipe_id, entry.side_recipe_id || null, entry.servings, entry.notes || '', entry.created_at]
        );
      }
    }
  } catch (e) {
    console.error('saveMealPlanEntriesBulk error', e);
  }
}

export async function deleteMealPlanEntry(id: string): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, existing.filter(p => p.id !== id));
    return;
  }

  try {
    await dbInstance.runAsync('DELETE FROM meal_plan WHERE id = ?', [id]);
  } catch (e) {
    console.error('deleteMealPlanEntry error', e);
  }
}

export async function clearMealPlans(): Promise<void> {
  if (isWebFallback || !dbInstance) {
    setWebData(WEB_STORAGE_KEYS.PLANNER, []);
    return;
  }

  try {
    await dbInstance.runAsync('DELETE FROM meal_plan');
  } catch (e) {
    console.error('clearMealPlans error', e);
  }
}

// --- RECIPE NOTES ---
export async function getRecipeNote(recipeId: string): Promise<string> {
  if (isWebFallback || !dbInstance) {
    const notesMap = getWebData<Record<string, string>>(WEB_STORAGE_KEYS.NOTES, {});
    return notesMap[recipeId] || '';
  }

  try {
    const row = await dbInstance.getFirstAsync('SELECT notes FROM recipe_notes WHERE recipe_id = ?', [recipeId]);
    return row ? (row as any).notes : '';
  } catch (e) {
    console.error('getRecipeNote error', e);
    return '';
  }
}

export async function saveRecipeNote(recipeId: string, notes: string): Promise<void> {
  const trimmed = notes.trim();

  if (isWebFallback || !dbInstance) {
    const notesMap = getWebData<Record<string, string>>(WEB_STORAGE_KEYS.NOTES, {});
    if (!trimmed) {
      delete notesMap[recipeId];
    } else {
      notesMap[recipeId] = trimmed;
    }
    setWebData(WEB_STORAGE_KEYS.NOTES, notesMap);
    return;
  }

  try {
    if (!trimmed) {
      await dbInstance.runAsync('DELETE FROM recipe_notes WHERE recipe_id = ?', [recipeId]);
    } else {
      await dbInstance.runAsync(`
        INSERT INTO recipe_notes (recipe_id, notes, updated_at) 
        VALUES (?, ?, ?)
        ON CONFLICT(recipe_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at
      `, [recipeId, trimmed, Date.now()]);
    }
  } catch (e) {
    console.error('saveRecipeNote error', e);
  }
}

export async function getAllRecipeNotes(): Promise<Record<string, string>> {
  if (isWebFallback || !dbInstance) {
    return getWebData<Record<string, string>>(WEB_STORAGE_KEYS.NOTES, {});
  }

  try {
    const rows = await dbInstance.getAllAsync('SELECT recipe_id, notes FROM recipe_notes');
    const result: Record<string, string> = {};
    for (const r of rows as any[]) {
      result[r.recipe_id] = r.notes;
    }
    return result;
  } catch (e) {
    console.error('getAllRecipeNotes error', e);
    return {};
  }
}

// --- KV STORE (preferences, last-gen dates, etc.) ---
export async function getKV(key: string): Promise<string | null> {
  if (isWebFallback || !dbInstance) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch { /* ignore */ }
    return null;
  }
  try {
    const row = await dbInstance.getFirstAsync('SELECT value FROM kv_store WHERE key = ?', [key]);
    return row ? (row as any).value : null;
  } catch (e) {
    console.error('getKV error', e);
    return null;
  }
}

export async function setKV(key: string, value: string): Promise<void> {
  if (isWebFallback || !dbInstance) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch { /* ignore */ }
    return;
  }
  try {
    await dbInstance.runAsync(
      'INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
  } catch (e) {
    console.error('setKV error', e);
  }
}

// --- CUSTOM RECIPES ---
export async function saveCustomRecipe(recipe: Recipe): Promise<void> {
  const jsonStr = JSON.stringify(recipe);

  if (isWebFallback || !dbInstance) {
    const list = getWebData<Recipe[]>(WEB_STORAGE_KEYS.CUSTOM_RECIPES, []);
    const idx = list.findIndex(r => r.id === recipe.id);
    if (idx !== -1) {
      list[idx] = recipe;
    } else {
      list.unshift(recipe);
    }
    setWebData(WEB_STORAGE_KEYS.CUSTOM_RECIPES, list);
    return;
  }

  try {
    await dbInstance.runAsync(`
      INSERT INTO custom_recipes (id, json_data, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET json_data = excluded.json_data
    `, [recipe.id, jsonStr, Date.now()]);
  } catch (e) {
    console.error('saveCustomRecipe error', e);
  }
}

export async function getCustomRecipes(): Promise<Recipe[]> {
  if (isWebFallback || !dbInstance) {
    return getWebData<Recipe[]>(WEB_STORAGE_KEYS.CUSTOM_RECIPES, []);
  }

  try {
    const rows = await dbInstance.getAllAsync('SELECT json_data FROM custom_recipes ORDER BY created_at DESC');
    return rows.map((r: any) => {
      try {
        return JSON.parse(r.json_data);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.error('getCustomRecipes error', e);
    return [];
  }
}

export async function deleteCustomRecipe(id: string): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const list = getWebData<Recipe[]>(WEB_STORAGE_KEYS.CUSTOM_RECIPES, []);
    const filtered = list.filter(r => r.id !== id);
    setWebData(WEB_STORAGE_KEYS.CUSTOM_RECIPES, filtered);
    return;
  }

  try {
    await dbInstance.runAsync('DELETE FROM custom_recipes WHERE id = ?', [id]);
  } catch (e) {
    console.error('deleteCustomRecipe error', e);
  }
}

