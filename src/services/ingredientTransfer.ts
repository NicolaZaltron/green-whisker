// Import and export of the ingredients (the seed ones and the user's ones) as a file.
import { listIngredients, saveIngredient } from '../db/ingredientsDb';
import type { SaveIngredientInput } from '../db/ingredientsDb';
import { INGREDIENTS_FORMAT, makeEnvelope, parseEnvelope } from '../utils/transferFormat';
import { pickJsonText, shareJsonFile } from './jsonFiles';

/** Writes every ingredient to a file. Returns how many were written. */
export async function exportIngredientsFile(): Promise<number> {
  const items = (await listIngredients()).map(i => ({
    id: i.id,
    name: i.name,
    aliases: i.aliases,
    type: i.type,
    tags: i.tags,
    edible_alone: i.edible_alone,
    default_amount: i.default_amount,
    default_unit: i.default_unit,
    purchase_amount: i.purchase_amount,
    purchase_unit: i.purchase_unit,
    density_g_per_ml: i.density_g_per_ml,
    nutrients: i.nutrients,
  }));
  await shareJsonFile(JSON.stringify(makeEnvelope(INGREDIENTS_FORMAT, items), null, 2), 'ingredienti.json');
  return items.length;
}

/**
 * Reads an ingredients file and saves each item (same id: updated, otherwise added as user ingredient).
 * Returns null if the user cancels; items that do not pass the checks are counted as invalid.
 */
export async function importIngredientsFile(): Promise<{ imported: number; invalid: number } | null> {
  const text = await pickJsonText();
  if (text === null) return null;
  const items = parseEnvelope(text, INGREDIENTS_FORMAT);
  let imported = 0;
  let invalid = 0;
  for (const item of items) {
    try {
      await saveIngredient(item as SaveIngredientInput);
      imported++;
    } catch {
      invalid++;
    }
  }
  return { imported, invalid };
}
