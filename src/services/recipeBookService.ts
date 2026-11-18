import { pickJsonText, shareJsonFile } from './jsonFiles';
import { Recipe } from '../types/recipe';
import { deleteCatalogRecipes, removeRecipeReferences } from '../db/database';
import { refreshCatalog } from './recipeCatalog';
import { saveCatalogRecipesWithLinks } from '../db/recipeIngredientsDb';
import { buildImportWrite, findUnresolvedRecipeIngredients } from './importPlan';
import type { ImportChoice, UnresolvedIngredient } from '../utils/importResolution';
import { ExportFilter, ParsedCatalogFile, CATALOG_NOT_LIST_ERROR, exportFileName, normalizeImported, parseCatalogText } from './catalogFormat';
import i18n from '../i18n';

export type ImportMode = 'overwrite' | 'keep';

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  invalid: number;
  duplicates: number;
}

/**
 * Asks the phone for a JSON file and reads it. Returns null if the user cancels.
 */
export async function pickCatalogFile(): Promise<ParsedCatalogFile | null> {
  const text = await pickJsonText();
  if (text === null) return null;
  try {
    return parseCatalogText(text);
  } catch (e: any) {
    if (e?.message === CATALOG_NOT_LIST_ERROR) throw new Error(i18n.t('errors.catalogNotList'));
    throw e;
  }
}

/**
 * Imports the recipes read from a file. With mode 'keep' recipes already present stay unchanged.
 */
/** Unknown ingredient names of the recipe book, grouped for the user's choice. */
export async function findUnresolvedImportIngredients(parsed: ParsedCatalogFile): Promise<UnresolvedIngredient[]> {
  return findUnresolvedRecipeIngredients(parsed.recipes);
}

/**
 * Imports the recipes with their ingredient links. Every unknown ingredient name must have a choice
 * (existing ingredient or a new one): otherwise nothing is written.
 */
export async function applyCatalogImport(
  parsed: ParsedCatalogFile,
  mode: ImportMode,
  choices: ReadonlyMap<string, ImportChoice> = new Map(),
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const now = Date.now();
  const recipes = parsed.recipes.map(r => normalizeImported(r, now));
  const { links, plan } = await buildImportWrite(recipes, choices);
  // Recipes, new ingredients, aliases and links in a single transaction; an error interrupts the import
  const write = await saveCatalogRecipesWithLinks(recipes, mode, links, plan, onProgress);
  console.log('[import] written', { mode, ...write, unresolvedChoices: choices.size, created: plan.ingredients.created.length });
  await refreshCatalog(recipes.map(r => r.id));
  return {
    imported: write.inserted,
    updated: write.updated,
    skipped: write.skipped,
    invalid: parsed.invalid,
    duplicates: parsed.duplicates,
  };
}

/**
 * Deletes the recipes from the catalog, with their variants, and cleans up planner, favorites and notes.
 */
export async function deleteRecipes(ids: string[]): Promise<number> {
  const deleted = await deleteCatalogRecipes(ids);
  await removeRecipeReferences(deleted);
  await refreshCatalog();
  return deleted.length;
}

/**
 * Exports the given recipes as a JSON file, with a name describing the filter used
 */
export async function exportRecipeBook(recipes: Recipe[], filter: ExportFilter): Promise<number> {
  const json = JSON.stringify(recipes, null, 2);
  await shareJsonFile(json, exportFileName(filter, new Date().toISOString().slice(0, 10)));
  return recipes.length;
}
