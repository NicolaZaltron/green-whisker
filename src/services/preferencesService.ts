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
