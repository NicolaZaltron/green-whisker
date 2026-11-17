import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { AIProvider } from './aiService';

const AI_SETTINGS_KEY = 'gw_ai_settings';

export interface ProviderSettings {
  apiKey?: string;
  // Legacy: single model, replaced by simpleModel/complexModel (still read for compatibility)
  model?: string;
  // Model for simple operations (e.g. import from text)
  simpleModel?: string;
  // Model for complex operations (images, variant generation)
  complexModel?: string;
  baseUrl?: string;
}

export interface AISettings {
  provider?: AIProvider;
  providers: Partial<Record<AIProvider, ProviderSettings>>;
}

const EMPTY_AI_SETTINGS: AISettings = { providers: {} };

// On iOS and Android the keys end up in the device Keychain / Keystore.
// On web SecureStore does not exist, so the browser localStorage is used.
export async function loadAISettings(): Promise<AISettings> {
  try {
    const raw = Platform.OS === 'web'
      ? window.localStorage.getItem(AI_SETTINGS_KEY)
      : await SecureStore.getItemAsync(AI_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : EMPTY_AI_SETTINGS;
  } catch (e) {
    console.warn('Impossibile leggere le impostazioni AI', e);
    return EMPTY_AI_SETTINGS;
  }
}

export async function clearAISettings(): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(AI_SETTINGS_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(AI_SETTINGS_KEY);
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  const raw = JSON.stringify(settings);
  if (Platform.OS === 'web') {
    window.localStorage.setItem(AI_SETTINGS_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(AI_SETTINGS_KEY, raw);
}
