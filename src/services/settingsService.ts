import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { AIProvider } from './aiService';

const AI_SETTINGS_KEY = 'gw_ai_settings';

export interface ProviderSettings {
  apiKey?: string;
  // Legacy: singolo modello, sostituito da simpleModel/complexModel (ancora letto per compatibilità)
  model?: string;
  // Modello per le operazioni semplici (es. import da testo)
  simpleModel?: string;
  // Modello per le operazioni complesse (immagini, generazione varianti)
  complexModel?: string;
  baseUrl?: string;
}

export interface AISettings {
  provider?: AIProvider;
  providers: Partial<Record<AIProvider, ProviderSettings>>;
}

const EMPTY_AI_SETTINGS: AISettings = { providers: {} };

// Su iOS e Android le chiavi finiscono nel Keychain / Keystore del dispositivo.
// Sul web SecureStore non esiste, quindi si usa il localStorage del browser.
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

export async function saveAISettings(settings: AISettings): Promise<void> {
  const raw = JSON.stringify(settings);
  if (Platform.OS === 'web') {
    window.localStorage.setItem(AI_SETTINGS_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(AI_SETTINGS_KEY, raw);
}
