import LINKS from '../data/recipes.catalog.json';
import READY_MEALS_SEED from '../data/readyMeals.seed.json';
import { getKV, setKV } from '../db/database';
import { listIngredients } from '../db/ingredientsDb';
import { replaceReadyMeals } from '../db/readyMealsDb';
import type { ReadyMealInput } from '../db/readyMealsDb';
import { replaceRecipeIngredients } from '../db/recipeIngredientsDb';
import {
  READY_MEAL_CATEGORIES,
  type Ingredient,
  type Nutrient,
  type ReadyMealCategory,
  type RecipeIngredient,
} from '../types/catalog';

const RECIPE_LINKS_FLAG_KEY = 'recipe_links_v1';
const READY_MEALS_FLAG_KEY = 'ready_meals_v1';
// v16: ricollega le ricette con gli ingredient_id del seme aggiornato.
const RECIPE_LINKS_FLAG_KEY_V16 = 'recipe_links_v16';
// v4: ricarica i pronti dopo aver tolto il fuori casa (i database con v2 già impostato tenevano le voci vecchie)
const READY_MEALS_FLAG_KEY_V6 = 'ready_meals_v6';
const CATEGORY_SET = new Set<string>(READY_MEAL_CATEGORIES);

/** Shape of an entry in src/data/recipes.catalog.json (JSON types are widened). */
interface SeedLinkJson {
  recipe_id: string;
  ingredients: {
    ingredient_id: string;
    ingredient: string;
    amount: number | null;
    unit: string;
    note: string;
    position: number;
  }[];
}

/** Shape of an entry in src/data/readyMeals.seed.json (JSON types are widened). */
interface SeedReadyMealJson {
  name: string;
  category: string;
  tags: string[];
  slots: string[];
  default_count: number;
  nutrients?: Record<string, number> | null;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Sostituisce tutti i collegamenti ricetta-ingrediente con quelli del catalogo.
 * Usa ingredient_id quando esiste nel seme; altrimenti ripiega su nome o alias.
 * Returns the number of rows inserted.
 */
async function importRecipeLinks(ingredients: Ingredient[]): Promise<number> {
  const idSet = new Set(ingredients.map(ingredient => ingredient.id));
  const idByName = new Map<string, string>();
  for (const ingredient of ingredients) {
    idByName.set(nameKey(ingredient.name), ingredient.id);
  }
  for (const ingredient of ingredients) {
    for (const alias of ingredient.aliases) {
      if (!idByName.has(alias)) idByName.set(alias, ingredient.id);
    }
  }

  const rows: RecipeIngredient[] = [];
  const unknownNames = new Set<string>();
  let skipped = 0;

  for (const link of LINKS as unknown as SeedLinkJson[]) {
    for (const entry of link.ingredients) {
      const ingredientId = idSet.has(entry.ingredient_id)
        ? entry.ingredient_id
        : idByName.get(nameKey(entry.ingredient));
      if (!ingredientId) {
        skipped += 1;
        unknownNames.add(entry.ingredient);
        continue;
      }
      rows.push({
        recipe_id: link.recipe_id,
        ingredient_id: ingredientId,
        amount: typeof entry.amount === 'number' ? entry.amount : null,
        unit: entry.unit ?? '',
        note: entry.note ?? '',
        position: entry.position,
      });
    }
  }

  if (skipped > 0) {
    console.warn(
      `Collegamenti ricetta-ingrediente saltati: ${skipped} (ingredienti sconosciuti: ${[...unknownNames].join(', ')})`,
    );
  }

  return replaceRecipeIngredients(rows);
}

/**
 * Importa i piatti pronti dal file incluso, saltando le categorie non valide.
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
 * Links recipes to catalog ingredients on first run only.
 * Returns the number of recipe-ingredient rows inserted.
 */
export async function seedRecipeLinksIfEmpty(): Promise<number> {
  if ((await getKV(RECIPE_LINKS_FLAG_KEY)) !== null) return 0;

  const ingredients = await listIngredients();
  if (ingredients.length === 0) return 0;

  const inserted = await importRecipeLinks(ingredients);
  await setKV(RECIPE_LINKS_FLAG_KEY, '1');
  return inserted;
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
 * Reset una tantum (v2) dei collegamenti ricetta-ingrediente: li sostituisce sempre,
 * senza controllo di tabella vuota. Va eseguita dopo seedIngredientsV2 (ids rigenerati).
 * Returns the number of recipe-ingredient rows inserted, or 0 if already done.
 */
export async function seedRecipeLinksV2(): Promise<number> {
  if ((await getKV(RECIPE_LINKS_FLAG_KEY_V16)) !== null) return 0;

  const inserted = await importRecipeLinks(await listIngredients());
  await setKV(RECIPE_LINKS_FLAG_KEY_V16, '1');
  return inserted;
}

/**
 * Reset una tantum (v2) dei piatti pronti: li sostituisce con quelli del file incluso.
 * Returns the number of ready meals inserted, or 0 if already done.
 */
export async function seedReadyMealsV2(): Promise<number> {
  if ((await getKV(READY_MEALS_FLAG_KEY_V6)) !== null) return 0;

  const inserted = await importReadyMeals();
  await setKV(READY_MEALS_FLAG_KEY_V6, '1');
  return inserted;
}
