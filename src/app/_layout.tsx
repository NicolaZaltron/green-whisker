import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '../db/database';
import { loadCatalog } from '../services/recipeCatalog';
import { seedIngredientsV2 } from '../services/ingredientsService';
import { seedRecipeLinksV2, seedReadyMealsV2 } from '../services/catalogSeedService';

import { FavoritesProvider } from '../context/FavoritesContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { darkPalette, lightPalette } from '../theme/palette';
import type { Palette } from '../theme/palette';
import { restoreSavedLanguage } from '../i18n';
import { useTranslation } from 'react-i18next';

SplashScreen.preventAutoHideAsync().catch(() => {});


// Icone della status bar in base al tema scelto
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const { t } = useTranslation();
  // ErrorBoundary sostituisce il root layout, quindi è fuori da ThemeProvider e useTheme
  // non è disponibile: usiamo lo schema di sistema con le stesse palette.
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkPalette : lightPalette;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.errorContainer}>
      <View style={styles.errorCard}>
        <View style={styles.errorIconCircle}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        </View>
        <Text style={styles.errorTitle}>{t('errors.somethingWentWrong')}</Text>
        <Text style={styles.errorMessage}>
          {error?.message || t('errors.unexpectedLoading')}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={retry} activeOpacity={0.8}>
          <Ionicons name="refresh" size={18} color={colors.onPrimary} style={{ marginRight: 8 }} />
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
        // 1. Inizializza SQLite Database (attende la creazione di tabelle e indici)
        try {
          await initDatabase();
        } catch (dbErr) {
          // Su native non si continua con dati vuoti: mostriamo l'errore di avvio
          console.error('Inizializzazione del database fallita:', dbErr);
          setStartupFailed(true);
          return;
        }

        // 2. Carica il catalogo (e l'indice di ricerca) dal database
        await loadCatalog();

        try {
          await seedIngredientsV2();
        } catch (seedErr) {
          console.warn('Seed degli ingredienti non riuscito:', seedErr);
        }
        try {
          await seedRecipeLinksV2();
        } catch (seedErr) {
          console.warn('Seed dei collegamenti ricetta-ingrediente non riuscito:', seedErr);
        }
        try {
          await seedReadyMealsV2();
        } catch (seedErr) {
          console.warn('Seed dei piatti pronti non riuscito:', seedErr);
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
          <Text style={{ color: startupColors.text, fontSize: 16, textAlign: 'center' }}>{t('common.error')}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <FavoritesProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </FavoritesProvider>
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
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.dangerSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
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
    borderRadius: 12,
  },
  retryButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
