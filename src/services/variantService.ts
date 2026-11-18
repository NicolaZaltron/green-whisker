import { Recipe, RecipeSummary } from '../types/recipe';
import { parseRecipeWithAI } from './aiService';
import { VariantDiet, buildVariantRecord } from './catalogFormat';
import { deleteCatalogRecipes, getRecipeDetail, removeRecipeReferences } from '../db/database';
import { saveCatalogRecipesWithLinks } from '../db/recipeIngredientsDb';
import { refreshCatalog } from './recipeCatalog';
import { buildImportWrite } from './importPlan';
import type { ImportChoice } from '../utils/importResolution';

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
export async function generateVariant(sourceSummary: RecipeSummary, diet: VariantDiet, instructions = ''): Promise<Recipe> {
  // The prompt needs the whole original recipe: its body is loaded here, not in the lists
  const source = await getRecipeDetail(sourceSummary.id);
  if (!source) throw new Error('recipe_not_found');
  const text = [
    `Ricetta originale da adattare a una dieta ${VARIANT_LABEL[diet]} (JSON):`,
    recipeForPrompt(source),
    instructions ? `Istruzioni aggiuntive dell'utente: ${instructions}` : '',
  ].filter(Boolean).join('\n\n');

  const adapted = await parseRecipeWithAI({ text, diet, adapt: true });
  return buildVariantRecord(source, adapted, diet, Date.now());
}

/** Saves the verified variant in the catalog, replacing any previous version. Unknown ingredients need a choice. */
export async function saveVariant(variant: Recipe, choices: ReadonlyMap<string, ImportChoice> = new Map()): Promise<void> {
  // Variant and links in a single transaction
  const { links, plan } = await buildImportWrite([variant], choices);
  await saveCatalogRecipesWithLinks([variant], 'overwrite', links, plan);
  await refreshCatalog([variant.id]);
}

/** Deletes a variant (only it, the original stays) and cleans up references */
export async function deleteVariant(variant: RecipeSummary): Promise<void> {
  const deleted = await deleteCatalogRecipes([variant.id]);
  await removeRecipeReferences(deleted);
  await refreshCatalog(deleted);
}
