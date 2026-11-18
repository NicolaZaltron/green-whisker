// Import and export of the ready meals as a file (same header format as ingredients and out-of-home).
import { listReadyMeals, upsertReadyMeals } from '../db/readyMealsDb';
import type { SeedReadyMealInput } from '../db/readyMealsDb';
import { makeEnvelope, parseEnvelope, READY_MEALS_FORMAT } from '../utils/transferFormat';
import { pickJsonText, shareJsonFile } from './jsonFiles';

/** Writes every ready meal to a file. Returns how many were written. */
export async function exportReadyMealsFile(): Promise<number> {
  const items = await listReadyMeals();
  await shareJsonFile(JSON.stringify(makeEnvelope(READY_MEALS_FORMAT, items), null, 2), 'piatti-pronti.json');
  return items.length;
}

/**
 * Reads a ready meals file and saves each item by id (existing ones are updated).
 * Returns null if the user cancels; items without an id or that do not pass the checks are counted as invalid.
 */
export async function importReadyMealsFile(): Promise<{ imported: number; invalid: number } | null> {
  const text = await pickJsonText();
  if (text === null) return null;
  const items = parseEnvelope(text, READY_MEALS_FORMAT);
  let imported = 0;
  let invalid = 0;
  for (const item of items) {
    const candidate = item as SeedReadyMealInput;
    if (typeof candidate?.id !== 'string' || !candidate.id.trim()) {
      invalid++;
      continue;
    }
    try {
      await upsertReadyMeals([candidate]);
      imported++;
    } catch {
      invalid++;
    }
  }
  return { imported, invalid };
}
