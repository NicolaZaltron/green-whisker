import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_MODE_KEY = 'gw_theme_mode';

// Stessa logica delle impostazioni AI: SecureStore su dispositivo, localStorage sul web
export async function loadThemeMode(): Promise<ThemeMode> {
  try {
    const raw = Platform.OS === 'web'
      ? window.localStorage.getItem(THEME_MODE_KEY)
      : await SecureStore.getItemAsync(THEME_MODE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(THEME_MODE_KEY, mode);
    return;
  }
  await SecureStore.setItemAsync(THEME_MODE_KEY, mode);
}

const LANGUAGE_KEY = 'gw_language';

// Lingua scelta a mano nel menu: null se non è mai stata scelta (si usa la lingua del dispositivo)
export async function loadLanguage(): Promise<'it' | 'en' | null> {
  try {
    const raw = Platform.OS === 'web'
      ? window.localStorage.getItem(LANGUAGE_KEY)
      : await SecureStore.getItemAsync(LANGUAGE_KEY);
    return raw === 'it' || raw === 'en' ? raw : null;
  } catch {
    return null;
  }
}

export async function saveLanguage(lng: 'it' | 'en'): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(LANGUAGE_KEY, lng);
    return;
  }
  await SecureStore.setItemAsync(LANGUAGE_KEY, lng);
}
