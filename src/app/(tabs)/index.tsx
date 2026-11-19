import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetModal } from '../../components/SheetModal';
import { Ionicons } from '@expo/vector-icons';
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
import { SearchBar } from '../../components/ui/SearchBar';
import { CircleButton } from '../../components/ui/CircleButton';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { elevation, radius, space, text, icon } from '../../theme/tokens';
import { SegmentedControl } from '../../components/ui/SegmentedControl';

// Options of the advanced filters (value null = no filter)
const MAX_TIME_OPTIONS = [{ value: null }, { value: 20 }, { value: 35 }, { value: 50 }] as const;
const DIFFICULTY_OPTIONS = [
  { value: null, labelKey: 'explore.advanced.all' },
  { value: 'Facile', labelKey: 'explore.advanced.difficultyLevel.easy' },
  { value: 'Media', labelKey: 'explore.advanced.difficultyLevel.medium' },
  { value: 'Difficile', labelKey: 'explore.advanced.difficultyLevel.hard' },
] as const;
// Known error codes from the variant service, mapped to translation keys
const VARIANT_ERROR_KEYS: Record<string, string> = {
  recipe_not_found: 'variants.recipeNotFound',
};
// AI service unavailable (HTTP 503 in the error message)
const isServiceUnavailable = (message?: string) => !!message && /\b503\b/.test(message);
const FEATURE_OPTIONS = [
  { value: null, labelKey: 'explore.advanced.all' },
  { value: 'Senza Glutine', labelKey: 'explore.filters.glutenFree' },
  { value: 'Al forno', labelKey: 'explore.filters.baked' },
  { value: 'Senza cottura', labelKey: 'explore.advanced.noCooking' },
] as const;

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
  const [variantError, setVariantError] = useState<string | null>(null);
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
    if (selectedCategory !== 'Tutte') count++;
    if (selectedSubCategory !== 'Tutte') count++;
    if (dietFilter !== 'all') count++;
    if (originFilter !== 'all') count++;
    return count;
  }, [filters, selectedCategory, selectedSubCategory, dietFilter, originFilter]);

  const handleResetFilters = () => {
    setFilters({
      maxMinutes: null,
      difficolta: null,
      tag: null,
      sottocategoria: null,
    });
    setSelectedCategory('Tutte');
    setSelectedSubCategory('Tutte');
    setDietFilter('all');
    setOriginFilter('all');
  };

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedSubCategory('Tutte');
  };

  // With "all" macro categories selected, every subcategory is offered (they are unique across macros)
  const currentSubcategories = useMemo(() => {
    if (selectedCategory === 'Tutte') {
      return ['Tutte', ...MACRO_CATEGORIES.flatMap(macro => RECIPE_TAXONOMY[macro])];
    }
    if (!RECIPE_TAXONOMY[selectedCategory as MacroCategory]) {
      return [];
    }
    return ['Tutte', ...RECIPE_TAXONOMY[selectedCategory as MacroCategory]];
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
    setVariantError(null);
    setGenerating({ baseId: source.id, diet });
    generateVariant(source, diet)
      .then(generated => openVariantReview(source, diet, generated, rest))
      .catch((e: any) => {
        // Shown inside the recipe modal: a native Alert would stay hidden behind it
        const errorKey = isServiceUnavailable(e.message) ? 'variants.serviceUnavailable' : VARIANT_ERROR_KEYS[e.message];
        setVariantError(errorKey ? t(errorKey) : e.message || t('variants.generationError'));
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
        <View style={styles.header}>
          {/* Mode Switcher: Catalog vs Fridge cleanout, with the settings button on its right */}
          <View style={styles.modeRow}>
            <View style={styles.modeToggle}>
              <SegmentedControl
                size="XL"
                accessibilityLabel={t('explore.viewModes.label')}
                options={[
                  { key: 'catalog', label: t('explore.viewModes.recipes'), icon: 'book-outline' },
                  { key: 'pantry', label: t('explore.viewModes.pantry'), icon: 'file-tray-outline' },
                ]}
                value={viewMode}
                onChange={key => setViewMode(key as 'catalog' | 'pantry')}
              />
            </View>
            <HeaderMenu onRecipesChanged={refreshCatalog} />
          </View>
        </View>

          {viewMode === 'catalog' && (
            <View style={styles.searchRow}>
              <SearchBar
                style={styles.searchField}
                placeholder={t('explore.searchPlaceholder')}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              {activeFiltersCount > 0 && (
                <Button
                  variant="danger"
                  size="M"
                  icon="close"
                  label={t('explore.advanced.activeFilters', { count: activeFiltersCount })}
                  onPress={handleResetFilters}
                />
              )}

              <CircleButton
                icon={activeFiltersCount > 0 ? 'options' : 'options'}
                variant={activeFiltersCount > 0 ? 'filled' : 'neutral'}
                onPress={() => setShowFilterSheet(true)}
                accessibilityLabel={t('explore.advanced.open')}
              />
            </View>
          )}

        {viewMode === 'catalog' ? (
          <>
            {/* Level 1: Macro-Categories Bar */}
            <View style={styles.categoriesSection}>
              <SegmentedControl
                accessibilityLabel={t('explore.categoriesLabel')}
                options={CATEGORIES.map(cat => ({ key: cat, label: cat === 'Tutte' ? t('explore.allCategories') : t('categories.' + cat, { defaultValue: cat }) }))}
                pinnedKey="Tutte"
                value={selectedCategory}
                onChange={handleSelectCategory}
              />
            </View>

            {/* Level 2: Subcategories Bar (shown when a Macro Category is active) */}
            {currentSubcategories.length > 0 && (
              <View style={styles.subcategoriesSection}>
                <SegmentedControl
                  accessibilityLabel={t('explore.subcategoriesLabel')}
                  options={currentSubcategories.map(sub => ({ key: sub, label: sub === 'Tutte' ? t('explore.allCategories') : t('categories.' + sub, { defaultValue: sub }) }))}
                  pinnedKey="Tutte"
                  value={selectedSubCategory}
                  onChange={setSelectedSubCategory}
                />
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
                <EmptyState
                  icon="search-outline"
                  title={catalogRecipes.length === 0 ? t('explore.emptyCatalogTitle') : t('explore.noRecipesTitle')}
                  subtitle={catalogRecipes.length === 0 ? t('explore.emptyCatalogSub') : t('explore.noRecipesSub')}
                />
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
          variantError={selectedRecipe ? variantError : null}
          onDismissVariantError={() => setVariantError(null)}
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
                <CircleButton
                  variant="plain"
                  icon="close"
                  onPress={() => setShowFilterSheet(false)}
                  accessibilityLabel={t('common.close')}
                />
              </View>

              <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                {/* Sort order of the lists */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="swap-vertical-outline" size={icon.sm} color={colors.primaryText} style={{ marginRight: space.sm }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.sortTitle')}</Text>
                  </View>
                  <View style={styles.sortSpacing}>
                    <SegmentedControl
                      accessibilityLabel={t('explore.advanced.sortTitle')}
                      options={[
                        { key: 'alpha', label: t('explore.advanced.sortAlpha') },
                        { key: 'created', label: t('explore.advanced.sortCreated') },
                        { key: 'updated', label: t('explore.advanced.sortUpdated') },
                      ]}
                      value={recipeSort.key}
                      onChange={key => setRecipeSort(prev => ({ ...prev, key: key as typeof prev.key }))}
                    />
                  </View>
                  <SegmentedControl
                    accessibilityLabel={t('explore.advanced.sortTitle')}
                    options={[
                      { key: 'asc', label: t('explore.advanced.sortAsc') },
                      { key: 'desc', label: t('explore.advanced.sortDesc') },
                    ]}
                    value={recipeSort.direction}
                    onChange={direction => setRecipeSort(prev => ({ ...prev, direction: direction as typeof prev.direction }))}
                  />
                </View>

                {/* Max Time */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="time-outline" size={icon.sm} color={colors.primaryText} style={{ marginRight: space.sm }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.maxTime')}</Text>
                  </View>
                  <SegmentedControl
                    accessibilityLabel={t('explore.advanced.maxTime')}
                    options={MAX_TIME_OPTIONS.map(opt => ({ key: String(opt.value), label: opt.value === null ? t('explore.advanced.any') : t('explore.advanced.under', { n: opt.value }) }))}
                    value={String(filters.maxMinutes)}
                    onChange={key => setFilters(prev => ({ ...prev, maxMinutes: MAX_TIME_OPTIONS.find(o => String(o.value) === key)?.value ?? null }))}
                  />
                </View>

                {/* Difficulty */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="speedometer-outline" size={icon.sm} color={colors.primaryText} style={{ marginRight: space.sm }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.difficulty')}</Text>
                  </View>
                  <SegmentedControl
                    accessibilityLabel={t('explore.advanced.difficulty')}
                    options={DIFFICULTY_OPTIONS.map(opt => ({ key: String(opt.value), label: t(opt.labelKey) }))}
                    value={String(filters.difficolta)}
                    onChange={key => setFilters(prev => ({ ...prev, difficolta: DIFFICULTY_OPTIONS.find(o => String(o.value) === key)?.value as any }))}
                  />
                </View>

                {/* Diet: includes recipes that have a compatible variant */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="nutrition-outline" size={icon.sm} color={colors.primaryText} style={{ marginRight: space.sm }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.diet')}</Text>
                  </View>
                  <SegmentedControl
                    accessibilityLabel={t('explore.advanced.diet')}
                    options={[
                      { key: 'all', label: t('explore.advanced.all') },
                      { key: 'vegetarian', label: t('explore.advanced.dietOptions.vegetarian') },
                      { key: 'vegan', label: t('explore.advanced.dietOptions.vegan') },
                    ]}
                    value={dietFilter}
                    onChange={key => setDietFilter(key as typeof dietFilter)}
                  />
                </View>

                {/* Origin: only if the catalog contains recipes from more than one origin */}
                {availableOrigins.length > 1 && (
                  <View style={styles.sheetSection}>
                    <View style={styles.sectionLabelRow}>
                      <Ionicons name="library-outline" size={icon.sm} color={colors.primaryText} style={{ marginRight: space.sm }} />
                      <Text style={styles.sheetSectionTitle}>{t('explore.advanced.origin')}</Text>
                    </View>
                    <SegmentedControl
                      accessibilityLabel={t('explore.advanced.origin')}
                      options={[{ labelKey: 'explore.advanced.all', value: 'all' as const }, ...availableOrigins].map(opt => ({ key: opt.value, label: t(opt.labelKey) }))}
                      value={originFilter}
                      onChange={key => setOriginFilter(key as typeof originFilter)}
                    />
                  </View>
                )}

                {/* Features */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="leaf-outline" size={icon.sm} color={colors.primaryText} style={{ marginRight: space.sm }} />
                    <Text style={styles.sheetSectionTitle}>{t('explore.advanced.features')}</Text>
                  </View>
                  <SegmentedControl
                    accessibilityLabel={t('explore.advanced.features')}
                    options={FEATURE_OPTIONS.map(opt => ({ key: String(opt.value), label: t(opt.labelKey) }))}
                    value={String(filters.tag)}
                    onChange={key => setFilters(prev => ({ ...prev, tag: FEATURE_OPTIONS.find(o => String(o.value) === key)?.value ?? null }))}
                  />
                </View>
              </ScrollView>

              {/* Sheet Footer */}
              <View style={styles.sheetFooter}>
                {activeFiltersCount > 0 ? (
                  <Button
                    variant="ghost"
                    icon="refresh-outline"
                    label={t('explore.advanced.reset')}
                    onPress={handleResetFilters}
                  />
                ) : (
                  <View />
                )}

                <View style={styles.sheetApply}>
                  <Button
                    label={t('explore.advanced.showResults', { count: filteredRecipes.length })}
                    onPress={() => setShowFilterSheet(false)}
                  />
                </View>
              </View>
          </View>
        </SheetModal>

        {/* Floating Action Button: Importa AI */}
        {viewMode === 'catalog' && (
          <View style={[styles.fabImportBtn, { bottom: fabBottom, right: fabRight }]}>
            <CircleButton
              size="XL"
              variant="filled"
              icon="sparkles"
              label={t('explore.importButton')}
              onPress={() => setShowMagicImporter(true)}
              accessibilityLabel={t('explore.importAi')}
            />
          </View>
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
            <Spinner size="large" />
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
    backgroundColor: colors.surfaceAltGlass,
    gap: space.xl,
  },
  busyText: { fontSize: text.body, fontWeight: '700', color: colors.primaryText },
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
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.xxxl,
    marginBottom: space.sm,
  },
  fabImportBtn: {
    position: 'absolute',
    zIndex: 10,
    borderRadius: radius.full,
    ...elevation(3, colors),
  },
  modeToggle: {
    flex: 1,
  },
  // Search, category and subcategory rows are separated by the same vertical gap (space.md)
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.xxxl,
    marginBottom: space.lg,
  },
  searchField: {
    flex: 1,
  },
  sheetApply: {
    marginLeft: 'auto',
  },
  categoriesSection: {
    marginBottom: space.lg,
    paddingHorizontal: space.huge,
    gap: space.md,
  },
  subcategoriesSection: {
    marginBottom: space.none,
    paddingHorizontal: space.huge,
  },
  counterRow: {
    paddingHorizontal: space.huge,
    paddingVertical: space.sm,
  },
  counterText: {
    fontSize: text.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: space.xxxl,
    paddingBottom: 24,
  },
  columnWrapper: {
    gap: space.xxxl,
  },
  gridItem: {
    flex: 1,
  },
  fullWidthItem: {
    width: '100%',
  },
  // Filter Bottom Sheet Styles
  filterBody: { flex: 1, paddingHorizontal: space.huge, paddingTop: space.xxxl, paddingBottom: space.xxxl },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.xxxl,
    paddingBottom: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    fontSize: text.page,
    fontWeight: '700',
    color: colors.text,
  },
  sheetSub: {
    fontSize: text.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetSection: {
    marginBottom: space.huge,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  sheetSectionTitle: {
    fontSize: text.body,
    fontWeight: '700',
    color: colors.text,
  },
  // Space between the two sort controls
  sortSpacing: {
    marginBottom: space.xl,
  },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xxxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: space.md,
  },
});
