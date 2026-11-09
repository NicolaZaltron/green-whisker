import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '../db/database';
import { loadCatalog } from '../services/recipeCatalog';

import { FavoritesProvider } from '../context/FavoritesContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { darkPalette, lightPalette } from '../theme/palette';
import type { Palette } from '../theme/palette';
import '../i18n';
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

  useEffect(() => {
    async function prepare() {
      try {
        // 1. Inizializza SQLite Database (attende la creazione di tabelle e indici)
        await initDatabase();

        // 2. Carica il catalogo (e l'indice di ricerca) dal database
        await loadCatalog();
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
