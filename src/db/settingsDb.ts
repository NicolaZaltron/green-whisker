import { getDatabase, isWebMode, runWrite } from './connection';

// --- KV STORE (preferences, last-gen dates, etc.) ---
export async function getKV(key: string): Promise<string | null> {
  if (isWebMode()) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch { /* ignore */ }
    return null;
  }
  try {
    const row = await getDatabase().getFirstAsync('SELECT value FROM kv_store WHERE key = ?', [key]);
    return row ? (row as any).value : null;
  } catch (e) {
    console.error('getKV error', e);
    throw e;
  }
}

export async function setKV(key: string, value: string): Promise<void> {
  if (isWebMode()) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch { /* ignore */ }
    return;
  }
  try {
    await runWrite(() => getDatabase().runAsync(
      'INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    ));
  } catch (e) {
    console.error('setKV error', e);
    throw e;
  }
}
