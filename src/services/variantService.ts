import { Recipe } from '../types/recipe';
import { parseRecipeWithAI } from './aiService';
import { VariantDiet, buildVariantRecord } from './catalogFormat';
import { deleteCatalogRecipes, removeRecipeReferences, upsertCatalogRecipes } from '../db/database';
import { removeRecipeFromSimpleItems } from '../db/simpleItemsDb';
import { refreshCatalog } from './recipeCatalog';

const VARIANT_LABEL: Record<VariantDiet, string> = { vegetarian: 'vegetariana', vegan: 'vegana' };

/** Solo i campi che servono all'AI per adattare la ricetta: niente immagini, link e dettagli tecnici */
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
 * Genera una variante a partire dall'originale (mai da un'altra variante). Non salva nulla:
 * il risultato va verificato dall'utente con saveVariant.
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

/** Salva la variante verificata nel catalogo, sostituendo l'eventuale versione precedente */
export async function saveVariant(variant: Recipe): Promise<void> {
  await upsertCatalogRecipes([variant], 'overwrite');
  await refreshCatalog();
}

/** Elimina una variante (solo lei, l'originale resta) e ripulisce i riferimenti */
export async function deleteVariant(variant: Recipe): Promise<void> {
  const deleted = await deleteCatalogRecipes([variant.id]);
  await removeRecipeReferences(deleted);
  await removeRecipeFromSimpleItems(deleted);
  await refreshCatalog();
}
