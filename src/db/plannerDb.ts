import { getDatabase, isWebMode, runWrite, runQueuedTransaction } from './connection';
import { WEB_STORAGE_KEYS, getWebData, setWebData } from './webStorage';
import type { MealPlanEntry, RecipeSource } from '../types/recipe';

// --- MEAL PLANNER ---
export async function getMealPlans(range?: { fromDate: string; toDate: string }): Promise<MealPlanEntry[]> {
  if (isWebMode()) {
    const all = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    return range ? all.filter(p => p.date >= range.fromDate && p.date <= range.toDate) : all;
  }

  try {
    // With a range: only the requested dates (uses idx_meal_plan_date); without, a full read
    const rows = await getDatabase().getAllAsync(
      `SELECT id, date, slot, kind, recipe_id, recipe_source, ingredient_id, ready_meal_id, label, amount, unit, count, servings, notes, created_at
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

// Planned entries that feed the shopping list: from a date on, without the servings already prepared
// ('ready' recipes do not need shopping). The filter is in SQL, the shopping preview repeats it as a guard.
export async function getShoppingPlanEntries(fromDate: string): Promise<MealPlanEntry[]> {
  if (isWebMode()) {
    return getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, [])
      .filter(p => p.date >= fromDate && !(p.kind === 'recipe' && p.recipe_source === 'ready'));
  }

  try {
    const rows = await getDatabase().getAllAsync(
      `SELECT id, date, slot, kind, recipe_id, recipe_source, ingredient_id, ready_meal_id, label, amount, unit, count, servings, notes, created_at
      FROM meal_plan
      WHERE date >= ? AND NOT (kind = 'recipe' AND recipe_source = 'ready')
      ORDER BY date ASC, slot ASC`,
      [fromDate],
    );
    return rows as MealPlanEntry[];
  } catch (e) {
    console.error('getShoppingPlanEntries error', e);
    return [];
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
  recipeSource?: RecipeSource;
};

function normalizeDetail(input: MealPlanDetailInput) {
  // Out of home: only a label, no link to recipes, ingredients or ready meals
  if (input.kind === 'out') {
    const label = input.label?.trim();
    if (!label) throw new Error('meal plan entry: label must be set for out-of-home meals');
    return {
      kind: 'out' as const,
      recipe_id: null,
      recipe_source: 'prepare' as const,
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
    recipe_source: (input.kind === 'recipe' ? input.recipeSource ?? 'prepare' : 'prepare') as RecipeSource,
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
    recipe_source: d.recipe_source,
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
  if (isWebMode()) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, [...existing, entry]);
    return entry;
  }
  try {
    await runWrite(() => getDatabase().runAsync(BULK_INSERT_SQL, bulkInsertParams(entry)));
  } catch (e) {
    console.error('saveMealPlanEntryDetailed error', e);
  }
  return entry;
}

export async function updateMealPlanEntryDetailed(id: string, input: MealPlanDetailInput): Promise<void> {
  const d = normalizeDetail(input);
  if (isWebMode()) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, existing.map(p => p.id !== id ? p : {
      ...p,
      kind: d.kind,
      recipe_id: d.recipe_id ?? undefined,
      recipe_source: d.recipe_source,
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
      await runWrite(() => getDatabase().runAsync('UPDATE meal_plan SET servings = ? WHERE id = ?', [input.servings, id]));
    }
    await runWrite(() => getDatabase().runAsync(
      'UPDATE meal_plan SET kind = ?, recipe_id = ?, recipe_source = ?, ingredient_id = ?, ready_meal_id = ?, label = ?, amount = ?, unit = ?, count = ? WHERE id = ?',
      [d.kind, d.recipe_id, d.recipe_source, d.ingredient_id, d.ready_meal_id, d.label, d.amount, d.unit, d.count, id]
    ));
  } catch (e) {
    console.error('updateMealPlanEntryDetailed error', e);
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
const BULK_INSERT_SQL = 'INSERT INTO meal_plan (id, date, slot, kind, recipe_id, recipe_source, ingredient_id, ready_meal_id, label, amount, unit, count, servings, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
function bulkInsertParams(e: MealPlanEntry): any[] {
  return [e.id, e.date, e.slot, entryKind(e), e.recipe_id ?? null, e.recipe_source ?? 'prepare', e.ingredient_id ?? null, e.ready_meal_id ?? null, e.label ?? null, e.amount ?? null, e.unit ?? '', e.count ?? 1, e.servings, e.notes || '', e.created_at];
}

export async function saveMealPlanEntriesBulk(entries: MealPlanEntry[]): Promise<void> {
  if (!entries || entries.length === 0) return;

  if (isWebMode()) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    // Replaces only the same recipe/dish on the same day and meal
    const keyOf = (e: MealPlanEntry) => `${e.date}|${e.slot}|${activeKey(e)}`;
    const newKeys = new Set(entries.map(keyOf));
    const filtered = existing.filter(p => !newKeys.has(keyOf(p)));
    setWebData(WEB_STORAGE_KEYS.PLANNER, [...filtered, ...entries]);
    return;
  }

  try {
    const run = async () => {
      for (const entry of entries) {
        await getDatabase()!.runAsync(BULK_DELETE_SQL, bulkDeleteParams(entry));
        await getDatabase()!.runAsync(BULK_INSERT_SQL, bulkInsertParams(entry));
      }
    };
    if (typeof (getDatabase() as any).withTransactionAsync === 'function') {
      await runQueuedTransaction(getDatabase(), run);
    } else {
      await run();
    }
  } catch (e) {
    console.error('saveMealPlanEntriesBulk error', e);
    throw e;
  }
}

export async function deleteMealPlanEntry(id: string): Promise<void> {
  if (isWebMode()) {
    const existing = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    setWebData(WEB_STORAGE_KEYS.PLANNER, existing.filter(p => p.id !== id));
    return;
  }

  try {
    await runWrite(() => getDatabase().runAsync('DELETE FROM meal_plan WHERE id = ?', [id]));
  } catch (e) {
    console.error('deleteMealPlanEntry error', e);
  }
}

/**
 * Deletes all meals planned on the given dates (YYYY-MM-DD format). Returns the number of meals deleted.
 */
export async function deleteMealPlanForDates(dates: string[]): Promise<number> {
  if (!dates || dates.length === 0) return 0;
  const wanted = new Set(dates);

  if (isWebMode()) {
    const plans = getWebData<MealPlanEntry[]>(WEB_STORAGE_KEYS.PLANNER, []);
    const kept = plans.filter(p => !wanted.has(p.date));
    setWebData(WEB_STORAGE_KEYS.PLANNER, kept);
    return plans.length - kept.length;
  }

  const placeholders = dates.map(() => '?').join(',');
  try {
    const row = (await getDatabase().getFirstAsync(
      `SELECT COUNT(*) AS n FROM meal_plan WHERE date IN (${placeholders})`,
      dates,
    )) as { n: number } | null;
    await runWrite(() => getDatabase().runAsync(`DELETE FROM meal_plan WHERE date IN (${placeholders})`, dates));
    return row?.n ?? 0;
  } catch (e) {
    console.error('deleteMealPlanForDates error', e);
    throw e;
  }
}
