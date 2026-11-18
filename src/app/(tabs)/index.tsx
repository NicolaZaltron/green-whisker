import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetModal } from '../../components/SheetModal';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Recipe, RecipeSummary, RecipeOrigin } from '../../types/recipe';
import { RecipeCard } from '../../components/RecipeCard';
import { TabFlatList } from '../../components/TabScrollViews';
import { RecipeModal } from '../../components/RecipeModal';
import { PantryView } from '../../components/PantryView';
import { MagicRecipeImporterModal, ReviewRequest } from '../../components/MagicRecipeImporterModal';
import { HeaderMenu } from '../../components/HeaderMenu';
import { useCatalogVersion } from '../../hooks/useCatalog';
import { catalogRecipes, catalogVariants, refreshCatalog } from '../../services/recipeCatalog';
import { DietFilter, VariantDiet, availableVariantDiets, matchesDiet } from '../../services/catalogFormat';
import { generateVariant, saveVariant, deleteVariant } from '../../services/variantService';
import { useResponsiveDimensions } from '../../hooks/useResponsiveDimensions';
import { useDebounce } from '../../hooks/useDebounce';
import { searchRecipes, AdvancedFilterOptions } from '../../services/searchService';
import { DEFAULT_RECIPE_SORT, sortRecipes, type RecipeSort } from '../../utils/recipeSort';
import { MACRO_CATEGORIES, RECIPE_TAXONOMY, MacroCategory } from '../../constants/categories';
import { useFavorites } from '../../context/FavoritesContext';
import { useTranslation } from 'react-i18next';
import { useShareIntent } from 'expo-share-intent';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { AppTextField } from '../../components/ui/AppTextField';
import { ScreenHeader } from '../../components/ui/ScreenHeader';

const CATEGORIES = ['Tutte', ...MACRO_CATEGORIES];

const ORIGIN_OPTIONS: { labelKey: string; value: RecipeOrigin }[] = [
  { labelKey: 'explore.advanced.originOptions.ai', value: 'ai' },
  { labelKey: 'explore.advanced.originOptions.file', value: 'file' },
  { labelKey: 'explore.advanced.originOptions.bundled', value: 'bundled' },
];

export default function ExploreScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { width } = useResponsiveDimensions();
  const insets = useSafeAreaInsets();
  // The button sits above the navigation bar (height 64, distance from the bottom, margin)
  const fabBottom = Math.max(insets.bottom, 8) + 12 + 64 + 12;
  // The FAB sits in the centered 1200px container: 16px from the edge, like the navbar (see _layout.tsx)
  const fabRight = 16;
  const { isFavorite, toggleFavorite } = useFavorites();
  const [viewMode, setViewMode] = useState<'catalog' | 'pantry'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tutte');
  const [selectedSubCategory, setSelectedSubCategory] = useState('Tutte');
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSummary | null>(null);
  const [showMagicImporter, setShowMagicImporter] = useState(false);
  // Link received from Android sharing, passed to the importer
  const [sharedUrl, setSharedUrl] = useState<string | undefined>(undefined);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest | null>(null);
  const [variantBusy, setVariantBusy] = useState(false);
  // Variant being generated: the button in the card shows the spinner
  const [generating, setGenerating] = useState<{ baseId: string; diet: VariantDiet } | null>(null);
  const [dietFilter, setDietFilter] = useState<DietFilter>('all');
  const [originFilter, setOriginFilter] = useState<'all' | RecipeOrigin>('all');
  // The catalog is shared with the other screens: its version changes on every modification
  const catalogVersion = useCatalogVersion();

  // Text shared from other apps: opens the importer with the first link found
  const { shareIntent, resetShareIntent } = useShareIntent();
  const sharedText = shareIntent?.text ?? null;
  // Text already processed: avoids reopening the importer on every render
  const [handledShareText, setHandledShareText] = useState<string | null>(null);
  if (sharedText && sharedText !== handledShareText) {
    setHandledShareText(sharedText);
    const match = sharedText.match(/https?:\/\/[^\s]+/);
    if (match) {
      setSharedUrl(match[0]);
      setShowMagicImporter(true);
    }
  }
  useEffect(() => {
    // Reset to avoid handling the same share twice
    if (sharedText) resetShareIntent();
  }, [sharedText, resetShareIntent]);

  // Variants grouped by original recipe, and diets available for the card
  const variantsByBase = useMemo(() => {
    const map = new Map<string, RecipeSummary[]>();
    catalogVariants.forEach(v => {
      const list = map.get(v.variant_of!) ?? [];
      list.push(v);
      map.set(v.variant_of!, list);
    });
    return map;
  // catalogVersion: the catalog is updated in place, the dependency forces recomputation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogVersion]);


  // Origins shown in the filter: only those present in the catalog
  const availableOrigins = useMemo(() => {
    const present = new Set(catalogRecipes.map(r => r.origin ?? 'file'));
    return ORIGIN_OPTIONS.filter(o => present.has(o.value));
  // catalogVersion: the catalog is updated in place, the dependency forces recomputation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogVersion]);

  // Advanced Filters State
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [recipeSort, setRecipeSort] = useState<RecipeSort>(DEFAULT_RECIPE_SORT);
  const [filters, setFilters] = useState<AdvancedFilterOptions>({
    maxMinutes: null,
    difficolta: null,
    tag: null,
    sottocategoria: null,
  });

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.maxMinutes) count++;
    if (filters.difficolta) count++;
    if (filters.tag) count++;
    if (filters.sottocategoria && filters.sottocategoria !== 'Tutte') count++;
    if (selectedSubCategory !== 'Tutte') count++;
    if (dietFilter !== 'all') count++;
    if (originFilter !== 'all') count++;
    return count;
  }, [filters, selectedSubCategory, dietFilter, originFilter]);

  const handleResetFilters = () => {
    setFilters({
      maxMinutes: null,
      difficolta: null,
      tag: null,
      sottocategoria: null,
    });
    setSelectedSubCategory('Tutte');
    setDietFilter('all');
    setOriginFilter('all');
  };

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedSubCategory('Tutte');
  };

  const currentSubcategories = useMemo(() => {
    if (selectedCategory === 'Tutte' || !RECIPE_TAXONOMY[selectedCategory as MacroCategory]) {
      return [];
    }
    return ['Tutte', ...(RECIPE_TAXONOMY[selectedCategory as MacroCategory] || [])];
  }, [selectedCategory]);

  // Debounced search query for butter-smooth typing on mobile
  const debouncedQuery = useDebounce(searchQuery, 150);

  // Filter recipes using Fuse.js fuzzy engine + category + advanced filters
  const filteredRecipes = useMemo(() => {
    const combinedFilters: AdvancedFilterOptions = {
      ...filters,
      sottocategoria: selectedSubCategory !== 'Tutte' ? selectedSubCategory : (filters.sottocategoria || null)
    };
    const matched = searchRecipes(debouncedQuery, selectedCategory, combinedFilters)
      .filter(r => originFilter === 'all' || (r.origin ?? 'file') === originFilter)
      .filter(r => matchesDiet(r, variantsByBase.get(r.id) ?? [], dietFilter));
    // While searching the results keep the relevance order; otherwise the chosen order applies
    return debouncedQuery.trim() ? matched : sortRecipes(matched, recipeSort);
  // catalogVersion: the catalog is updated in place, the dependency forces recomputation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedCategory, selectedSubCategory, filters, dietFilter, originFilter, catalogVersion, variantsByBase, recipeSort]);

  // Responsive column count calculation
  const numColumns = useMemo(() => {
    if (width >= 1024) return 3;
    if (width >= 600) return 2;
    return 1;
  }, [width]);

  // Memoized renderItem to prevent full list re-renders when parent state updates
  // Variant diets per recipe: stable arrays, so memoized cards do not re-render
  const variantDietsById = useMemo(() => {
    const map = new Map<string, VariantDiet[]>();
    variantsByBase.forEach((list, id) => map.set(id, list.map(v => v.diet as VariantDiet)));
    return map;
  }, [variantsByBase]);

  const renderRecipeItem = useCallback(
    ({ item }: { item: RecipeSummary }) => (
      <View style={numColumns > 1 ? styles.gridItem : styles.fullWidthItem}>
        <RecipeCard
          recipe={item}
          variantDiets={variantDietsById.get(item.id)}
          isFavorite={isFavorite(item.id)}
          onToggleFavorite={toggleFavorite}
          onPress={() => setSelectedRecipe(item)}
        />
      </View>
    ),
    [numColumns, isFavorite, toggleFavorite, variantDietsById, styles]
  );

  // Review of a generated variant: the form is the importer's. Confirming or discarding
  // moves on to `next`, i.e. the next variant or the original's card.
  const openVariantReview = (source: RecipeSummary, diet: VariantDiet, generated: Recipe, rest: VariantDiet[]) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };
    const next = () => (rest.length > 0 ? runVariantQueue(source, rest) : setSelectedRecipe(source));

    setSelectedRecipe(null);
    setEditingRecipe(null);
    setReviewRequest({
      recipe: generated,
      title: diet === 'vegan' ? t('variants.reviewVegan') : t('variants.reviewVegetarian'),
      onConfirm: async (variant, choices) => {
        if (settled) return;
        await saveVariant(variant, choices);
        finish(() => {
          setReviewRequest(null);
          next();
        });
      },
      onDiscard: () => finish(() => {
        setReviewRequest(null);
        next();
      }),
      onRetry: async instructions => {
        openVariantReview(source, diet, await generateVariant(source, diet, instructions), rest);
      },
    });
    setShowMagicImporter(true);
  };

  // Generates the requested variants one at a time, each one under review
  const runVariantQueue = (source: RecipeSummary, diets: VariantDiet[]) => {
    const [diet, ...rest] = diets;
    if (!diet) {
      setSelectedRecipe(source);
      return;
    }
    setVariantBusy(true);
    setGenerating({ baseId: source.id, diet });
    generateVariant(source, diet)
      .then(generated => openVariantReview(source, diet, generated, rest))
      .catch((e: any) => {
        Alert.alert(t('variants.notGenerated'), e.message || t('variants.generationError'));
        runVariantQueue(source, rest);
      })
      .finally(() => {
        setVariantBusy(false);
        setGenerating(null);
      });
  };

  // After saving the original: generates the chosen variants that do not exist yet
  const handleRecipeSaved = (newRecipe: RecipeSummary, variantDiets: VariantDiet[] = []) => {
    const missing = availableVariantDiets(newRecipe, catalogVariants).filter(d => variantDiets.includes(d));
    if (missing.length === 0) {
      setSelectedRecipe(newRecipe);
      return;
    }
    runVariantQueue(newRecipe, missing);
  };

  // Generates a variant from the card: same review, no queue
  const handleGenerateVariant = (source: RecipeSummary, diet: VariantDiet) => {
    runVariantQueue(source, [diet]);
  };

  const handleRegenerateVariant = async (variant: RecipeSummary) => {
    const source = catalogRecipes.find(r => r.id === variant.variant_of);
    if (!source || !variant.diet || variant.diet === 'omnivore') return;
    handleGenerateVariant(source, variant.diet);
  };

  const handleDeleteVariant = (variant: RecipeSummary) => {
    const source = catalogRecipes.find(r => r.id === variant.variant_of);
    Alert.alert(t('variants.deleteTitle'), t('variants.deleteBody', { title: variant.title }), [
      { text: t('variants.cancel'), style: 'cancel' },
      {
        text: t('variants.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteVariant(variant);
          setSelectedRecipe(source ?? null);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>
        {/* Header: icon, title and menu */}
        <View style={styles.header}>
          <ScreenHeader
            icon="leaf"
            title={t('tabs.explore')}
            subtitle={t('explore.subtitle')}
            actions={<HeaderMenu onRecipesChanged={refreshCatalog} />}
          />

          {/* Mode Switcher: Catalog vs Fridge cleanout */}
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, viewMode === 'catalog' && styles.modeToggleBtnActive]}
              onPress={() => setViewMode('catalog')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="book-outline"
                size={14}
                color={viewMode === 'catalog' ? colors.onPrimary : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeToggleText, viewMode === 'catalog' && styles.modeToggleTextActive]}>
                {t('explore.viewModes.recipes')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeToggleBtn, viewMode === 'pantry' && styles.modeToggleBtnActive]}
              onPress={() => setViewMode('pantry')}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="fridge-outline"
                size={15}
                color={viewMode === 'pantry' ? colors.onPrimary : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeToggleText, viewMode === 'pantry' && styles.modeToggleTextActive]}>
                {t('explore.viewModes.pantry')}
              </Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'catalog' && (
            <View style={styles.searchRow}>
              <AppTextField
                variant="search"
                style={styles.searchField}
                leftIcon={<Ionicons name="search" size={18} color={colors.textMuted} />}
                placeholder={t('explore.searchPlaceholder')}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />

              <TouchableOpacity
                style={[styles.filterBtn, activeFiltersCount > 0 && styles.filterBtnActive]}
                onPress={() => setShowFilterSheet(true)}
                activeOpacity={0.8}
                accessibilityLabel={t('explore.advanced.open')}
              >
                <Ionicons
                  name={activeFiltersCount > 0 ? 'options' : 'options-outline'}
                  size={20}
                  color={activeFiltersCount > 0 ? colors.onPrimary : colors.primaryText}
                />
                {activeFiltersCount > 0 && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {viewMode === 'catalog' ? (
          <>
            {/* Level 1: Macro-Categories Bar */}
            <View style={styles.categoriesSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoriesContainer}
              >
                {/* Active Filters Reset Chip (if any active) */}
                {activeFiltersCount > 0 && (
                  <TouchableOpacity
                    style={styles.activeFiltersPill}
                    onPress={handleResetFilters}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close-circle" size={14} color={colors.onPrimary} style={{ marginRight: 4 }} />
                    <Text style={styles.activeFiltersPillText}>
                      {t('explore.advanced.activeFilters', { count: activeFiltersCount })}
                    </Text>
                  </TouchableOpacity>
                )}

                {CATEGORIES.map(cat => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                      onPress={() => handleSelectCategory(cat)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}
                      >
                        {cat === 'Tutte' ? t('explore.allCategories') : t('categories.' + cat, { defaultValue: cat })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Level 2: Subcategories Bar (shown when a Macro Category is active) */}
            {currentSubcategories.length > 0 && (
              <View style={styles.subcategoriesSection}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subcategoriesContainer}
                >
                  {currentSubcategories.map(sub => {
                    const isSelected = selectedSubCategory === sub;
                    return (
                      <TouchableOpacity
                        key={sub}
                        style={[styles.subCategoryChip, isSelected && styles.subCategoryChipSelected]}
                        onPress={() => setSelectedSubCategory(sub)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[styles.subCategoryChipText, isSelected && styles.subCategoryChipTextSelected]}
                        >
                          {sub === 'Tutte' ? t('explore.allCategories') : t('categories.' + sub, { defaultValue: sub })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Results Counter */}
            <View style={styles.counterRow}>
              <Text style={styles.counterText}>
                {t('explore.recipesFound', { count: filteredRecipes.length })}
              </Text>
            </View>

            {/* Recipes Grid */}
            <TabFlatList
              key={`grid-cols-${numColumns}`}
              data={filteredRecipes}
              keyExtractor={item => item.id}
              numColumns={numColumns}
              columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={7}
              removeClippedSubviews={true}
              renderItem={renderRecipeItem}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>
                    {catalogRecipes.length === 0 ? t('explore.emptyCatalogTitle') : t('explore.noRecipesTitle')}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {catalogRecipes.length === 0 ? t('explore.emptyCatalogSub') : t('explore.noRecipesSub')}
                  </Text>
                </View>
              }
            />
          </>
        ) : (
          <PantryView onSelectRecipe={setSelectedRecipe} />
        )}

        {/* RecipeSummary Detail Modal */}
        <RecipeModal
          recipe={selectedRecipe}
          variants={selectedRecipe ? variantsByBase.get(selectedRecipe.id) ?? [] : []}
          visible={!!selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onGenerateVariant={handleGenerateVariant}
          generatingDiet={selectedRecipe && generating?.baseId === selectedRecipe.id ? generating.diet : null}
          onRegenerateVariant={handleRegenerateVariant}
          onDeleteVariant={handleDeleteVariant}
          onEdit={recipe => {
            setSelectedRecipe(null);
            setEditingRecipe(recipe);
            setShowMagicImporter(true);
          }}
        />

        {/* Advanced Filters Modal (Bottom Sheet) */}
        {/* Advanced filters: a sheet like the other ones (system bars, tap outside, scroll from anywhere) */}
        <SheetModal visible={showFilterSheet} onClose={() => setShowFilterSheet(false)} fullScreen>
          <View style={styles.filterBody}>
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>{t('explore.advanced.title')}</Text>
                  <Text style={styles.sheetSub}>{t('explore.advanced.subtitle')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={() => setShowFilterSheet(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                {/* Sort order of the lists */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="swap-vertical-outline" size={16} color={colors.primaryText} style={{ marginRight: 6 }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.sortTitle')}</Text>
                  </View>
                  <View style={[styles.sheetChipsRow, styles.sortRowGap]}>
                    {([
                      { label: t('explore.advanced.sortAlpha'), key: 'alpha' },
                      { label: t('explore.advanced.sortCreated'), key: 'created' },
                      { label: t('explore.advanced.sortUpdated'), key: 'updated' },
                    ] as const).map(opt => {
                      const isSel = recipeSort.key === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.sheetChip, isSel && styles.sheetChipSelected]}
                          onPress={() => setRecipeSort(prev => ({ ...prev, key: opt.key }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.sheetChipText, isSel && styles.sheetChipTextSelected]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.sheetChipsRow}>
                    {([
                      { label: t('explore.advanced.sortAsc'), direction: 'asc' },
                      { label: t('explore.advanced.sortDesc'), direction: 'desc' },
                    ] as const).map(opt => {
                      const isSel = recipeSort.direction === opt.direction;
                      return (
                        <TouchableOpacity
                          key={opt.direction}
                          style={[styles.sheetChip, isSel && styles.sheetChipSelected]}
                          onPress={() => setRecipeSort(prev => ({ ...prev, direction: opt.direction }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.sheetChipText, isSel && styles.sheetChipTextSelected]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Max Time */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="time-outline" size={16} color={colors.primaryText} style={{ marginRight: 6 }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.maxTime')}</Text>
                  </View>
                  <View style={styles.sheetChipsRow}>
                    {[
                      { label: t('explore.advanced.any'), value: null },
                      { label: t('explore.advanced.under', { n: 20 }), value: 20 },
                      { label: t('explore.advanced.under', { n: 35 }), value: 35 },
                      { label: t('explore.advanced.under', { n: 50 }), value: 50 },
                    ].map(opt => {
                      const isSel = filters.maxMinutes === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          style={[styles.sheetChip, isSel && styles.sheetChipSelected]}
                          onPress={() => setFilters(prev => ({ ...prev, maxMinutes: opt.value }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.sheetChipText, isSel && styles.sheetChipTextSelected]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Difficulty */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="speedometer-outline" size={16} color={colors.primaryText} style={{ marginRight: 6 }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.difficulty')}</Text>
                  </View>
                  <View style={styles.sheetChipsRow}>
                    {[
                      { label: t('explore.advanced.all'), value: null },
                      { label: t('explore.advanced.difficultyLevel.easy'), value: 'Facile' },
                      { label: t('explore.advanced.difficultyLevel.medium'), value: 'Media' },
                      { label: t('explore.advanced.difficultyLevel.hard'), value: 'Difficile' },
                    ].map(opt => {
                      const isSel = filters.difficolta === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          style={[styles.sheetChip, isSel && styles.sheetChipSelected]}
                          onPress={() => setFilters(prev => ({ ...prev, difficolta: opt.value as any }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.sheetChipText, isSel && styles.sheetChipTextSelected]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Diet: includes recipes that have a compatible variant */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="nutrition-outline" size={16} color={colors.primaryText} style={{ marginRight: 6 }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.diet')}</Text>
                  </View>
                  <View style={styles.sheetChipsRow}>
                    {([
                      { label: t('explore.advanced.all'), value: 'all' },
                      { label: t('explore.advanced.dietOptions.vegetarian'), value: 'vegetarian' },
                      { label: t('explore.advanced.dietOptions.vegan'), value: 'vegan' },
                    ] as const).map(opt => {
                      const isSel = dietFilter === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.sheetChip, isSel && styles.sheetChipSelected]}
                          onPress={() => setDietFilter(opt.value)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.sheetChipText, isSel && styles.sheetChipTextSelected]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Origin: only if the catalog contains recipes from more than one origin */}
                {availableOrigins.length > 1 && (
                  <View style={styles.sheetSection}>
                    <View style={styles.sectionLabelRow}>
                      <Ionicons name="library-outline" size={16} color={colors.primaryText} style={{ marginRight: 6 }} />
                      <Text style={styles.sheetSectionTitle}>{t('explore.advanced.origin')}</Text>
                    </View>
                    <View style={styles.sheetChipsRow}>
                      {[{ labelKey: 'explore.advanced.all', value: 'all' as const }, ...availableOrigins].map(opt => {
                        const isSel = originFilter === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.sheetChip, isSel && styles.sheetChipSelected]}
                            onPress={() => setOriginFilter(opt.value)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.sheetChipText, isSel && styles.sheetChipTextSelected]}>{t(opt.labelKey)}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Features */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="leaf-outline" size={16} color={colors.primaryText} style={{ marginRight: 6 }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.features')}</Text>
                  </View>
                  <View style={styles.sheetChipsRow}>
                    {[
                      { label: t('explore.advanced.all'), value: null },
                      { label: t('explore.filters.glutenFree'), value: 'Senza Glutine' },
                      { label: t('explore.filters.baked'), value: 'Al forno' },
                      { label: t('explore.advanced.noCooking'), value: 'Senza cottura' },
                    ].map(opt => {
                      const isSel = filters.tag === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          style={[styles.sheetChip, isSel && styles.sheetChipSelected]}
                          onPress={() => setFilters(prev => ({ ...prev, tag: opt.value }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.sheetChipText, isSel && styles.sheetChipTextSelected]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>

              {/* Sheet Footer */}
              <View style={styles.sheetFooter}>
                {activeFiltersCount > 0 ? (
                  <TouchableOpacity
                    style={styles.sheetResetBtn}
                    onPress={handleResetFilters}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh-outline" size={15} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.sheetResetText}>{t('explore.advanced.reset')}</Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}

                <TouchableOpacity
                  style={styles.sheetApplyBtn}
                  onPress={() => setShowFilterSheet(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.sheetApplyText}>
                    {t('explore.advanced.showResults', { count: filteredRecipes.length })}
                  </Text>
                </TouchableOpacity>
              </View>
          </View>
        </SheetModal>

        {/* Floating Action Button: Importa AI */}
        {viewMode === 'catalog' && (
          <TouchableOpacity
            style={[styles.fabImportBtn, { bottom: fabBottom, right: fabRight }]}
            onPress={() => setShowMagicImporter(true)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={t('explore.importAi')}
          >
            <Ionicons name="sparkles" size={20} color={colors.onPrimary} />
            <Text style={styles.fabImportText}>{t('explore.importButton')}</Text>
          </TouchableOpacity>
        )}

        {/* Magic RecipeSummary Importer AI Modal */}
        <MagicRecipeImporterModal
          key={reviewRequest ? `review-${reviewRequest.recipe.updated_at}` : editingRecipe?.id ?? 'new'}
          visible={showMagicImporter}
          initialUrl={sharedUrl}
          editingRecipe={editingRecipe}
          review={reviewRequest}
          onClose={() => {
            // Closing a review without confirming discards it
            if (reviewRequest) reviewRequest.onDiscard();
            setShowMagicImporter(false);
            // Closing an edit returns to the recipe, not to the home
            if (editingRecipe) setSelectedRecipe(editingRecipe);
            setEditingRecipe(null);
          }}
          onRecipeSaved={handleRecipeSaved}
        />

        {variantBusy && (
          <View style={styles.busyOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.busyText}>{t('explore.variantGenerating')}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette, isDark: boolean) => StyleSheet.create({
  busyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(17, 22, 17, 0.7)' : 'rgba(247, 249, 246, 0.7)',
    gap: 12,
  },
  busyText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
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
    paddingBottom: 6,
  },
  fabImportBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 75,
    height: 75,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 37.5,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  fabImportText: {
    color: colors.onPrimary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: 14,
    padding: 3,
    marginBottom: 12,
    // Aligned with the ScreenHeader title text
    marginHorizontal: 16,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  modeToggleBtnActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeToggleTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
  },
  searchField: {
    flex: 1,
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#D97757',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  filterBadgeText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  categoriesSection: {
    marginTop: 4,
    marginBottom: 4,
  },
  categoriesContainer: {
    paddingHorizontal: 20,
    gap: 8,
    paddingVertical: 2,
  },
  activeFiltersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D97757',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  activeFiltersPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryChipTextSelected: {
    color: colors.onPrimary,
  },
  subcategoriesSection: {
    marginBottom: 4,
    paddingTop: 2,
  },
  subcategoriesContainer: {
    paddingHorizontal: 16,
    gap: 6,
    paddingVertical: 2,
  },
  subCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subCategoryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  subCategoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  subCategoryChipTextSelected: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  counterRow: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  // Filter Bottom Sheet Styles
  filterBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sheetSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetSection: {
    marginBottom: 20,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  sortRowGap: { marginBottom: 12 },
  sheetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sheetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sheetChipTextSelected: {
    color: colors.onPrimary,
  },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  sheetResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sheetResetText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sheetApplyBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginLeft: 'auto',
  },
  sheetApplyText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
