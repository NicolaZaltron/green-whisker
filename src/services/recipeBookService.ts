import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Recipe } from '../types/recipe';
import { getCustomRecipes, saveCustomRecipe } from '../db/database';
import { catalogRecipes, syncRecipeCatalog } from './recipeCatalog';

const REQUIRED_STRING_FIELDS = ['id', 'title', 'category'] as const;
const REQUIRED_ARRAY_FIELDS = ['ingredients', 'instructions', 'tags'] as const;

export interface ImportResult {
  imported: number;
  updated: number;
  invalid: number;
}

function isValidRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return REQUIRED_STRING_FIELDS.every(f => typeof r[f] === 'string' && (r[f] as string).trim() !== '')
    && REQUIRED_ARRAY_FIELDS.every(f => Array.isArray(r[f]))
    && typeof r.times === 'object' && r.times !== null;
}

/**
 * Esporta le ricette indicate come file JSON
 */
export async function exportRecipeBook(recipes: Recipe[]): Promise<number> {

  const json = JSON.stringify(recipes, null, 2);
  const fileName = `green-whisker-ricettario-${new Date().toISOString().slice(0, 10)}.json`;

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

/**
 * Apre il selettore file e importa le ricette del JSON scelto. Le ricette con un id già presente
 * vengono aggiornate. Restituisce null se l'utente annulla. Lancia un errore se il file non è valido.
 */
export async function importRecipeBook(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return null;

  const asset = picked.assets[0];
  const text = Platform.OS === 'web' && asset.file
    ? await asset.file.text()
    : await new File(asset.uri).text();

  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Il file non contiene un elenco di ricette');

  const existingIds = new Set(catalogRecipes.map(r => r.id));
  const result: ImportResult = { imported: 0, updated: 0, invalid: 0 };
  for (const item of parsed) {
    if (!isValidRecipe(item)) {
      result.invalid++;
      continue;
    }
    await saveCustomRecipe(item);
    if (existingIds.has(item.id)) {
      result.updated++;
    } else {
      result.imported++;
    }
  }
  syncRecipeCatalog(await getCustomRecipes());
  return result;
}
