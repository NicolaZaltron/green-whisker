import SEED from '../data/ingredients.seed.json';
import { getSeedVersion, setSeedVersion } from '../db/seedMeta';
import { upsertIngredientsByName } from '../db/ingredientsDb';
import type { IngredientInput } from '../db/ingredientsDb';
import {
  INGREDIENT_TAGS,
  type IngredientTag,
  type IngredientType,
  type Nutrient,
} from '../types/catalog';

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

const SEED_ITEMS: (IngredientInput & { id: string })[] = (SEED as SeedJsonEntryWithId[]).map(entry => ({
  id: entry.id,
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

// v17: revised seed with nutrients per 100 g and per serving, 980 ingredients, provenance and reliability.
// v16: nutritional values from external review (cooked cereals, fruit, vegetables, sweets, spices), types and duplicates fixed.
// v12: adds the gastronomia tag.
// v11: removes composite items or items with an alternative and applies the nutritional values.
// v10: curated stable ids (readable), aliases and i18n translations for ingredients.
// Note: the v11 reseed deletes planned meals linked to ingredients (the ingredient_ids change).
// Version of this seed in seed_meta: bump it when the seed changes
export const INGREDIENTS_SEED_VERSION = 17;

/**
 * Upserts the seed ingredients by id when the seed version changes. Nothing is deleted: planned entries and
 * links survive a new seed. Returns the number of ingredients inserted.
 */
export async function seedIngredientsV2(): Promise<number> {
  if ((await getSeedVersion('ingredients')) >= INGREDIENTS_SEED_VERSION) return 0;
  const result = await upsertIngredientsByName(SEED_ITEMS);
  await setSeedVersion('ingredients', INGREDIENTS_SEED_VERSION);
  return result.inserted;
}
