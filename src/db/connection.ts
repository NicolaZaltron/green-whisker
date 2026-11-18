import { Platform } from 'react-native';
import { applySchema } from './schema';
import { memoryFallback, getWebData, setWebData, WEB_STORAGE_KEYS } from './webStorage';
import type { MealPlanEntry } from '../types/recipe';

let dbInstance: any = null;
let isWebFallback = false;

// Transactions on the same database cannot nest or overlap:
// concurrent writes (e.g. shopping consolidation and planner additions) are queued
let transactionQueue: Promise<unknown> = Promise.resolve();

// Queues fn after the operations already in the queue; an error does not block the queue
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = transactionQueue.then(fn, fn);
  transactionQueue = next.catch(() => undefined);
  return next;
}

// withTransactionAsync does not return the task value (Promise<void>): it is captured inside the transaction
export function runQueuedTransaction<T>(db: any, fn: () => Promise<T>): Promise<T> {
  return enqueue(async () => {
    let result: T | undefined;
    await db.withTransactionAsync(async () => {
      result = await fn();
    });
    return result as T;
  });
}

// Single write outside a transaction, queued with the transactions: it must never be called
// from inside a runQueuedTransaction (the queue would block on itself)
export function runWrite<T>(fn: () => Promise<T>): Promise<T> {
  return enqueue(fn);
}

// Renames applied when the takeaway options were renamed (old name -> new name)
export const OUT_OF_HOME_LABEL_RENAMES: Record<string, string> = {
  'Asporto pizza': 'Asporto - Pizza',
  'Asporto cinese': 'Asporto - Cinese',
};

// Rewrites the old out-of-home meal labels in the planner. Idempotent: new names are not keys of the map
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

/**
 * Deletes all local data: on-device database, or localStorage and memory on web.
 * After the call the app must be restarted to recreate the database and rerun the seeds.
 */
export async function resetAllData(): Promise<void> {
  if (isWebFallback || !dbInstance) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    memoryFallback.clear();
    return;
  }
  const SQLite = await import('expo-sqlite');
  await dbInstance.closeAsync();
  dbInstance = null;
  await SQLite.deleteDatabaseAsync('greenwhisker.db');
}

export async function initDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    // Web uses the same SQLite engine (WebAssembly) as the phone. If it cannot open, the app keeps
    // working on localStorage and memory (limited: the catalog does not fit in localStorage)
    try {
      const SQLite = await import('expo-sqlite');
      dbInstance = await SQLite.openDatabaseAsync('greenwhisker.db');
      await applySchema(dbInstance);
      isWebFallback = false;
    } catch (e) {
      console.warn('SQLite non disponibile sul web, uso la memoria locale:', e);
      dbInstance = null;
      isWebFallback = true;
      try {
        await migrateOutOfHomeLabels();
      } catch (migrationError) {
        console.warn('Rinomina etichette fuori casa non riuscita:', migrationError);
      }
      return;
    }
    try {
      await migrateOutOfHomeLabels();
    } catch (migrationError) {
      console.warn('Rinomina etichette fuori casa non riuscita:', migrationError);
    }
    return;
  }

  try {
    const SQLite = await import('expo-sqlite');
    dbInstance = await SQLite.openDatabaseAsync('greenwhisker.db');

    await applySchema(dbInstance);

  } catch (error) {
    // Web does not get here (it returns right above and uses localStorage). On native we do not fall back
    // to localStorage (silent empty data): the error is propagated at startup
    console.error('SQLite init failed:', error);
    dbInstance = null;
    throw error;
  }

  // After a successful init (the catch above rethrows, so we only get here on success)
  try {
    await migrateOutOfHomeLabels();
  } catch (e) {
    console.warn('Rinomina etichette fuori casa non riuscita:', e);
  }
}

export function getDatabase(): any {
  return dbInstance;
}

// The open database, or an error when there is none (native only: web does not use it)
export function requireDb(): any {
  const db = getDatabase();
  if (!db) throw new Error('database_unavailable');
  return db;
}

// Runs fn in a queued transaction when the driver supports it, otherwise runs it directly
export function runInTransaction<T>(db: any, fn: () => Promise<T>): Promise<T> {
  if (typeof db.withTransactionAsync === 'function') return runQueuedTransaction(db, fn);
  return fn();
}

export function isWebMode(): boolean {
  return isWebFallback || !dbInstance;
}
