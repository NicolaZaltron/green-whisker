// Versions of the bundled seeds already applied (table seed_meta). On web without SQLite it uses kv_store.
import { getDatabase, getKV, isWebMode, setKV } from './database';

export async function getSeedVersion(name: string): Promise<number> {
  if (isWebMode()) return Number((await getKV(`seed:${name}`)) ?? 0);
  const row: { version: number } | null = await getDatabase().getFirstAsync(
    'SELECT version FROM seed_meta WHERE name = ?',
    [name],
  );
  return row?.version ?? 0;
}

export async function setSeedVersion(name: string, version: number): Promise<void> {
  if (isWebMode()) {
    await setKV(`seed:${name}`, String(version));
    return;
  }
  await getDatabase().runAsync(
    'INSERT OR REPLACE INTO seed_meta (name, version, applied_at) VALUES (?, ?, ?)',
    [name, version, Date.now()],
  );
}
