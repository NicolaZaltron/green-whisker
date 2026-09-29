import { Platform } from 'react-native';
import { ShoppingItem, MealPlanEntry } from '../types/recipe';
import { cleanShoppingIngredientText } from '../utils/servingsScaler';

let dbInstance: any = null;
let isWebFallback = false;

// Fallback in-memory/localStorage store for Web if SQLite WASM is unavailable
const WEB_STORAGE_KEYS = {
  FAVORITES: 'gw_favorites',
  SHOPPING: 'gw_shopping',
  PLANNER: 'gw_planner',
  NOTES: 'gw_notes'
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
    `);
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
    return getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
  }

  try {
    const rows = await dbInstance.getAllAsync(`
      SELECT id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at 
      FROM shopping_items 
      ORDER BY checked ASC, created_at DESC
    `);
    return rows.map((r: any) => ({
      ...r,
      checked: Boolean(r.checked)
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
  const newItems: ShoppingItem[] = items.map(item => {
    const isQbUnit = item.unit ? (item.unit.toLowerCase().includes('q.b') || item.unit.toLowerCase().includes('quanto basta')) : false;
    const cleanedText = cleanShoppingIngredientText(item.ingredientText, item.name);
    const cleanedName = cleanShoppingIngredientText(item.name, cleanedText);

    return {
      id: `shop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      recipe_id: item.recipeId,
      recipe_title: item.recipeTitle,
      ingredient_text: cleanedText,
      name: cleanedName,
      amount: isQbUnit ? null : (item.amount ?? null),
      unit: isQbUnit ? '' : (item.unit || ''),
      checked: false,
      category: item.category || 'Generale',
      created_at: Date.now()
    };
  });

  if (isWebFallback || !dbInstance) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, [...newItems, ...existing]);
    return;
  }

  try {
    for (const item of newItems) {
      await dbInstance.runAsync(`
        INSERT INTO shopping_items (id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.id,
        item.recipe_id ?? null,
        item.recipe_title ?? null,
        item.ingredient_text,
        item.name,
        item.amount,
        item.unit,
        item.checked ? 1 : 0,
        item.category,
        item.created_at
      ]);
    }
  } catch (e) {
    console.error('addShoppingItems error', e);
  }
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
      SELECT id, date, slot, recipe_id, servings, notes, created_at 
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
  slot: 'pranzo' | 'cena';
  recipeId: string;
  servings: number;
  notes?: string;
}): Promise<MealPlanEntry> {
  const newEntry: MealPlanEntry = {
    id: `plan-${entry.date}-${entry.slot}-${Date.now().toString(36)}`,
    date: entry.date,
    slot: entry.slot,
    recipe_id: entry.recipeId,
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
      INSERT INTO meal_plan (id, date, slot, recipe_id, servings, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [newEntry.id, newEntry.date, newEntry.slot, newEntry.recipe_id, newEntry.servings, newEntry.notes, newEntry.created_at]);
    return newEntry;
  } catch (e) {
    console.error('saveMealPlanEntry error', e);
    return newEntry;
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

