import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Stack, SplashScreen, ThemeProvider as NavThemeProvider, DefaultTheme } from 'expo-router';
import type { Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '../db/database';
import { loadCatalog } from '../services/recipeCatalog';
import { seedIngredientsV2 } from '../services/ingredientsService';
import { seedBundledRecipesV1, seedReadyMealsV2 } from '../services/catalogSeedService';
import { seedOutOfHomeOptions } from '../services/outOfHomeService';

import { FavoritesProvider } from '../context/FavoritesContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { UiPreferencesProvider } from '../context/UiPreferencesContext';
import { darkPalette, lightPalette } from '../theme/palette';
import type { Palette } from '../theme/palette';
import { restoreSavedLanguage } from '../i18n';
import { useTranslation } from 'react-i18next';
import { cardRadius, display, elevation, icon, radius, space, text } from '../theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});


// Status bar icons according to the chosen theme
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

// Navigation theme from the chosen palette, so scenes and tab bar do not follow the system scheme
function ThemedNavigation({ children }: { children: React.ReactNode }) {
  const { isDark, colors } = useTheme();
  const navTheme = useMemo<Theme>(() => ({
    ...DefaultTheme,
    dark: isDark,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  }), [isDark, colors]);
  return <NavThemeProvider value={navTheme}>{children}</NavThemeProvider>;
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const { t } = useTranslation();
  // ErrorBoundary replaces the root layout, so it is outside ThemeProvider and useTheme
  // is not available: we use the system scheme with the same palettes.
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkPalette : lightPalette;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.errorContainer}>
      <View style={styles.errorCard}>
        <View style={styles.errorIconCircle}>
          <Ionicons name="alert-circle-outline" size={display.lg} color={colors.danger} />
        </View>
        <Text style={styles.errorTitle}>{t('errors.somethingWentWrong')}</Text>
        <Text style={styles.errorMessage}>
          {error?.message || t('errors.unexpectedLoading')}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={retry} activeOpacity={0.8}>
          <Ionicons name="refresh" size={icon.md} color={colors.onPrimary} style={{ marginRight: space.md }} />
          <Text style={styles.retryButtonText}>{t('errors.retry')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [startupFailed, setStartupFailed] = useState(false);
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const startupColors = scheme === 'dark' ? darkPalette : lightPalette;

  useEffect(() => {
    async function prepare() {
      try {
        await restoreSavedLanguage().catch(e => console.warn('Ripristino della lingua non riuscito', e));
        // 1. Initialize SQLite Database (waits for tables and indexes to be created)
        try {
          await initDatabase();
        } catch (dbErr) {
          // On native we do not continue with empty data: we show the startup error
          console.error('Inizializzazione del database fallita:', dbErr);
          setStartupFailed(true);
          return;
        }

        // 2. Load the catalog (and the search index) from the database
        await loadCatalog();

        try {
          await seedIngredientsV2();
        } catch (seedErr) {
          console.warn('Seed degli ingredienti non riuscito:', seedErr);
        }
        try {
          await seedReadyMealsV2();
        } catch (seedErr) {
          console.warn('Seed dei piatti pronti non riuscito:', seedErr);
        }
        try {
          await seedOutOfHomeOptions();
        } catch (seedErr) {
          console.warn('Seed delle opzioni fuori casa non riuscito:', seedErr);
        }
        try {
          await seedBundledRecipesV1();
        } catch (seedErr) {
          console.warn('Seed delle ricette predefinite non riuscito:', seedErr);
        }
      } catch (err) {
        console.warn('Errore durante l\'inizializzazione dell\'app:', err);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    }

    prepare();
  }, []);

  if (!appIsReady) {
    return null;
  }

  if (startupFailed) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: startupColors.surfaceAlt }}>
          <Text style={{ color: startupColors.text, fontSize: text.title, textAlign: 'center' }}>{t('common.error')}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
       <UiPreferencesProvider>
        <ThemedStatusBar />
        <FavoritesProvider>
          <ThemedNavigation>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </ThemedNavigation>
        </FavoritesProvider>
       </UiPreferencesProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: cardRadius,
    padding: 28,
    alignItems: 'center',
    ...elevation(2, colors),
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.dangerSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.xxxl,
  },
  errorTitle: {
    fontSize: text.page,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.md,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: text.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: radius.md,
  },
  retryButtonText: {
    color: colors.onPrimary,
    fontSize: text.title,
    fontWeight: '600',
  },
});
