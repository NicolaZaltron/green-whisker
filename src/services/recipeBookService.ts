import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Recipe } from '../types/recipe';
import { deleteCatalogRecipes, removeRecipeReferences } from '../db/database';
import { removeRecipeFromSimpleItems } from '../db/simpleItemsDb';
import { refreshCatalog } from './recipeCatalog';
import { RecipeLinkEntry, saveCatalogRecipesWithLinks } from '../db/recipeIngredientsDb';
import { ingredientItemFromText } from '../utils/servingsScaler';
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
 * Reads the chosen file trying several methods, in order. If all fail, the error lists every attempt.
 */
async function readPickedFile(asset: { uri: string; file?: Blob & { text(): Promise<string> } }): Promise<string> {
  if (Platform.OS === 'web' && asset.file) return asset.file.text();

  const attempts: { name: string; read: () => Promise<string> }[] = [
    { name: 'File', read: () => new File(asset.uri).text() },
    { name: 'fetch', read: () => fetch(asset.uri).then(r => r.text()) },
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const text = await attempt.read();
      console.info(`Ricettario letto con il metodo: ${attempt.name}`);
      return text;
    } catch (e: any) {
      errors.push(`${attempt.name}: ${e?.message ?? e}`);
    }
  }
  throw new Error(errors.join(' | '));
}

/**
 * Asks the phone for a JSON file and reads it. Returns null if the user cancels.
 */
export async function pickCatalogFile(): Promise<ParsedCatalogFile | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return null;

  const asset = picked.assets[0];
  const text = await readPickedFile(asset);
  try {
    const parsedFile = parseCatalogText(text);
    return parsedFile;
  } catch (e: any) {
    if (e?.message === CATALOG_NOT_LIST_ERROR) throw new Error(i18n.t('errors.catalogNotList'));
    throw e;
  }
}

/**
 * Imports the recipes read from a file. With mode 'keep' recipes already present stay unchanged.
 */
export async function applyCatalogImport(parsed: ParsedCatalogFile, mode: ImportMode): Promise<ImportResult> {
  const now = Date.now();
  const recipes = parsed.recipes.map(r => normalizeImported(r, now));
  // A recipe without details does not touch the existing links: the text rows are used if present,
  // otherwise the recipe is omitted. In 'keep' links are created only for the recipes written.
  const links: RecipeLinkEntry[] = [];
  for (const recipe of recipes) {
    const items = recipe.detailed_ingredients?.length
      ? recipe.detailed_ingredients
      : (recipe.ingredients ?? []).filter(t => t && t.trim()).map(t => ingredientItemFromText(t));
    if (items.length > 0) links.push({ recipeId: recipe.id, items });
  }
  // Recipes and links in a single transaction; an error interrupts the import and reaches the caller
  const write = await saveCatalogRecipesWithLinks(recipes, mode, links);
  await refreshCatalog();
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
  await removeRecipeFromSimpleItems(deleted);
  await refreshCatalog();
  return deleted.length;
}

/**
 * Exports the given recipes as a JSON file, with a name describing the filter used
 */
export async function exportRecipeBook(recipes: Recipe[], filter: ExportFilter): Promise<number> {
  const json = JSON.stringify(recipes, null, 2);
  const fileName = exportFileName(filter, new Date().toISOString().slice(0, 10));

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return recipes.length;
  }

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
  return recipes.length;
}
