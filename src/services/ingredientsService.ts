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
  nutrients: Partial<Record<string, number>>;
}

/** Shape with the new id and aliases fields (v9). */
interface SeedJsonEntryWithId extends SeedJsonEntry {
  id: string;
  aliases: string[];
}

const SEED_ITEMS: IngredientInput[] = (SEED as SeedJsonEntryWithId[]).map(entry => ({
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
  aliases: entry.aliases ?? [],
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

// v17: revised seed with nutrients per 100 g and per serving, 980 ingredients, provenance and reliability.
// v16: nutritional values from external review (cooked cereals, fruit, vegetables, sweets, spices), types and duplicates fixed.
// v12: adds the gastronomia tag.
// v11: removes composite items or items with an alternative and applies the nutritional values.
// v10: curated stable ids (readable), aliases and i18n translations for ingredients.
// Note: the v11 reseed deletes planned meals linked to ingredients (the ingredient_ids change).
const SEED_FLAG_KEY_V17 = 'ingredients_seed_v17';

/**
 * One-time reset (v2): deletes all existing ingredients and reimports the base catalog.
 * Ids are regenerated and the recipe-ingredient links disappear along with the ingredients: they must be recreated
 * by reimporting the recipe book (or with a future "relink"). This function is no longer followed by a link seed.
 * Deleting an ingredient also removes the planner entries and links (acceptable in the alpha phase).
 * Returns the number of ingredients inserted, or 0 if the reset was already done.
 */
export async function seedIngredientsV2(): Promise<number> {
  if ((await getKV(SEED_FLAG_KEY_V17)) !== null) return 0;

  const existing = await listIngredients();
  for (const ingredient of existing) {
    await deleteIngredient(ingredient.id);
  }

  const result = await upsertIngredientsByName(SEED_ITEMS);
  await setKV(SEED_FLAG_KEY_V17, '1');
  return result.inserted;
}
