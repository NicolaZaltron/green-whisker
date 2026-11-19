import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { TabFlatList } from '../../components/TabScrollViews';
import { SearchBar } from '../../components/ui/SearchBar';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { RecipeSummary } from '../../types/recipe';
import { RecipeCard } from '../../components/RecipeCard';
import { RecipeModal } from '../../components/RecipeModal';
import { useResponsiveDimensions } from '../../hooks/useResponsiveDimensions';
import { getRecipeById } from '../../services/recipeCatalog';
import { useCatalogVersion } from '../../hooks/useCatalog';
import { useFavorites } from '../../context/FavoritesContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { scheduleIdle } from '../../utils/idle';


export default function FavoritesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { width } = useResponsiveDimensions();
  const { favoriteIds, toggleFavorite, refreshFavorites } = useFavorites();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSummary | null>(null);
  const catalogVersion = useCatalogVersion();

  // Syncs favorites when the screen gains focus
  useFocusEffect(
    useCallback(() => {
      // In idle, after the tab transition; the provider does not update state if the ids are unchanged
      const cancelIdle = scheduleIdle(() => { refreshFavorites(); });
      return () => cancelIdle();
    }, [refreshFavorites])
  );

  // Favorite recipes from the catalog index (originals and variants); catalogVersion recomputes if the catalog changes
  const favoriteRecipes = useMemo(() => {
    const list: RecipeSummary[] = [];
    favoriteIds.forEach(id => {
      const r = getRecipeById(id);
      if (r) list.push(r);
    });
    return list;
  // catalogVersion: the catalog is updated in place, the dependency forces recomputation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteIds, catalogVersion]);

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
    ({ item }: { item: RecipeSummary }) => (
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
          <ScreenHeader
            title={t('favorites.title')}
            subtitle={t('favorites.subtitle', { count: favoriteRecipes.length })}
          />

          {favoriteRecipes.length > 0 && (
            <SearchBar
              style={styles.searchField}
              placeholder={t('favorites.searchPlaceholder')}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
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
            <EmptyState
              icon="heart-dislike-outline"
              title={searchQuery ? t('explore.noRecipesTitle') : t('favorites.emptyTitle')}
              subtitle={searchQuery ? t('explore.noRecipesSub') : t('favorites.emptySub')}
              action={searchQuery ? undefined : { label: t('favorites.exploreRecipes'), onPress: () => router.push('/(tabs)') }}
            />
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
    paddingBottom: 4,
  },
  searchField: {
    marginTop: 4,
    // Aligned with the ScreenHeader title text
    marginHorizontal: 16,
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
});
