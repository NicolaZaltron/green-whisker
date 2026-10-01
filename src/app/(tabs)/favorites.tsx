import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { Recipe } from '../../types/recipe';
import { RecipeCard } from '../../components/RecipeCard';
import { RecipeModal } from '../../components/RecipeModal';
import { useResponsiveDimensions } from '../../hooks/useResponsiveDimensions';
import { getCustomRecipes } from '../../db/database';
import { useFavorites } from '../../context/FavoritesContext';
import { useTranslation } from 'react-i18next';

const rawRecipes = require('../../../assets/ricette.json') as Recipe[];

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const { width } = useResponsiveDimensions();
  const { favoriteIds, toggleFavorite, refreshFavorites } = useFavorites();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [customRecipes, setCustomRecipes] = useState<Recipe[]>([]);

  // Synchronize favorites and custom recipes on screen focus
  useFocusEffect(
    useCallback(() => {
      refreshFavorites();
      getCustomRecipes().then(setCustomRecipes).catch(() => {});
    }, [refreshFavorites])
  );

  // Combined recipe map containing both static raw recipes and user-created custom recipes
  const fullRecipeMap = useMemo(() => {
    const map = new Map<string, Recipe>(rawRecipes.map(r => [r.id, r]));
    customRecipes.forEach(r => map.set(r.id, r));
    return map;
  }, [customRecipes]);

  const favoriteRecipes = useMemo(() => {
    const list: Recipe[] = [];
    favoriteIds.forEach(id => {
      const r = fullRecipeMap.get(id);
      if (r) list.push(r);
    });
    return list;
  }, [favoriteIds, fullRecipeMap]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return favoriteRecipes;
    const q = searchQuery.toLowerCase().trim();
    return favoriteRecipes.filter(
      r => r.titolo.toLowerCase().includes(q) || r.ingredienti.some(i => i.toLowerCase().includes(q))
    );
  }, [favoriteRecipes, searchQuery]);

  const numColumns = useMemo(() => {
    if (width >= 1024) return 3;
    if (width >= 600) return 2;
    return 1;
  }, [width]);

  // Memoized renderItem to prevent item re-rendering during parent state changes
  const renderFavoriteItem = useCallback(
    ({ item }: { item: Recipe }) => (
      <View style={numColumns > 1 ? styles.gridItem : styles.fullWidthItem}>
        <RecipeCard
          recipe={item}
          isFavorite={true}
          onToggleFavorite={toggleFavorite}
          onPress={() => setSelectedRecipe(item)}
        />
      </View>
    ),
    [numColumns, toggleFavorite]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="heart" size={20} color="#D9534F" />
            </View>
            <View>
              <Text style={styles.title}>{t('favorites.title')}</Text>
              <Text style={styles.subtitle}>
                {favoriteRecipes.length === 1
                  ? t('favorites.subtitle', { count: 1 })
                  : t('favorites.subtitle_plural', { count: favoriteRecipes.length })}
              </Text>
            </View>
          </View>

          {favoriteRecipes.length > 0 && (
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#7E8B80" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('favorites.searchPlaceholder')}
                placeholderTextColor="#8C988F"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#7E8B80" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <FlatList
          key={`favs-cols-${numColumns}`}
          data={filtered}
          keyExtractor={item => item.id}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          renderItem={renderFavoriteItem}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="heart-dislike-outline" size={42} color="#D97757" />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? t('explore.noRecipesTitle') : t('favorites.emptyTitle')}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? t('explore.noRecipesSub')
                  : t('favorites.emptySub')}
              </Text>
              {!searchQuery && (
                <TouchableOpacity
                  style={styles.exploreBtn}
                  onPress={() => router.push('/(tabs)')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="compass-outline" size={18} color="#FFF" />
                  <Text style={styles.exploreBtnText}>Esplora le ricette</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        <RecipeModal
          recipe={selectedRecipe}
          visible={!!selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FDF0EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#243328',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#718073',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    marginTop: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#2B332B',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  columnWrapper: {
    gap: 16,
  },
  gridItem: {
    flex: 1,
  },
  fullWidthItem: {
    width: '100%',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B332B',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#7E8B80',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A6B53',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#4A6B53',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  exploreBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
