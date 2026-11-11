import type { SimpleItem, SimpleSlot } from '../types/recipe';
import type { SimpleTag } from '../constants/simpleTags';
import { ALL_SIMPLE_SLOTS } from '../utils/simpleSlots';
import { getDatabase, getWebData, isWebMode, runQueuedTransaction, runWrite, setWebData, WEB_STORAGE_KEYS } from './database';

export interface SimpleItemInput {
  id?: string;
  name: string;
  tags: SimpleTag[];
  amount: number | null;
  unit: string;
  recipe_ids: string[];
  slots?: SimpleSlot[];
}

export type SimpleItemSeed = Omit<SimpleItem, 'id' | 'created_at' | 'updated_at' | 'slots'> & {
  slots?: SimpleSlot[];
};

let slotsColumnReady: Promise<void> | null = null;

/**
 * Adds the `slots` column to simple_items on native databases created before it existed.
 * Runs once per app session. No-op on web.
 */
export function ensureSimpleItemsSlotsColumn(): Promise<void> {
  if (isWebMode()) {
    return Promise.resolve();
  }
  if (!slotsColumnReady) {
    slotsColumnReady = (async () => {
      const db = requireDb();
      const columns = (await db.getAllAsync('PRAGMA table_info(simple_items)')) as Record<string, unknown>[];
      const hasSlots = columns.some(column => column.name === 'slots');
      if (!hasSlots) {
        await runWrite(() => db.runAsync("ALTER TABLE simple_items ADD COLUMN slots TEXT NOT NULL DEFAULT '[]'"));
      }
    })().catch(error => {
      slotsColumnReady = null;
      throw error;
    });
  }
  return slotsColumnReady;
}

function generateSimpleItemId(): string {
  return `simple-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function requireDb(): any {
  const db = getDatabase();
  if (!db) {
    throw new Error('database_not_initialized');
  }
  return db;
}

function parseStringArray<T extends string>(value: unknown): T[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? (parsed.filter(v => typeof v === 'string') as T[]) : [];
}

function parseSlots(value: unknown): SimpleSlot[] {
  return parseStringArray<SimpleSlot>(value).filter(slot =>
    (ALL_SIMPLE_SLOTS as string[]).includes(slot)
  );
}

function rowToSimpleItem(row: Record<string, unknown>): SimpleItem {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    tags: parseStringArray<SimpleTag>(row.tags),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    unit: String(row.unit ?? ''),
    recipe_ids: parseStringArray<string>(row.recipe_ids),
    slots: parseSlots(row.slots),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function readWebItems(): SimpleItem[] {
  // Items stored before `slots` existed come back without it: default to [].
  return getWebData<SimpleItem[]>(WEB_STORAGE_KEYS.SIMPLE_ITEMS, []).map(item => ({
    ...item,
    slots: parseSlots(item.slots),
  }));
}

function writeWebItems(items: SimpleItem[]): void {
  setWebData(WEB_STORAGE_KEYS.SIMPLE_ITEMS, items);
}

export async function listSimpleItems(): Promise<SimpleItem[]> {
  await ensureSimpleItemsSlotsColumn();
  if (isWebMode()) {
    return [...readWebItems()].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }
  try {
    const db = requireDb();
    const rows = await db.getAllAsync('SELECT * FROM simple_items ORDER BY name COLLATE NOCASE');
    return (rows as Record<string, unknown>[]).map(rowToSimpleItem);
  } catch (error) {
    console.error('listSimpleItems failed:', error);
    throw error;
  }
}

export async function getSimpleItem(id: string): Promise<SimpleItem | null> {
  await ensureSimpleItemsSlotsColumn();
  if (isWebMode()) {
    return readWebItems().find(item => item.id === id) ?? null;
  }
  try {
    const db = requireDb();
    const row = await db.getFirstAsync('SELECT * FROM simple_items WHERE id = ?', [id]);
    return row ? rowToSimpleItem(row as Record<string, unknown>) : null;
  } catch (error) {
    console.error('getSimpleItem failed:', error);
    throw error;
  }
}

export async function saveSimpleItem(input: SimpleItemInput): Promise<SimpleItem> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('name_required');
  }

  await ensureSimpleItemsSlotsColumn();
  const id = input.id || generateSimpleItemId();
  const now = Date.now();
  const slots = parseSlots(input.slots ?? []);

  if (isWebMode()) {
    const items = readWebItems();
    const index = items.findIndex(item => item.id === id);
    const createdAt = index >= 0 ? items[index].created_at : now;
    const saved: SimpleItem = {
      id,
      name,
      tags: input.tags,
      amount: input.amount,
      unit: input.unit,
      recipe_ids: input.recipe_ids,
      slots,
      created_at: createdAt,
      updated_at: now,
    };
    if (index >= 0) {
      items[index] = saved;
    } else {
      items.push(saved);
    }
    writeWebItems(items);
    return saved;
  }

  try {
    const db = requireDb();
    const existing = await db.getFirstAsync('SELECT created_at FROM simple_items WHERE id = ?', [id]);
    const createdAt = existing ? Number((existing as Record<string, unknown>).created_at ?? now) : now;
    await runWrite(() =>
      db.runAsync(
        `INSERT OR REPLACE INTO simple_items (id, name, tags, amount, unit, recipe_ids, slots, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          JSON.stringify(input.tags),
          input.amount ?? null,
          input.unit,
          JSON.stringify(input.recipe_ids),
          JSON.stringify(slots),
          createdAt,
          now,
        ]
      )
    );
    return {
      id,
      name,
      tags: input.tags,
      amount: input.amount ?? null,
      unit: input.unit,
      recipe_ids: input.recipe_ids,
      slots,
      created_at: createdAt,
      updated_at: now,
    };
  } catch (error) {
    console.error('saveSimpleItem failed:', error);
    throw error;
  }
}

export async function deleteSimpleItem(id: string): Promise<void> {
  if (isWebMode()) {
    writeWebItems(readWebItems().filter(item => item.id !== id));
    return;
  }
  try {
    const db = requireDb();
    await runWrite(() => db.runAsync('DELETE FROM simple_items WHERE id = ?', [id]));
  } catch (error) {
    console.error('deleteSimpleItem failed:', error);
    throw error;
  }
}

export async function findSimpleItemByName(name: string): Promise<SimpleItem | null> {
  const target = normalizeName(name);
  if (isWebMode()) {
    return readWebItems().find(item => normalizeName(item.name) === target) ?? null;
  }
  try {
    const db = requireDb();
    const row = await db.getFirstAsync(
      'SELECT * FROM simple_items WHERE LOWER(TRIM(name)) = ? LIMIT 1',
      [target]
    );
    return row ? rowToSimpleItem(row as Record<string, unknown>) : null;
  } catch (error) {
    console.error('findSimpleItemByName failed:', error);
    throw error;
  }
}

export async function upsertSimpleItemsByName(
  items: SimpleItemSeed[]
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  await ensureSimpleItemsSlotsColumn();

  if (isWebMode()) {
    const current = readWebItems();
    const now = Date.now();
    for (const input of items) {
      const target = normalizeName(input.name);
      const index = current.findIndex(item => normalizeName(item.name) === target);
      const inputSlots = parseSlots(input.slots ?? []);
      if (index >= 0) {
        const existing = current[index];
        current[index] = {
          ...existing,
          tags: input.tags,
          amount: input.amount,
          unit: input.unit,
          recipe_ids: input.recipe_ids,
          slots: inputSlots.length > 0 ? inputSlots : existing.slots,
          updated_at: now,
        };
        updated++;
      } else {
        current.push({
          id: generateSimpleItemId(),
          name: input.name.trim(),
          tags: input.tags,
          amount: input.amount,
          unit: input.unit,
          recipe_ids: input.recipe_ids,
          slots: inputSlots,
          created_at: now,
          updated_at: now,
        });
        inserted++;
      }
    }
    writeWebItems(current);
    return { inserted, updated };
  }

  try {
    const db = requireDb();

    const runAll = async (): Promise<void> => {
      for (const input of items) {
        const now = Date.now();
        const target = normalizeName(input.name);
        const inputSlots = parseSlots(input.slots ?? []);
        const existing = await db.getFirstAsync(
          'SELECT id, slots FROM simple_items WHERE LOWER(TRIM(name)) = ? LIMIT 1',
          [target]
        );
        if (existing) {
          const existingRow = existing as Record<string, unknown>;
          const slots = inputSlots.length > 0 ? inputSlots : parseSlots(existingRow.slots);
          await db.runAsync(
            'UPDATE simple_items SET tags = ?, amount = ?, unit = ?, recipe_ids = ?, slots = ?, updated_at = ? WHERE id = ?',
            [
              JSON.stringify(input.tags),
              input.amount ?? null,
              input.unit,
              JSON.stringify(input.recipe_ids),
              JSON.stringify(slots),
              now,
              existingRow.id,
            ]
          );
          updated++;
        } else {
          await db.runAsync(
            `INSERT INTO simple_items (id, name, tags, amount, unit, recipe_ids, slots, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              generateSimpleItemId(),
              input.name.trim(),
              JSON.stringify(input.tags),
              input.amount ?? null,
              input.unit,
              JSON.stringify(input.recipe_ids),
              JSON.stringify(inputSlots),
              now,
              now,
            ]
          );
          inserted++;
        }
      }
    };

    if (typeof db.withTransactionAsync === 'function') {
      await runQueuedTransaction(db, runAll);
    } else {
      await runAll();
    }
    return { inserted, updated };
  } catch (error) {
    console.error('upsertSimpleItemsByName failed:', error);
    throw error;
  }
}

export async function removeRecipeFromSimpleItems(recipeIds: string[]): Promise<number> {
  const toRemove = new Set(recipeIds);
  if (toRemove.size === 0) {
    return 0;
  }

  if (isWebMode()) {
    let changed = 0;
    const next = readWebItems().map(item => {
      const remaining = item.recipe_ids.filter(id => !toRemove.has(id));
      if (remaining.length === item.recipe_ids.length) {
        return item;
      }
      changed++;
      return { ...item, recipe_ids: remaining };
    });
    if (changed > 0) {
      writeWebItems(next);
    }
    return changed;
  }

  try {
    const db = requireDb();
    return await runQueuedTransaction(db, async () => {
      const rows = (await db.getAllAsync('SELECT id, recipe_ids FROM simple_items')) as Record<string, unknown>[];
      let changed = 0;
      const now = Date.now();
      for (const row of rows) {
        const current = parseStringArray<string>(row.recipe_ids);
        const remaining = current.filter(id => !toRemove.has(id));
        if (remaining.length === current.length) {
          continue;
        }
        await db.runAsync('UPDATE simple_items SET recipe_ids = ?, updated_at = ? WHERE id = ?', [
          JSON.stringify(remaining),
          now,
          row.id,
        ]);
        changed++;
      }
      return changed;
    });
  } catch (error) {
    console.error('removeRecipeFromSimpleItems failed:', error);
    throw error;
  }
}
