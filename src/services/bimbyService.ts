import { Recipe } from '../types/recipe';
import { upsertCatalogRecipes } from '../db/database';
import { refreshCatalog } from './recipeCatalog';

/** Salva le istruzioni Bimby sulla ricetta (o sulla variante) nel catalogo */
export async function saveBimbySteps(recipe: Recipe, steps: string[], model: 'TM5' | 'TM6'): Promise<void> {
  await upsertCatalogRecipes(
    [{ ...recipe, bimby_steps: steps, bimby_model: model, updated_at: Date.now() }],
    'overwrite'
  );
  await refreshCatalog();
}
