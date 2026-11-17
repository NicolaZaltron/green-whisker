import { Recipe } from '../types/recipe';
import { parseRecipeWithAI } from './aiService';
import { VariantDiet, buildVariantRecord } from './catalogFormat';
import { deleteCatalogRecipes, removeRecipeReferences } from '../db/database';
import { saveCatalogRecipesWithLinks } from '../db/recipeIngredientsDb';
import { removeRecipeFromSimpleItems } from '../db/simpleItemsDb';
import { refreshCatalog } from './recipeCatalog';

const VARIANT_LABEL: Record<VariantDiet, string> = { vegetarian: 'vegetariana', vegan: 'vegana' };

/** Only the fields the AI needs to adapt the recipe: no images, links or technical details */
function recipeForPrompt(source: Recipe): string {
  const essential = {
    title: source.title,
    servings: source.servings,
    times: source.times,
    ingredients: source.ingredients,
    instructions: source.instructions,
    tips: source.tips ?? [],
  };
  return JSON.stringify(essential, null, 2);
}

/**
 * Generates a variant from the original (never from another variant). Does not save anything:
 * the result must be verified by the user with saveVariant.
 */
export async function generateVariant(source: Recipe, diet: VariantDiet, instructions = ''): Promise<Recipe> {
  const text = [
    `Ricetta originale da adattare a una dieta ${VARIANT_LABEL[diet]} (JSON):`,
    recipeForPrompt(source),
    instructions ? `Istruzioni aggiuntive dell'utente: ${instructions}` : '',
  ].filter(Boolean).join('\n\n');

  const adapted = await parseRecipeWithAI({ text, diet, adapt: true });
  return buildVariantRecord(source, adapted, diet, Date.now());
}

/** Saves the verified variant in the catalog, replacing any previous version */
export async function saveVariant(variant: Recipe): Promise<void> {
  // Variant and links in a single transaction
  await saveCatalogRecipesWithLinks([variant], 'overwrite', [{ recipeId: variant.id, items: variant.detailed_ingredients ?? [] }]);
  await refreshCatalog();
}

/** Deletes a variant (only it, the original stays) and cleans up references */
export async function deleteVariant(variant: Recipe): Promise<void> {
  const deleted = await deleteCatalogRecipes([variant.id]);
  await removeRecipeReferences(deleted);
  await removeRecipeFromSimpleItems(deleted);
  await refreshCatalog();
}
