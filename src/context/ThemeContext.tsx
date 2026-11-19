import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import { darkPalette, lightPalette, Palette } from '../theme/palette';
import { ThemeMode, loadThemeMode, saveThemeMode } from '../services/preferencesService';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    loadThemeMode().then(setModeState);
  }, []);

  // Align native chrome (modals, dialogs, keyboard, bars on Android) with the chosen theme, not the system one.
  // Web has no native chrome and does not support setColorScheme, so it is skipped there.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    saveThemeMode(next).catch(e => console.warn('Impossibile salvare il tema', e));
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, isDark, colors: isDark ? darkPalette : lightPalette, setMode }),
    [mode, isDark, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve essere usato dentro ThemeProvider');
  return ctx;
}
