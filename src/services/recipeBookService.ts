import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Recipe } from '../types/recipe';
import { deleteCatalogRecipes, removeRecipeReferences, upsertCatalogRecipes } from '../db/database';
import { refreshCatalog } from './recipeCatalog';
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
 * Legge il file scelto provando più metodi, in ordine. Se tutti falliscono, l'errore elenca ogni tentativo.
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
 * Chiede un file JSON al telefono e lo legge. Restituisce null se l'utente annulla.
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
    return parseCatalogText(text);
  } catch (e: any) {
    if (e?.message === CATALOG_NOT_LIST_ERROR) throw new Error(i18n.t('errors.catalogNotList'));
    throw e;
  }
}

/**
 * Importa le ricette lette da un file. Con mode 'keep' le ricette già presenti restano invariate.
 */
export async function applyCatalogImport(parsed: ParsedCatalogFile, mode: ImportMode): Promise<ImportResult> {
  const now = Date.now();
  const write = await upsertCatalogRecipes(parsed.recipes.map(r => normalizeImported(r, now)), mode);
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
 * Elimina le ricette dal catalogo, con le loro varianti, e ripulisce planner, preferiti e note.
 */
export async function deleteRecipes(ids: string[]): Promise<number> {
  const deleted = await deleteCatalogRecipes(ids);
  await removeRecipeReferences(deleted);
  await refreshCatalog();
  return deleted.length;
}

/**
 * Esporta le ricette indicate come file JSON, con il nome che descrive il filtro usato
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
