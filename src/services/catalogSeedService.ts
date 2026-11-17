import READY_MEALS_SEED from '../data/readyMeals.seed.json';
import { getKV, setKV } from '../db/database';
import { replaceReadyMeals } from '../db/readyMealsDb';
import type { ReadyMealInput } from '../db/readyMealsDb';
import {
  READY_MEAL_CATEGORIES,
  type Nutrient,
  type ReadyMealCategory,
} from '../types/catalog';

const READY_MEALS_FLAG_KEY = 'ready_meals_v1';
// v7: ready meals with nutrients per serving and basis per 100 g (seed v17)
const READY_MEALS_FLAG_KEY_V7 = 'ready_meals_v7';
const CATEGORY_SET = new Set<string>(READY_MEAL_CATEGORIES);

/** Shape of an entry in src/data/readyMeals.seed.json (JSON types are widened). */
interface SeedReadyMealJson {
  name: string;
  category: string;
  tags: string[];
  slots: string[];
  default_count: number;
  nutrients?: Record<string, number> | null;
}

/**
 * Imports the ready meals from the bundled file, skipping invalid categories.
 * Returns the number of ready meals inserted.
 */
async function importReadyMeals(): Promise<number> {
  const items: ReadyMealInput[] = [];
  for (const entry of READY_MEALS_SEED as unknown as SeedReadyMealJson[]) {
    if (!CATEGORY_SET.has(entry.category)) {
      console.warn(`Piatto pronto saltato (categoria non valida): ${entry.name}`);
      continue;
    }
    items.push({
      name: entry.name,
      category: entry.category as ReadyMealCategory,
      tags: entry.tags ?? [],
      slots: entry.slots ?? [],
      default_count: entry.default_count,
      nutrients: (entry.nutrients ?? {}) as Partial<Record<Nutrient, number>>,
    });
  }

  return replaceReadyMeals(items);
}

/**
 * Imports the bundled ready meals on first run only.
 * Returns the number of ready meals inserted.
 */
export async function seedReadyMealsIfEmpty(): Promise<number> {
  if ((await getKV(READY_MEALS_FLAG_KEY)) !== null) return 0;

  const inserted = await importReadyMeals();
  await setKV(READY_MEALS_FLAG_KEY, '1');
  return inserted;
}

/**
 * One-time reset (v2) of the ready meals: replaces them with those from the bundled file.
 * Returns the number of ready meals inserted, or 0 if already done.
 */
export async function seedReadyMealsV2(): Promise<number> {
  if ((await getKV(READY_MEALS_FLAG_KEY_V7)) !== null) return 0;

  const inserted = await importReadyMeals();
  await setKV(READY_MEALS_FLAG_KEY_V7, '1');
  return inserted;
}
