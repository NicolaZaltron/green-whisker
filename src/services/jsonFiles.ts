// Shared file handling for the import and export of the app's data (recipes, ingredients, out-of-home options).
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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
 * Asks the phone for a JSON file and returns its text. Returns null if the user cancels.
 */
export async function pickJsonText(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return null;
  return readPickedFile(picked.assets[0]);
}

/** Saves a JSON text: a download on web, the share sheet on the phone. */
export async function shareJsonFile(json: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
}
