import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { TabFlatList } from '../../components/TabScrollViews';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { Recipe } from '../../types/recipe';
import { RecipeCard } from '../../components/RecipeCard';
import { RecipeModal } from '../../components/RecipeModal';
import { useResponsiveDimensions } from '../../hooks/useResponsiveDimensions';
import { catalogRecipes, catalogVariants } from '../../services/recipeCatalog';
import { useCatalogVersion } from '../../hooks/useCatalog';
import { useFavorites } from '../../context/FavoritesContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';


export default function FavoritesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { width } = useResponsiveDimensions();
  const { favoriteIds, toggleFavorite, refreshFavorites } = useFavorites();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const catalogVersion = useCatalogVersion();

  // Sincronizza i preferiti alla messa a fuoco della schermata
  useFocusEffect(
    useCallback(() => {
      refreshFavorites();
    }, [refreshFavorites])
  );

  // Mappa di tutte le ricette del catalogo, originali e varianti
  const fullRecipeMap = useMemo(() => {
    return new Map<string, Recipe>([...catalogRecipes, ...catalogVariants].map(r => [r.id, r]));
  // catalogVersion: il catalogo si aggiorna sul posto, la dipendenza forza il ricalcolo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogVersion]);

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
      r => r.title.toLowerCase().includes(q) || r.ingredients.some(i => i.toLowerCase().includes(q))
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
    [numColumns, toggleFavorite, styles]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="heart" size={20} color={colors.danger} />
            </View>
            <View>
              <Text style={styles.title}>{t('favorites.title')}</Text>
              <Text style={styles.subtitle}>
                {t('favorites.subtitle', { count: favoriteRecipes.length })}
              </Text>
            </View>
          </View>

          {favoriteRecipes.length > 0 && (
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('favorites.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <TabFlatList
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
                  <Ionicons name="compass-outline" size={18} color={colors.onPrimary} />
                  <Text style={styles.exploreBtnText}>{t('favorites.exploreRecipes')}</Text>
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

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
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
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  exploreBtnText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
