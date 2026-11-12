import { Platform } from 'react-native';
import { Recipe, ShoppingItem, MealPlanEntry } from '../types/recipe';
import { cleanShoppingIngredientText } from '../utils/servingsScaler';
import { classifyShoppingDepartment } from '../utils/shoppingClassifier';
import { roundedWeightAmount, roundedVolumeAmount } from '../utils/shoppingAmounts';
import { expandDeletion } from '../services/catalogFormat';
import { migrateCatalogSchema } from './catalogSchema';
import {
  normalizeIngredientKey,
  cleanSupermarketIngredientName,
  formatSupermarketIngredientText,
  accumulateSupermarketItem,
  mergeRecipeTitles,
  ConsolidatedSupermarketItem,
  unitGroupKey,
} from '../utils/ingredientAggregator';

let dbInstance: any = null;
let isWebFallback = false;

// Fallback in-memory/localStorage store for Web if SQLite WASM is unavailable
export const WEB_STORAGE_KEYS = {
  FAVORITES: 'gw_favorites',
  SHOPPING: 'gw_shopping',
  PLANNER: 'gw_planner',
  NOTES: 'gw_notes',
  PLANNER_PREFS: 'gw_planner_prefs',
  PLANNER_LAST_GEN: 'gw_planner_last_gen',
  CUSTOM_RECIPES: 'gw_custom_recipes',
  CATALOG: 'gw_catalog',
  SIMPLE_ITEMS: 'gw_simple_items',
  INGREDIENTS: 'gw_ingredients',
  READY_MEALS: 'gw_ready_meals',
  RECIPE_INGREDIENTS: 'gw_recipe_ingredients',
};

const CATALOG_INIT_KEY = 'catalog_init_v1';

// Fallback in-memory store if localStorage or SQLite is unavailable
const memoryFallback = new Map<string, string>();

export function getWebData<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    }
  } catch (e) {
    console.warn('Error reading from localStorage', e);
  }
  const mem = memoryFallback.get(key);
  return mem ? JSON.parse(mem) : defaultValue;
}

export function setWebData<T>(key: string, value: T): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
      return;
    }
  } catch (e) {
    console.warn('Error saving to localStorage', e);
  }
  memoryFallback.set(key, JSON.stringify(value));
}

// Le transazioni sullo stesso database non possono annidarsi né sovrapporsi:
// le scritture concorrenti (es. consolidamento della spesa e aggiunte dal planner) vanno in fila
let transactionQueue: Promise<unknown> = Promise.resolve();

// Accoda fn dopo le operazioni già in coda; un errore non blocca la coda
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = transactionQueue.then(fn, fn);
  transactionQueue = next.catch(() => undefined);
  return next;
}

export function runQueuedTransaction<T>(db: any, fn: () => Promise<T>): Promise<T> {
  return enqueue(() => db.withTransactionAsync(fn) as Promise<T>);
}

// Scrittura singola fuori transazione, in coda con le transazioni: non deve mai essere chiamata
// da dentro una runQueuedTransaction (la coda si bloccherebbe su se stessa)
export function runWrite<T>(fn: () => Promise<T>): Promise<T> {
  return enqueue(fn);
}

// Rinomine applicate quando le opzioni di asporto sono state rinominate (vecchio nome -> nuovo nome)
export const OUT_OF_HOME_LABEL_RENAMES: Record<string, string> = {
  'Asporto pizza': 'Asporto - Pizza',
  'Asporto cinese': 'Asporto - Cinese',
};

// Riscrive le etichette vecchie dei pasti fuori casa nel planner. Idempotente: i nomi nuovi non sono chiavi della mappa
export async function migrateOutOfHomeLabels(): Promise<number> {
  if (isWebFallback || !dbInstance) {
    const entries = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    let changed = 0;
    const updated = entries.map(e => {
      if (e.kind !== 'out' || !e.label) return e;
      if (!Object.prototype.hasOwnProperty.call(OUT_OF_HOME_LABEL_RENAMES, e.label)) return e;
      const next = OUT_OF_HOME_LABEL_RENAMES[e.label];
      if (next === e.label) return e;
      changed++;
      return { ...e, label: next };
    });
    if (changed > 0) setWebData(WEB_STORAGE_KEYS.PLANNER, updated);
    return changed;
  }

  try {
    let total = 0;
    for (const [oldLabel, newLabel] of Object.entries(OUT_OF_HOME_LABEL_RENAMES)) {
      const res = await runWrite<{ changes?: number } | null>(() => dbInstance.runAsync(
        "UPDATE meal_plan SET label = ? WHERE kind = 'out' AND label = ?",
        [newLabel, oldLabel]
      ));
      total += res?.changes ?? 0;
    }
    return total;
  } catch (e) {
    console.error('migrateOutOfHomeLabels error', e);
    throw e;
  }
}

export async function initDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    isWebFallback = true;
    try {
      await migrateOutOfHomeLabels();
    } catch (e) {
      console.warn('Rinomina etichette fuori casa non riuscita:', e);
    }
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
        category TEXT NOT NULL DEFAULT 'CAT_SHOPPING_VARIE',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meal_plan (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        slot TEXT NOT NULL,
        recipe_id TEXT,
        food_id TEXT,
        servings INTEGER NOT NULL DEFAULT 2,
        notes TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS simple_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tags TEXT NOT NULL,
        amount REAL,
        unit TEXT NOT NULL DEFAULT '',
        recipe_ids TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recipe_notes (
        recipe_id TEXT PRIMARY KEY,
        notes TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalog (
        id TEXT PRIMARY KEY,
        json_data TEXT NOT NULL,
        base_id TEXT,
        diet TEXT NOT NULL,
        origin TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS custom_recipes (
        id TEXT PRIMARY KEY,
        json_data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_shopping_items_checked ON shopping_items(checked, category);
      CREATE INDEX IF NOT EXISTS idx_custom_recipes_created ON custom_recipes(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_catalog_base ON catalog(base_id);
      CREATE INDEX IF NOT EXISTS idx_catalog_diet ON catalog(diet);
      CREATE INDEX IF NOT EXISTS idx_catalog_origin ON catalog(origin);
    `);

    await migrateCatalogSchema(dbInstance);
    await migrateMealPlanTable();

    await dbInstance.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_meal_plan_date ON meal_plan(date);
      CREATE INDEX IF NOT EXISTS idx_meal_plan_date_slot ON meal_plan(date, slot);
    `);
  } catch (error) {
    // Il web non arriva qui (ritorna subito sopra e usa localStorage). Su native non si ricade
    // su localStorage (dati vuoti e silenziosi): l'errore viene propagato all'avvio
    console.error('SQLite init failed:', error);
    dbInstance = null;
    throw error;
  }

  // Dopo l'init riuscito (il catch sopra rilancia, quindi qui si arriva solo con successo)
  try {
    await migrateOutOfHomeLabels();
  } catch (e) {
    console.warn('Rinomina etichette fuori casa non riuscita:', e);
  }
}

export function getDatabase(): any {
  return dbInstance;
}

export function isWebMode(): boolean {
  return isWebFallback || !dbInstance;
}

// Migrazione one-time: rimuove side_recipe_id, rende recipe_id nullable, aggiunge food_id.
// Le side recipe delle vecchie righe vengono scartate. Idempotente.
async function migrateMealPlanTable(): Promise<void> {
  const cols: any[] = await dbInstance.getAllAsync('PRAGMA table_info(meal_plan)');
  if (cols.some(c => c.name === 'food_id' || c.name === 'ingredient_id')) return;

  await dbInstance.execAsync('BEGIN');
  try {
    await dbInstance.execAsync(`
      DROP TABLE IF EXISTS meal_plan_new;
      CREATE TABLE meal_plan_new (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        slot TEXT NOT NULL,
        recipe_id TEXT,
        food_id TEXT,
        servings INTEGER NOT NULL DEFAULT 2,
        notes TEXT,
        created_at INTEGER NOT NULL
      );
      INSERT INTO meal_plan_new (id, date, slot, recipe_id, servings, notes, created_at)
        SELECT id, date, slot, recipe_id, servings, notes, created_at FROM meal_plan;
      DROP TABLE meal_plan;
      ALTER TABLE meal_plan_new RENAME TO meal_plan;
    `);
    await dbInstance.execAsync('COMMIT');
  } catch (e) {
    await dbInstance.execAsync('ROLLBACK');
    throw e;
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
      await runWrite(() => dbInstance.runAsync('DELETE FROM favorites WHERE recipe_id = ?', [recipeId]));
      return false;
    } else {
      await runWrite(() => dbInstance.runAsync('INSERT INTO favorites (recipe_id, created_at) VALUES (?, ?)', [recipeId, Date.now()]));
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
    return await readShoppingItemsRaw(dbInstance);
  } catch (e) {
    console.error('getShoppingItems error', e);
    return [];
  }
}

function isNonPurchasableItem(cleanName: string, key: string): boolean {
  if (!cleanName && !key) return true;
  const n = (cleanName || '').toLowerCase().trim();
  const k = (key || '').toLowerCase().trim();
  if (k === 'ghiaccio' || k === 'cubetti di ghiaccio' || k === 'cubetto di ghiaccio' || n === 'ghiaccio') return true;
  if (/^acqua\b/i.test(k) || /^acqua\b/i.test(n)) {
    // Escludi acque comprate al supermercato
    if (/acqua\s+di\s+cocco|acqua\s+tonica|acqua\s+di\s+rose|acqua\s+di\s+fiori/i.test(n)) return false;
    return true;
  }
  return false;
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
      return !isNonPurchasableItem(clean, key);
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
    // Inserimenti e consolidamento nella stessa transazione in coda (nessuna queued function annidata)
    const insertAndConsolidate = async () => {
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
      // Consolida e somma immediatamente per evitare duplicati e unità da cucina
      await consolidateShoppingListInTx(dbInstance);
    };

    if (typeof (dbInstance as any).withTransactionAsync === 'function') {
      await runQueuedTransaction(dbInstance, insertAndConsolidate);
    } else {
      await insertAndConsolidate();
    }
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
// Lettura SQL della lista (stesso SQL e classificazione di getShoppingItems); gli errori risalgono al chiamante
async function readShoppingItemsRaw(db: any): Promise<ShoppingItem[]> {
  const rows = await db.getAllAsync(`
    SELECT id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at
    FROM shopping_items
    ORDER BY checked ASC, created_at DESC
  `);
  return rows.map((r: any) => ({
    ...r,
    checked: Boolean(r.checked),
    category: classifyShoppingDepartment(r.name || r.ingredient_text, r.category)
  }));
}

// Lettura, calcolo e scrittura nello stesso contesto: va chiamata solo dentro una transazione in coda
// (db null = web, localStorage). Non va mai chiamata da dentro un'altra runQueuedTransaction.
async function consolidateShoppingListInTx(db: any | null): Promise<number> {
  const all = db ? await readShoppingItemsRaw(db) : await getShoppingItems();
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
    const baseKey = normalizeIngredientKey(cleanName);
    if (isNonPurchasableItem(cleanName, baseKey)) {
      continue;
    }
    // Unità non sommabili (es. 500 g e 1 confezione) restano in gruppi separati
    const key = `${baseKey}|${unitGroupKey(item.unit)}`;
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
    // Stessi arrotondamenti di roundedWeightAmount / roundedVolumeAmount (25 g/ml, minimo 50 g),
    // così il testo della riga usa le stesse grammature di amount e unità
    const roundedGrams = group.weightGrams !== null
      ? (group.weightGrams < 50 ? 50 : Math.round(group.weightGrams / 25) * 25)
      : null;
    const roundedMl = group.volumeMl !== null ? Math.round(group.volumeMl / 25) * 25 : null;
    const text = formatSupermarketIngredientText(
      group.cleanName,
      group.discreteCount,
      group.discreteUnit,
      roundedGrams,
      roundedMl,
      group.hasKitchenUnitOnly
    );

    // Quantità arrotondata una sola volta: amount e unità derivano entrambi da qui
    const weight = group.weightGrams !== null ? roundedWeightAmount(group.weightGrams) : null;
    const volume = group.volumeMl !== null ? roundedVolumeAmount(group.volumeMl) : null;

    consolidatedNewItems.push({
      id: group.id || `shop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: group.cleanName,
      ingredient_text: text,
      amount: group.discreteCount !== null
        ? Math.max(1, Math.ceil(group.discreteCount))
        : weight
        ? weight.amount
        : volume
        ? volume.amount
        : null,
      unit: group.discreteCount !== null
        ? (group.discreteUnit || '')
        : weight
        ? weight.unit
        : volume
        ? volume.unit
        : '',
      checked: false,
      category: group.category,
      created_at: Date.now(),
      recipe_title: group.recipeTitles.length > 0 ? group.recipeTitles.join(', ') : undefined,
    });
  }

  // Confronto per id (non per indice) su tutti i campi visibili: se nulla cambia non si scrive nulla
  const uncheckedById = new Map(unchecked.map(u => [u.id, u]));
  const hasChanges = unchecked.length !== consolidatedNewItems.length ||
    consolidatedNewItems.some(c => {
      const u = uncheckedById.get(c.id);
      return !u ||
        c.name !== u.name ||
        (c.amount ?? null) !== (u.amount ?? null) ||
        (c.unit || '') !== (u.unit || '') ||
        c.ingredient_text !== u.ingredient_text ||
        c.category !== u.category ||
        c.checked !== Boolean(u.checked);
    });

  // Early return prima di qualsiasi DELETE
  if (!hasChanges) {
    return consolidatedNewItems.length;
  }

  const fullConsolidated = [...consolidatedNewItems, ...checked];

  if (!db) {
    setWebData(WEB_STORAGE_KEYS.SHOPPING, fullConsolidated);
    return consolidatedNewItems.length;
  }

  // 1. Delete ONLY unchecked items that are subject to consolidation
  // Checked cart items remain untouched and 100% protected
  await db.runAsync('DELETE FROM shopping_items WHERE checked = 0');

  // 2. Insert new consolidated items
  for (const item of consolidatedNewItems) {
    await db.runAsync(
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

  return consolidatedNewItems.length;
}

export async function consolidateShoppingList(): Promise<number> {
  if (isWebFallback || !dbInstance) {
    return consolidateShoppingListInTx(null);
  }

  try {
    if (typeof (dbInstance as any).withTransactionAsync === 'function') {
      // Lettura, calcolo e scrittura nella stessa transazione in coda: niente TOCTOU
      return await runQueuedTransaction(dbInstance, () => consolidateShoppingListInTx(dbInstance));
    }
    return await consolidateShoppingListInTx(dbInstance);
  } catch (e) {
    console.error('consolidateShoppingList error', e);
    return 0;
  }
}

/** Aggiorna quantità e unità di un elemento della lista; il testo dell'ingrediente segue la quantità. */
export async function updateShoppingItemQuantity(id: string, name: string, amount: number | null, unit: string): Promise<void> {
  const ingredientText = (amount === null ? name : `${amount} ${unit} ${name}`).replace(/\s+/g, ' ').trim();
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, existing.map(item => item.id === id
      ? { ...item, amount, unit, ingredient_text: ingredientText }
      : item));
    return;
  }
  try {
    await runWrite(() => dbInstance.runAsync(
      'UPDATE shopping_items SET amount = ?, unit = ?, ingredient_text = ? WHERE id = ?',
      [amount, unit, ingredientText, id]
    ));
  } catch (e) {
    console.error('updateShoppingItemQuantity error', e);
    throw e;
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
    await runWrite(() => dbInstance.runAsync(`UPDATE shopping_items SET checked = 1 - checked WHERE id = ?`, [id]));
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
    await runWrite(() => dbInstance.runAsync('DELETE FROM shopping_items WHERE id = ?', [id]));
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
    await runWrite(() => dbInstance.runAsync('DELETE FROM shopping_items WHERE checked = 1'));
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
    await runWrite(() => dbInstance.runAsync('DELETE FROM shopping_items'));
  } catch (e) {
    console.error('clearAllShoppingItems error', e);
  }
}

// --- MEAL PLANNER ---
export async function getMealPlans(range?: { fromDate: string; toDate: string }): Promise<MealPlanEntry[]> {
  if (isWebFallback || !dbInstance) {
    const all = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    return range ? all.filter(p => p.date >= range.fromDate && p.date <= range.toDate) : all;
  }

  try {
    // Con intervallo: solo le date richieste (usa idx_meal_plan_date); senza, lettura completa
    const rows = await dbInstance.getAllAsync(
      `SELECT id, date, slot, kind, recipe_id, ingredient_id, ready_meal_id, label, amount, unit, count, servings, notes, created_at
      FROM meal_plan
      ${range ? 'WHERE date BETWEEN ? AND ?' : ''}
      ORDER BY date ASC, slot ASC`,
      range ? [range.fromDate, range.toDate] : [],
    );
    return rows as MealPlanEntry[];
  } catch (e) {
    console.error('getMealPlans error', e);
    return [];
  }
}

export async function saveMealPlanEntry(entry: {
  date: string;
  slot: 'colazione' | 'spuntino_mattina' | 'pranzo' | 'spuntino_pomeriggio' | 'cena';
  recipeId?: string;
  foodId?: string;
  servings: number;
  notes?: string;
}): Promise<MealPlanEntry> {
  if (!!entry.recipeId === !!entry.foodId) {
    throw new Error('saveMealPlanEntry: exactly one of recipeId or foodId must be set');
  }
  const newEntry: MealPlanEntry = {
    id: `plan-${entry.date}-${entry.slot}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    date: entry.date,
    slot: entry.slot,
    kind: entry.recipeId ? 'recipe' : 'ingredient',
    recipe_id: entry.recipeId || undefined,
    ingredient_id: entry.foodId || undefined,
    servings: entry.servings,
    notes: entry.notes || '',
    created_at: Date.now()
  };

  // Più ricette possono coesistere nello stesso pasto: si aggiunge sempre una nuova entry
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, [...existing, newEntry]);
    return newEntry;
  }

  try {
    await runWrite(() => dbInstance.runAsync(`
      INSERT INTO meal_plan (id, date, slot, kind, recipe_id, ingredient_id, servings, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [newEntry.id, newEntry.date, newEntry.slot, newEntry.kind, newEntry.recipe_id ?? null, newEntry.ingredient_id ?? null, newEntry.servings, newEntry.notes, newEntry.created_at]));
    return newEntry;
  } catch (e) {
    console.error('saveMealPlanEntry error', e);
    throw e;
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
      await runWrite(() => dbInstance.runAsync('UPDATE meal_plan SET servings = ? WHERE id = ?', [next, id]));
    }
  } catch (e) {
    console.error('updateMealPlanServings error', e);
  }
}

export async function updateMealPlanRecipe(id: string, recipeId: string): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    const updated = existing.map(p => p.id === id ? { ...p, kind: 'recipe' as const, recipe_id: recipeId } : p);
    setWebData(WEB_STORAGE_KEYS.PLANNER, updated);
    return;
  }

  try {
    await runWrite(() => dbInstance.runAsync("UPDATE meal_plan SET recipe_id = ?, kind = 'recipe', ingredient_id = NULL WHERE id = ?", [recipeId, id]));
  } catch (e) {
    console.error('updateMealPlanRecipe error', e);
  }
}

export async function updateMealPlanFood(id: string, foodId: string): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    const updated = existing.map(p => p.id === id ? { ...p, kind: 'ingredient' as const, ingredient_id: foodId, recipe_id: undefined } : p);
    setWebData(WEB_STORAGE_KEYS.PLANNER, updated);
    return;
  }

  try {
    await runWrite(() => dbInstance.runAsync("UPDATE meal_plan SET ingredient_id = ?, kind = 'ingredient', recipe_id = NULL WHERE id = ?", [foodId, id]));
  } catch (e) {
    console.error('updateMealPlanFood error', e);
  }
}

export type MealPlanDetailInput = {
  kind: 'recipe' | 'ingredient' | 'ready' | 'out';
  recipeId?: string;
  ingredientId?: string;
  readyMealId?: string;
  label?: string;
  amount?: number | null;
  unit?: string;
  count?: number;
  servings?: number;
};

function normalizeDetail(input: MealPlanDetailInput) {
  // Fuori casa: solo un'etichetta, nessun collegamento a ricette, ingredienti o pronti
  if (input.kind === 'out') {
    const label = input.label?.trim();
    if (!label) throw new Error('meal plan entry: label must be set for out-of-home meals');
    return {
      kind: 'out' as const,
      recipe_id: null,
      ingredient_id: null,
      ready_meal_id: null,
      label,
      amount: null,
      unit: '',
      count: 1,
    };
  }
  const ids = { recipe: input.recipeId, ingredient: input.ingredientId, ready: input.readyMealId };
  const given = Object.values(ids).filter(Boolean).length;
  if (!ids[input.kind] || given !== 1) {
    throw new Error(`meal plan entry: exactly the ${input.kind} id must be set`);
  }
  return {
    kind: input.kind,
    recipe_id: input.kind === 'recipe' ? input.recipeId! : null,
    ingredient_id: input.kind === 'ingredient' ? input.ingredientId! : null,
    ready_meal_id: input.kind === 'ready' ? input.readyMealId! : null,
    label: null,
    amount: input.kind === 'ingredient' ? (input.amount ?? null) : null,
    unit: input.kind === 'ingredient' ? (input.unit ?? '') : '',
    count: input.kind === 'ready' ? (input.count ?? 1) : 1,
  };
}

export async function saveMealPlanEntryDetailed(input: MealPlanDetailInput & {
  date: string;
  slot: MealPlanEntry['slot'];
}): Promise<MealPlanEntry> {
  const d = normalizeDetail(input);
  const entry: MealPlanEntry = {
    id: `plan-${input.date}-${input.slot}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    date: input.date,
    slot: input.slot,
    kind: d.kind,
    recipe_id: d.recipe_id ?? undefined,
    ingredient_id: d.ingredient_id ?? undefined,
    ready_meal_id: d.ready_meal_id ?? undefined,
    label: d.label ?? undefined,
    amount: d.amount,
    unit: d.unit ?? undefined,
    count: d.count ?? undefined,
    servings: input.servings ?? 2,
    notes: '',
    created_at: Date.now(),
  };
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, [...existing, entry]);
    return entry;
  }
  try {
    await runWrite(() => dbInstance.runAsync(BULK_INSERT_SQL, bulkInsertParams(entry)));
  } catch (e) {
    console.error('saveMealPlanEntryDetailed error', e);
  }
  return entry;
}

export async function updateMealPlanEntryDetailed(id: string, input: MealPlanDetailInput): Promise<void> {
  const d = normalizeDetail(input);
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, existing.map(p => p.id !== id ? p : {
      ...p,
      kind: d.kind,
      recipe_id: d.recipe_id ?? undefined,
      ingredient_id: d.ingredient_id ?? undefined,
      ready_meal_id: d.ready_meal_id ?? undefined,
      label: d.label ?? undefined,
      amount: d.amount,
      unit: d.unit ?? undefined,
      count: d.count ?? undefined,
      servings: input.servings ?? p.servings,
    }));
    return;
  }
  try {
    if (input.servings != null) {
      await runWrite(() => dbInstance.runAsync('UPDATE meal_plan SET servings = ? WHERE id = ?', [input.servings, id]));
    }
    await runWrite(() => dbInstance.runAsync(
      'UPDATE meal_plan SET kind = ?, recipe_id = ?, ingredient_id = ?, ready_meal_id = ?, label = ?, amount = ?, unit = ?, count = ? WHERE id = ?',
      [d.kind, d.recipe_id, d.ingredient_id, d.ready_meal_id, d.label, d.amount, d.unit, d.count, id]
    ));
  } catch (e) {
    console.error('updateMealPlanEntryDetailed error', e);
  }
}

async function deleteMealPlanWhere(col: 'ingredient_id' | 'ready_meal_id', value: string): Promise<number> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    const kept = existing.filter(p => p[col] !== value);
    setWebData(WEB_STORAGE_KEYS.PLANNER, kept);
    return existing.length - kept.length;
  }
  try {
    const res = await runWrite<any>(() => dbInstance.runAsync(`DELETE FROM meal_plan WHERE ${col} = ?`, [value]));
    return res?.changes ?? 0;
  } catch (e) {
    console.error('deleteMealPlanWhere error', e);
    return 0;
  }
}

export async function deleteMealPlanEntriesForIngredient(ingredientId: string): Promise<number> {
  return deleteMealPlanWhere('ingredient_id', ingredientId);
}

export async function deleteMealPlanEntriesForReadyMeal(readyMealId: string): Promise<number> {
  return deleteMealPlanWhere('ready_meal_id', readyMealId);
}

export const deleteMealPlanEntriesForFood = deleteMealPlanEntriesForIngredient;

export async function countPlannedUsesOfFood(foodId: string): Promise<number> {
  if (isWebFallback || !dbInstance) {
    return getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []).filter(p => p.ingredient_id === foodId).length;
  }

  try {
    const row = await dbInstance.getFirstAsync('SELECT COUNT(*) AS n FROM meal_plan WHERE ingredient_id = ?', [foodId]);
    return (row as any)?.n ?? 0;
  } catch (e) {
    console.error('countPlannedUsesOfFood error', e);
    return 0;
  }
}

function entryKind(e: MealPlanEntry): 'recipe' | 'ingredient' | 'ready' | 'out' {
  return e.kind ?? (e.recipe_id ? 'recipe' : e.ready_meal_id ? 'ready' : 'ingredient');
}
function activeId(e: MealPlanEntry): string {
  const k = entryKind(e);
  if (k === 'out') return e.label ?? '';
  return (k === 'recipe' ? e.recipe_id : k === 'ready' ? e.ready_meal_id : e.ingredient_id) ?? '';
}
function activeKey(e: MealPlanEntry): string {
  return `${entryKind(e)}:${activeId(e)}`;
}
const BULK_DELETE_SQL = "DELETE FROM meal_plan WHERE date = ? AND slot = ? AND kind = ? AND COALESCE(recipe_id, ingredient_id, ready_meal_id, label, '') = ?";
function bulkDeleteParams(e: MealPlanEntry): any[] {
  return [e.date, e.slot, entryKind(e), activeId(e)];
}
const BULK_INSERT_SQL = 'INSERT INTO meal_plan (id, date, slot, kind, recipe_id, ingredient_id, ready_meal_id, label, amount, unit, count, servings, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
function bulkInsertParams(e: MealPlanEntry): any[] {
  return [e.id, e.date, e.slot, entryKind(e), e.recipe_id ?? null, e.ingredient_id ?? null, e.ready_meal_id ?? null, e.label ?? null, e.amount ?? null, e.unit ?? '', e.count ?? 1, e.servings, e.notes || '', e.created_at];
}

export async function saveMealPlanEntriesBulk(entries: MealPlanEntry[]): Promise<void> {
  if (!entries || entries.length === 0) return;

  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    // Sostituisce solo la stessa ricetta/piatto nello stesso giorno e pasto
    const keyOf = (e: MealPlanEntry) => `${e.date}|${e.slot}|${activeKey(e)}`;
    const newKeys = new Set(entries.map(keyOf));
    const filtered = existing.filter(p => !newKeys.has(keyOf(p)));
    setWebData(WEB_STORAGE_KEYS.PLANNER, [...filtered, ...entries]);
    return;
  }

  try {
    const run = async () => {
      for (const entry of entries) {
        await dbInstance!.runAsync(BULK_DELETE_SQL, bulkDeleteParams(entry));
        await dbInstance!.runAsync(BULK_INSERT_SQL, bulkInsertParams(entry));
      }
    };
    if (typeof (dbInstance as any).withTransactionAsync === 'function') {
      await runQueuedTransaction(dbInstance, run);
    } else {
      await run();
    }
  } catch (e) {
    console.error('saveMealPlanEntriesBulk error', e);
    throw e;
  }
}

export async function deleteMealPlanEntry(id: string): Promise<void> {
  if (isWebFallback || !dbInstance) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, existing.filter(p => p.id !== id));
    return;
  }

  try {
    await runWrite(() => dbInstance.runAsync('DELETE FROM meal_plan WHERE id = ?', [id]));
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
    await runWrite(() => dbInstance.runAsync('DELETE FROM meal_plan'));
  } catch (e) {
    console.error('clearMealPlans error', e);
  }
}

/**
 * Elimina tutti i pasti pianificati nelle date indicate (formato YYYY-MM-DD). Restituisce il numero di pasti eliminati.
 */
export async function deleteMealPlanForDates(dates: string[]): Promise<number> {
  if (!dates || dates.length === 0) return 0;
  const wanted = new Set(dates);

  if (isWebFallback || !dbInstance) {
    const plans = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    const kept = plans.filter(p => !wanted.has(p.date));
    setWebData(WEB_STORAGE_KEYS.PLANNER, kept);
    return plans.length - kept.length;
  }

  const placeholders = dates.map(() => '?').join(',');
  try {
    const row = (await dbInstance.getFirstAsync(
      `SELECT COUNT(*) AS n FROM meal_plan WHERE date IN (${placeholders})`,
      dates,
    )) as { n: number } | null;
    await runWrite(() => dbInstance.runAsync(`DELETE FROM meal_plan WHERE date IN (${placeholders})`, dates));
    return row?.n ?? 0;
  } catch (e) {
    console.error('deleteMealPlanForDates error', e);
    throw e;
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
      await runWrite(() => dbInstance.runAsync('DELETE FROM recipe_notes WHERE recipe_id = ?', [recipeId]));
    } else {
      await runWrite(() => dbInstance.runAsync(`
        INSERT INTO recipe_notes (recipe_id, notes, updated_at) 
        VALUES (?, ?, ?)
        ON CONFLICT(recipe_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at
      `, [recipeId, trimmed, Date.now()]));
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
    throw e;
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
    await runWrite(() => dbInstance.runAsync(
      'INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    ));
  } catch (e) {
    console.error('setKV error', e);
    throw e;
  }
}

// --- CATALOGO ---
// Tutte le ricette del telefono (originali e varianti). Le varianti hanno base_id valorizzato.

function catalogIndexFields(recipe: Recipe) {
  const now = Date.now();
  return {
    base: recipe.variant_of ?? null,
    diet: recipe.diet ?? 'omnivore',
    origin: recipe.origin ?? 'file',
    created: recipe.created_at ?? now,
    updated: recipe.updated_at ?? now,
  };
}

export async function getCatalogRecipes(): Promise<Recipe[]> {
  if (isWebFallback || !dbInstance) {
    return getWebData<Recipe[]>(WEB_STORAGE_KEYS.CATALOG, []);
  }

  try {
    const rows = await dbInstance.getAllAsync('SELECT json_data FROM catalog ORDER BY created_at DESC');
    return rows.flatMap((r: any) => {
      try {
        return [JSON.parse(r.json_data) as Recipe];
      } catch {
        return [];
      }
    });
  } catch (e) {
    console.error('getCatalogRecipes error', e);
    return [];
  }
}

/**
 * Inserisce o aggiorna le ricette. Con mode 'keep' le ricette con un id già presente non vengono toccate.
 */
export async function upsertCatalogRecipes(recipes: Recipe[], mode: 'overwrite' | 'keep' = 'overwrite'): Promise<{ inserted: number; updated: number; skipped: number }> {
  const existing = new Set((await getCatalogRecipes()).map(r => r.id));
  const result = { inserted: 0, updated: 0, skipped: 0 };
  const toWrite = recipes.filter(r => {
    if (!existing.has(r.id)) {
      result.inserted++;
      return true;
    }
    if (mode === 'keep') {
      result.skipped++;
      return false;
    }
    result.updated++;
    return true;
  });

  if (isWebFallback || !dbInstance) {
    const byId = new Map((await getCatalogRecipes()).map(r => [r.id, r]));
    toWrite.forEach(r => byId.set(r.id, r));
    setWebData(WEB_STORAGE_KEYS.CATALOG, Array.from(byId.values()));
    return result;
  }

  const write = async () => {
    for (const recipe of toWrite) {
      const f = catalogIndexFields(recipe);
      await dbInstance.runAsync(`
        INSERT INTO catalog (id, json_data, base_id, diet, origin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          json_data = excluded.json_data,
          base_id = excluded.base_id,
          diet = excluded.diet,
          origin = excluded.origin,
          updated_at = excluded.updated_at
      `, [recipe.id, JSON.stringify(recipe), f.base, f.diet, f.origin, f.created, f.updated]);
    }
  };

  try {
    if (typeof (dbInstance as any).withTransactionAsync === 'function') {
      await runQueuedTransaction(dbInstance, write);
    } else {
      await write();
    }
  } catch (e) {
    console.error('upsertCatalogRecipes error', e);
  }
  return result;
}

/**
 * Rimuove dal planner, dai preferiti e dalle note le ricette eliminate dal catalogo.
 * La lista della spesa non viene toccata: conserva già il testo degli ingredienti.
 */
export async function removeRecipeReferences(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const gone = new Set(ids);

  if (isWebFallback || !dbInstance) {
    setWebData(WEB_STORAGE_KEYS.FAVORITES, getWebData<string[]>(WEB_STORAGE_KEYS.FAVORITES, []).filter(id => !gone.has(id)));
    const notes = getWebData<Record<string, string>>(WEB_STORAGE_KEYS.NOTES, {});
    ids.forEach(id => { delete notes[id]; });
    setWebData(WEB_STORAGE_KEYS.NOTES, notes);
    const plans = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, plans
      .filter(p => !p.recipe_id || !gone.has(p.recipe_id)));
    setWebData(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, getWebData<any[]>(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, []).filter(r => !gone.has(r.recipe_id)));
    return;
  }

  const placeholders = ids.map(() => '?').join(',');
  try {
    await runWrite(() => dbInstance.runAsync(`DELETE FROM favorites WHERE recipe_id IN (${placeholders})`, ids));
    await runWrite(() => dbInstance.runAsync(`DELETE FROM recipe_notes WHERE recipe_id IN (${placeholders})`, ids));
    await runWrite(() => dbInstance.runAsync(`DELETE FROM meal_plan WHERE recipe_id IN (${placeholders})`, ids));
    await runWrite(() => dbInstance.runAsync(`DELETE FROM recipe_ingredients WHERE recipe_id IN (${placeholders})`, ids));
  } catch (e) {
    console.error('removeRecipeReferences error', e);
    throw e;
  }
}

/**
 * Elimina le ricette indicate e le loro varianti. Restituisce gli id eliminati, per pulire i riferimenti.
 */
export async function deleteCatalogRecipes(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const all = await getCatalogRecipes();
  const deleted = expandDeletion(ids, all);

  if (isWebFallback || !dbInstance) {
    const gone = new Set(deleted);
    setWebData(WEB_STORAGE_KEYS.CATALOG, all.filter(r => !gone.has(r.id)));
    return deleted;
  }

  // Gli errori non vanno inghiottiti: chi chiama deve sapere che la cancellazione non è avvenuta
  const placeholders = deleted.map(() => '?').join(',');
  await runWrite(() => dbInstance.runAsync(`DELETE FROM catalog WHERE id IN (${placeholders})`, deleted));
  return deleted;
}

// Ricette personali della vecchia versione (tabella custom_recipes): solo per la migrazione
async function readLegacyCustomRecipes(): Promise<Recipe[]> {
  if (isWebFallback || !dbInstance) {
    return getWebData<Recipe[]>(WEB_STORAGE_KEYS.CUSTOM_RECIPES, []);
  }
  try {
    const rows = await dbInstance.getAllAsync('SELECT json_data FROM custom_recipes ORDER BY created_at DESC');
    return rows.flatMap((r: any) => {
      try {
        return [JSON.parse(r.json_data) as Recipe];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/**
 * Migrazione una tantum dalla vecchia tabella delle ricette personali. Le ricette importate dall'AI diventano origin 'ai'.
 */
export async function initCatalog(): Promise<void> {
  if ((await getKV(CATALOG_INIT_KEY)) === '1') return;

  const legacy = await readLegacyCustomRecipes();
  const migrated = legacy.map(r => ({
    ...r,
    origin: r.id.startsWith('custom-') ? 'ai' as const : (r.origin ?? 'file' as const),
  }));
  await upsertCatalogRecipes(migrated, 'overwrite');

  await setKV(CATALOG_INIT_KEY, '1');
}


