import READY_MEALS_SEED from '../data/readyMeals.seed.json';
import BUNDLED_RECIPES from '../data/bundledRecipes.json';
import { upsertReadyMeals } from '../db/readyMealsDb';
import type { SeedReadyMealInput } from '../db/readyMealsDb';
import { getSeedVersion, setSeedVersion } from '../db/seedMeta';
import {
  READY_MEAL_CATEGORIES,
  type Nutrient,
  type ReadyMealCategory,
} from '../types/catalog';
import { parseCatalogText } from './catalogFormat';
import { applyCatalogImport, findUnresolvedImportIngredients } from './recipeBookService';
import type { ImportChoice } from '../utils/importResolution';

// Versions of the bundled seeds, stored in seed_meta. Bump a version when its seed file changes.
const READY_MEALS_SEED_VERSION = 8; // stable slug ids, upserted by id: planned entries survive a new seed
const BUNDLED_RECIPES_SEED_VERSION = 2; // 2: recipes carry origin bundled (overwrite, so existing copies get it too)
const CATEGORY_SET = new Set<string>(READY_MEAL_CATEGORIES);

/** Shape of an entry in src/data/readyMeals.seed.json (JSON types are widened). */
interface SeedReadyMealJson {
  id: string;
  name: string;
  category: string;
  tags: string[];
  slots: string[];
  default_count: number;
  nutrients?: Record<string, number> | null;
}

/**
 * Upserts the ready meals from the bundled file by id, when the seed version changes.
 * Returns the number of ready meals written.
 */
export async function seedReadyMealsV2(): Promise<number> {
  if ((await getSeedVersion('ready_meals')) >= READY_MEALS_SEED_VERSION) return 0;

  const items: SeedReadyMealInput[] = [];
  for (const entry of READY_MEALS_SEED as unknown as SeedReadyMealJson[]) {
    if (!CATEGORY_SET.has(entry.category)) {
      console.warn(`Piatto pronto saltato (categoria non valida): ${entry.name}`);
      continue;
    }
    items.push({
      id: entry.id,
      name: entry.name,
      category: entry.category as ReadyMealCategory,
      tags: entry.tags ?? [],
      slots: entry.slots ?? [],
      default_count: entry.default_count,
      nutrients: (entry.nutrients ?? {}) as Partial<Record<Nutrient, number>>,
    });
  }
  const written = await upsertReadyMeals(items);
  await setSeedVersion('ready_meals', READY_MEALS_SEED_VERSION);
  return written;
}

/**
 * Adds the bundled simple recipes when their version changes. Recipes already in the catalog with the same
 * id are kept. An ingredient of the bundled recipes that the database does not know is added as a new one
 * (the seed is checked to have none, see scripts/test_bundled_recipes.js). Returns the number of recipes inserted.
 */
export async function seedBundledRecipesV1(): Promise<number> {
  if ((await getSeedVersion('bundled_recipes')) >= BUNDLED_RECIPES_SEED_VERSION) return 0;

  const parsed = parseCatalogText(JSON.stringify(BUNDLED_RECIPES));
  const unknown = await findUnresolvedImportIngredients(parsed);
  const choices = new Map<string, ImportChoice>(unknown.map(item => [item.key, { kind: 'new' }]));
  const result = await applyCatalogImport(parsed, 'overwrite', choices);
  await setSeedVersion('bundled_recipes', BUNDLED_RECIPES_SEED_VERSION);
  return result.imported;
}
