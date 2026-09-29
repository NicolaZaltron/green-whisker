import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from '../db/database';
import { initializeSearchIndex } from '../services/searchService';
import { Recipe } from '../types/recipe';

const rawRecipes = require('../../assets/ricette.json') as Recipe[];

export default function RootLayout() {
  useEffect(() => {
    // 1. Initialize SQLite Database (or fallback on web)
    initDatabase().catch(err => console.warn('Database initialization warning:', err));

    // 2. Initialize Fuse.js Search Index on the 814 offline recipes
    initializeSearchIndex(rawRecipes);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
