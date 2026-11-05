import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '../db/database';
import { loadCatalog } from '../services/recipeCatalog';

import { FavoritesProvider } from '../context/FavoritesContext';
import '../i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});


export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={styles.errorContainer}>
      <View style={styles.errorCard}>
        <View style={styles.errorIconCircle}>
          <Ionicons name="alert-circle-outline" size={48} color="#D9534F" />
        </View>
        <Text style={styles.errorTitle}>Qualcosa è andato storto</Text>
        <Text style={styles.errorMessage}>
          {error?.message || 'Si è verificato un errore inaspettato durante il caricamento.'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={retry} activeOpacity={0.8}>
          <Ionicons name="refresh" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.retryButtonText}>Riprova</Text>
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
      <StatusBar style="dark" />
      <FavoritesProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </FavoritesProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#F7F9F6',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FDF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C2E20',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#5E6D60',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34523C',
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
