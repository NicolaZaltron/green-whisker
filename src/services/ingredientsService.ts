import SEED from '../data/ingredients.seed.json';
import { getKV, setKV } from '../db/database';
import { deleteIngredient, listIngredients, upsertIngredientsByName } from '../db/ingredientsDb';
import type { IngredientInput } from '../db/ingredientsDb';
import {
  INGREDIENT_TAGS,
  type IngredientTag,
  type IngredientType,
  type Nutrient,
} from '../types/catalog';

const SEED_FLAG_KEY = 'ingredients_seed_v1';
const TAG_SET = new Set<string>(INGREDIENT_TAGS);

/** Shape of an entry in src/data/ingredients.seed.json (JSON types are widened to string). */
interface SeedJsonEntry {
  name: string;
  type: string;
  tags: string[];
  edible_alone: boolean;
  default_amount: number | null;
  default_unit: string;
  purchase_amount?: number | null;
  purchase_unit?: string;
  density_g_per_ml: number | null;
  nutrients: Record<string, number>;
}

const SEED_ITEMS: IngredientInput[] = (SEED as SeedJsonEntry[]).map(entry => ({
  name: entry.name,
  type: entry.type as IngredientType,
  tags: entry.tags.filter((t): t is IngredientTag => TAG_SET.has(t)),
  edible_alone: entry.edible_alone,
  default_amount: entry.default_amount,
  default_unit: entry.default_unit,
  purchase_amount: entry.purchase_amount ?? null,
  purchase_unit: entry.purchase_unit ?? '',
  density_g_per_ml: entry.density_g_per_ml,
  nutrients: entry.nutrients as Partial<Record<Nutrient, number>>,
}));

/** Imports the bundled starting catalog on first run only. Returns the number of inserted ingredients. */
export async function seedIngredientsIfEmpty(): Promise<number> {
  if ((await getKV(SEED_FLAG_KEY)) !== null) return 0;
  const existing = await listIngredients();
  if (existing.length > 0) return 0;

  const result = await upsertIngredientsByName(SEED_ITEMS);
  await setKV(SEED_FLAG_KEY, '1');
  return result.inserted;
}

// v8: aggiunge riso soffiato, gocce di cioccolato, brodo di carne, peperoncino dolce, pomodorini, aroma al limone
const SEED_FLAG_KEY_V8 = 'ingredients_seed_v8';

/**
 * Reset una tantum (v2): elimina tutti gli ingredienti esistenti e reimporta il catalogo di base.
 * Gli id vengono rigenerati, quindi i collegamenti ricetta-ingrediente vanno rifatti (vedi seedRecipeLinksV2).
 * Eliminare un ingrediente rimuove anche le voci del planner e i collegamenti (accettabile in fase alpha).
 * Returns the number of ingredients inserted, or 0 if the reset was already done.
 */
export async function seedIngredientsV2(): Promise<number> {
  if ((await getKV(SEED_FLAG_KEY_V8)) !== null) return 0;

  const existing = await listIngredients();
  for (const ingredient of existing) {
    await deleteIngredient(ingredient.id);
  }

  const result = await upsertIngredientsByName(SEED_ITEMS);
  await setKV(SEED_FLAG_KEY_V8, '1');
  return result.inserted;
}
