import { getDatabase, isWebMode, runWrite, runQueuedTransaction } from './connection';
import { WEB_STORAGE_KEYS, getWebData, setWebData } from './webStorage';
import { classifyShoppingDepartment } from '../utils/shoppingClassifier';
import { roundedWeightAmount, roundedVolumeAmount } from '../utils/shoppingAmounts';
import { normalizeIngredientKey, cleanSupermarketIngredientName, formatSupermarketIngredientText, accumulateSupermarketItem, unitGroupKey } from '../utils/ingredientAggregator';
import type { ShoppingItem } from '../types/recipe';

// --- SHOPPING LIST ---
export async function getShoppingItems(): Promise<ShoppingItem[]> {
  if (isWebMode()) {
    const items = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    return items.map(item => ({
      ...item,
      category: classifyShoppingDepartment(item.name || item.ingredient_text, item.category)
    }));
  }

  try {
    return await readShoppingItemsRaw(getDatabase());
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
    // Exclude water bought at the supermarket
    if (/acqua\s+di\s+cocco|acqua\s+tonica|acqua\s+di\s+rose|acqua\s+di\s+fiori/i.test(n)) return false;
    return true;
  }
  return false;
}

export async function addShoppingItems(items: {
  recipeId?: string;
  recipeTitle?: string;
  ingredientText: string;
  name: string;
  amount?: number | null;
  unit?: string;
  category?: string;
}[]): Promise<void> {
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

  if (isWebMode()) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, [...rawNewItems, ...existing]);
    await consolidateShoppingList();
    return;
  }

  try {
    // Inserts and consolidation in the same queued transaction (no nested queued function)
    const insertAndConsolidate = async () => {
      for (const item of rawNewItems) {
        await getDatabase().runAsync(
          `INSERT INTO shopping_item (id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at)
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
      // Consolidates and sums immediately to avoid duplicates and kitchen units
      await consolidateShoppingListInTx(getDatabase());
    };

    if (typeof (getDatabase() as any).withTransactionAsync === 'function') {
      await runQueuedTransaction(getDatabase(), insertAndConsolidate);
    } else {
      await insertAndConsolidate();
    }
  } catch (e) {
    console.error('addShoppingItems error', e);
  }
}

/**
 * Consolidates the whole shopping list:
 * - Merges the same foods (e.g. "Yogurt di soia", "Pasta sfoglia", "Tofu")
 * - Removes confusing tablespoons, teaspoons, pinches and milligrams
 * - Rounds up rolls, blocks and packs (1.3 rolls -> 2 rolls)
 * - Sums weights and volumes into real supermarket sizes
 */
// SQL read of the list (same SQL and classification as getShoppingItems); errors bubble up to the caller
async function readShoppingItemsRaw(db: any): Promise<ShoppingItem[]> {
  const rows = await db.getAllAsync(`
    SELECT id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at
    FROM shopping_item
    ORDER BY checked ASC, created_at DESC
  `);
  return rows.map((r: any) => ({
    ...r,
    checked: Boolean(r.checked),
    category: classifyShoppingDepartment(r.name || r.ingredient_text, r.category)
  }));
}

// Read, compute and write in the same context: call only inside a queued transaction
// (db null = web, localStorage). Never call from inside another runQueuedTransaction.
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
    // Non-summable units (e.g. 500 g and 1 pack) stay in separate groups
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
    // Same rounding as roundedWeightAmount / roundedVolumeAmount (25 g/ml, minimum 50 g),
    // so the row text uses the same weights as amount and unit
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
    );

    // Quantity rounded only once: amount and unit both derive from here
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

  // Compared by id (not by index) on all visible fields: if nothing changes nothing is written
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

  // Early return before any DELETE
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
  await db.runAsync('DELETE FROM shopping_item WHERE checked = 0');

  // 2. Insert new consolidated items
  for (const item of consolidatedNewItems) {
    await db.runAsync(
      `INSERT INTO shopping_item (id, recipe_id, recipe_title, ingredient_text, name, amount, unit, checked, category, created_at)
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
  if (isWebMode()) {
    return consolidateShoppingListInTx(null);
  }

  try {
    if (typeof (getDatabase() as any).withTransactionAsync === 'function') {
      // Read, compute and write in the same queued transaction: no TOCTOU
      return await runQueuedTransaction(getDatabase(), () => consolidateShoppingListInTx(getDatabase()));
    }
    return await consolidateShoppingListInTx(getDatabase());
  } catch (e) {
    console.error('consolidateShoppingList error', e);
    return 0;
  }
}

/** Updates quantity and unit of a list item; the ingredient text follows the quantity. */
export async function updateShoppingItemQuantity(id: string, name: string, amount: number | null, unit: string): Promise<void> {
  const ingredientText = (amount === null ? name : `${amount} ${unit} ${name}`).replace(/\s+/g, ' ').trim();
  if (isWebMode()) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, existing.map(item => item.id === id
      ? { ...item, amount, unit, ingredient_text: ingredientText }
      : item));
    return;
  }
  try {
    await runWrite(() => getDatabase().runAsync(
      'UPDATE shopping_item SET amount = ?, unit = ?, ingredient_text = ? WHERE id = ?',
      [amount, unit, ingredientText, id]
    ));
  } catch (e) {
    console.error('updateShoppingItemQuantity error', e);
    throw e;
  }
}

export async function toggleShoppingItem(id: string): Promise<void> {
  if (isWebMode()) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    const updated = existing.map(item => item.id === id ? { ...item, checked: !item.checked } : item);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, updated);
    return;
  }

  try {
    await runWrite(() => getDatabase().runAsync(`UPDATE shopping_item SET checked = 1 - checked WHERE id = ?`, [id]));
  } catch (e) {
    console.error('toggleShoppingItem error', e);
  }
}

export async function deleteShoppingItem(id: string): Promise<void> {
  if (isWebMode()) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, existing.filter(i => i.id !== id));
    return;
  }

  try {
    await runWrite(() => getDatabase().runAsync('DELETE FROM shopping_item WHERE id = ?', [id]));
  } catch (e) {
    console.error('deleteShoppingItem error', e);
  }
}

export async function clearCheckedShoppingItems(): Promise<void> {
  if (isWebMode()) {
    const existing = getWebData<ShoppingItem[]>(WEB_STORAGE_KEYS.SHOPPING, []);
    setWebData(WEB_STORAGE_KEYS.SHOPPING, existing.filter(i => !i.checked));
    return;
  }

  try {
    await runWrite(() => getDatabase().runAsync('DELETE FROM shopping_item WHERE checked = 1'));
  } catch (e) {
    console.error('clearCheckedShoppingItems error', e);
  }
}

export async function clearAllShoppingItems(): Promise<void> {
  if (isWebMode()) {
    setWebData(WEB_STORAGE_KEYS.SHOPPING, []);
    return;
  }

  try {
    await runWrite(() => getDatabase().runAsync('DELETE FROM shopping_item'));
  } catch (e) {
    console.error('clearAllShoppingItems error', e);
  }
}
