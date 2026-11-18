// Preparation of the ingredient links of recipes that are about to be written (recipe book import,
// AI recipe, variant): finds the unknown ingredient names and turns the user's choices into a write plan.
import { ingredientItemFromText } from '../utils/servingsScaler';
import { Recipe } from '../types/recipe';
import type { ImportIngredientPlan } from '../db/ingredientsDb';
import { knownIngredients } from '../db/recipeIngredientsDb';
import type { ImportPlan, RecipeLinkEntry } from '../db/recipeIngredientsDb';
import { findUnresolvedIngredients, userIngredientId } from '../utils/importResolution';
import type { ImportChoice, ImportLinkEntry, UnresolvedIngredient } from '../utils/importResolution';

/** The ingredient rows of each recipe, with the recipe id and title. */
export function buildImportLinks(recipes: Recipe[]): ImportLinkEntry[] {
  const entries: ImportLinkEntry[] = [];
  for (const recipe of recipes) {
    const items = recipe.detailed_ingredients?.length
      ? recipe.detailed_ingredients
      : (recipe.ingredients ?? []).filter(t => t && t.trim()).map(t => ingredientItemFromText(t));
    if (items.length > 0) entries.push({ recipeId: recipe.id, recipeTitle: recipe.title, items });
  }
  return entries;
}

/** Unknown ingredient names of these recipes, grouped for the user's choice. */
export async function findUnresolvedRecipeIngredients(recipes: Recipe[]): Promise<UnresolvedIngredient[]> {
  return findUnresolvedIngredients(buildImportLinks(recipes), await knownIngredients());
}

/**
 * Links and write plan for these recipes. Every unknown name must have a choice: otherwise it throws
 * and nothing is written. New ingredients get ids that do not collide with the existing ones.
 */
export async function buildImportWrite(
  recipes: Recipe[],
  choices: ReadonlyMap<string, ImportChoice>,
): Promise<{ links: RecipeLinkEntry[]; plan: ImportPlan }> {
  const links = buildImportLinks(recipes);
  const known = await knownIngredients();
  const unresolved = findUnresolvedIngredients(links, known);
  if (unresolved.some(item => !choices.has(item.key))) throw new Error('unresolved_ingredients');

  const taken = new Set(known.map(i => i.id));
  const ingredients: ImportIngredientPlan = { created: [], aliases: [] };
  const choiceIds = new Map<string, string>();
  for (const item of unresolved) {
    const choice = choices.get(item.key);
    if (!choice) continue;
    if (choice.kind === 'existing') {
      choiceIds.set(item.key, choice.ingredientId);
      ingredients.aliases.push({ key: item.key, ingredientId: choice.ingredientId });
    } else {
      const id = userIngredientId(item.name, taken);
      ingredients.created.push({ id, name: item.name });
      choiceIds.set(item.key, id);
    }
  }
  return { links, plan: { ingredients, choiceIds, known } };
}
