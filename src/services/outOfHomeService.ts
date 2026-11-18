// "Fuori casa" options of the planner: a table seeded from the constant on first use. The user can change the
// table later (edit, export, import); the seed uses INSERT OR IGNORE, so it never overwrites those changes.
import { OUT_OF_HOME_OPTIONS } from '../constants/outOfHome';
import { getDatabase, isWebMode } from '../db/database';
import { OUT_OF_HOME_FORMAT, makeEnvelope, outOfHomeLabelsOf, parseEnvelope } from '../utils/transferFormat';
import { pickJsonText, shareJsonFile } from './jsonFiles';

function idOf(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Inserts the bundled options that are missing. Existing rows (also the user's changes) are kept. */
export async function seedOutOfHomeOptions(): Promise<void> {
  if (isWebMode()) return;
  const db = getDatabase();
  for (const [index, label] of OUT_OF_HOME_OPTIONS.entries()) {
    await db.runAsync(
      'INSERT OR IGNORE INTO out_of_home_option (id, label, sort_order) VALUES (?, ?, ?)',
      [idOf(label), label, index],
    );
  }
}

/** Options in the planner order. Without the table (web fallback, empty database) the bundled list is used. */
export async function listOutOfHomeOptions(): Promise<readonly string[]> {
  if (isWebMode()) return OUT_OF_HOME_OPTIONS;
  const rows: { label: string }[] = await getDatabase().getAllAsync(
    'SELECT label FROM out_of_home_option ORDER BY sort_order ASC',
  );
  return rows.length > 0 ? rows.map(r => r.label) : OUT_OF_HOME_OPTIONS;
}

/** Writes the out-of-home options to a file. Returns how many were written. */
export async function exportOutOfHomeFile(): Promise<number> {
  const labels = [...(await listOutOfHomeOptions())];
  await shareJsonFile(JSON.stringify(makeEnvelope(OUT_OF_HOME_FORMAT, labels), null, 2), 'fuori-casa.json');
  return labels.length;
}

/** Adds the labels that are not there yet (existing options are kept as they are). Returns how many were added. */
export async function addOutOfHomeLabels(labels: string[]): Promise<number> {
  if (isWebMode()) throw new Error('transfer_unavailable');
  const db = getDatabase();
  let added = 0;
  for (const label of labels) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO out_of_home_option (id, label, sort_order)
       VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM out_of_home_option))`,
      [idOf(label), label],
    );
    added += result.changes ?? 0;
  }
  return added;
}

/**
 * Reads an out-of-home file and adds the options that are not there yet.
 * Returns null if the user cancels, otherwise how many were added.
 */
export async function importOutOfHomeFile(): Promise<{ imported: number } | null> {
  const text = await pickJsonText();
  if (text === null) return null;
  const labels = outOfHomeLabelsOf(parseEnvelope(text, OUT_OF_HOME_FORMAT));
  return { imported: await addOutOfHomeLabels(labels) };
}

export interface OutOfHomeEntry {
  id: string;
  label: string;
}

/** Options with their id, in the planner order (empty without the table). Used by the editor. */
export async function listOutOfHomeEntries(): Promise<OutOfHomeEntry[]> {
  if (isWebMode()) return [];
  return getDatabase().getAllAsync('SELECT id, label FROM out_of_home_option ORDER BY sort_order ASC, id ASC');
}

async function checkedLabel(raw: string, exceptId: string | null): Promise<string> {
  const label = raw.trim();
  if (!label) throw new Error('outOfHome.errorEmpty');
  const rows: { id: string; label: string }[] = await getDatabase().getAllAsync(
    'SELECT id, label FROM out_of_home_option',
  );
  const key = label.toLowerCase();
  if (rows.some(r => r.id !== exceptId && r.label.trim().toLowerCase() === key)) {
    throw new Error('outOfHome.errorDuplicate');
  }
  return label;
}

/** Adds an option at the end of the list. Throws 'outOfHome.errorEmpty' or 'outOfHome.errorDuplicate'. */
export async function addOutOfHomeOption(raw: string): Promise<void> {
  if (isWebMode()) throw new Error('transfer_unavailable');
  const label = await checkedLabel(raw, null);
  const db = getDatabase();
  const base = idOf(label) || 'option';
  let id = base;
  for (let n = 2; await db.getFirstAsync('SELECT id FROM out_of_home_option WHERE id = ?', [id]); n++) {
    id = `${base}_${n}`;
  }
  await db.runAsync(
    `INSERT INTO out_of_home_option (id, label, sort_order)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM out_of_home_option))`,
    [id, label],
  );
}

/** Renames an option (the id and the order stay). Planned meals keep the old text. */
export async function renameOutOfHomeOption(id: string, raw: string): Promise<void> {
  if (isWebMode()) throw new Error('transfer_unavailable');
  const label = await checkedLabel(raw, id);
  await getDatabase().runAsync('UPDATE out_of_home_option SET label = ? WHERE id = ?', [label, id]);
}

/** Deletes an option. Planned meals are not touched (they store the label text). */
export async function deleteOutOfHomeOption(id: string): Promise<void> {
  if (isWebMode()) throw new Error('transfer_unavailable');
  await getDatabase().runAsync('DELETE FROM out_of_home_option WHERE id = ?', [id]);
}
