import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Recipe } from '../../types/recipe';
import { RecipeCard } from '../../components/RecipeCard';
import { RecipeModal } from '../../components/RecipeModal';
import { PantryView } from '../../components/PantryView';
import { MagicRecipeImporterModal } from '../../components/MagicRecipeImporterModal';
import { useResponsiveDimensions } from '../../hooks/useResponsiveDimensions';
import { useDebounce } from '../../hooks/useDebounce';
import { searchRecipes, initializeSearchIndex, AdvancedFilterOptions } from '../../services/searchService';
import { getCustomRecipes } from '../../db/database';
import { MACRO_CATEGORIES, RECIPE_TAXONOMY, MacroCategory } from '../../constants/categories';

const rawRecipes = require('../../../assets/ricette.json') as Recipe[];

const CATEGORIES = ['Tutte', ...MACRO_CATEGORIES];

export default function ExploreScreen() {
  const { width } = useResponsiveDimensions();
  const [viewMode, setViewMode] = useState<'catalog' | 'pantry'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tutte');
  const [selectedSubCategory, setSelectedSubCategory] = useState('Tutte');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showMagicImporter, setShowMagicImporter] = useState(false);
  const [customRecipes, setCustomRecipes] = useState<Recipe[]>([]);

  // Load custom user recipes and index them
  useEffect(() => {
    loadCustomRecipes();
  }, []);

  const loadCustomRecipes = async () => {
    try {
      const customs = await getCustomRecipes();
      setCustomRecipes(customs);
      initializeSearchIndex([...customs, ...rawRecipes]);
    } catch {
      initializeSearchIndex(rawRecipes);
    }
  };

  const handleRecipeSaved = (newRecipe: Recipe) => {
    setCustomRecipes(prev => {
      const updated = [newRecipe, ...prev.filter(r => r.id !== newRecipe.id)];
      initializeSearchIndex([...updated, ...rawRecipes]);
      return updated;
    });
    setSelectedRecipe(newRecipe);
  };

  // Advanced Filters State
  const [showFilterSheet, setShowFilterSheet] = useState(false);
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
    return count;
  }, [filters, selectedSubCategory]);

  const handleResetFilters = () => {
    setFilters({
      maxMinutes: null,
      difficolta: null,
      tag: null,
      sottocategoria: null,
    });
    setSelectedSubCategory('Tutte');
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
    return searchRecipes(debouncedQuery, selectedCategory, combinedFilters);
  }, [debouncedQuery, selectedCategory, selectedSubCategory, filters, customRecipes]);

  // Responsive column count calculation
  const numColumns = useMemo(() => {
    if (width >= 1024) return 3;
    if (width >= 600) return 2;
    return 1;
  }, [width]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>
        {/* Header Green-Whisker: Pure, clean branding */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandInfo}>
              <View style={styles.logoBadge}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.logoImage}
                  contentFit="contain"
                />
              </View>
              <View>
                <Text style={styles.brandTitle}>Green-Whisker</Text>
              </View>
            </View>
          </View>

          {/* Mode Switcher: Catalogo vs Svuotafrigo */}
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, viewMode === 'catalog' && styles.modeToggleBtnActive]}
              onPress={() => setViewMode('catalog')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="book-outline"
                size={14}
                color={viewMode === 'catalog' ? '#FFFFFF' : '#5E6D60'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeToggleText, viewMode === 'catalog' && styles.modeToggleTextActive]}>
                Tutte le Ricette
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
                color={viewMode === 'pantry' ? '#FFFFFF' : '#5E6D60'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeToggleText, viewMode === 'pantry' && styles.modeToggleTextActive]}>
                Svuotafrigo
              </Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'catalog' && (
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color="#7E8B80" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cerca per ricetta o ingrediente (es. zucca, pasta)..."
                  placeholderTextColor="#8C988F"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={18} color="#7E8B80" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.filterBtn, activeFiltersCount > 0 && styles.filterBtnActive]}
                onPress={() => setShowFilterSheet(true)}
                activeOpacity={0.8}
                accessibilityLabel="Filtri avanzati"
              >
                <Ionicons
                  name={activeFiltersCount > 0 ? 'options' : 'options-outline'}
                  size={20}
                  color={activeFiltersCount > 0 ? '#FFFFFF' : '#4A6B53'}
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
                    <Ionicons name="close-circle" size={14} color="#FFF" style={{ marginRight: 4 }} />
                    <Text style={styles.activeFiltersPillText}>
                      {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro' : 'filtri'}
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
                        {cat}
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
                          {sub}
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
                {filteredRecipes.length} {filteredRecipes.length === 1 ? 'ricetta trovata' : 'ricette trovate'}
              </Text>
            </View>

            {/* Recipes Grid */}
            <FlatList
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
              renderItem={({ item }) => (
                <View style={numColumns > 1 ? styles.gridItem : styles.fullWidthItem}>
                  <RecipeCard
                    recipe={item}
                    onPress={() => setSelectedRecipe(item)}
                  />
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={48} color="#A3B2A6" />
                  <Text style={styles.emptyTitle}>Nessuna ricetta trovata</Text>
                  <Text style={styles.emptySubtitle}>
                    Prova a cercare con un altro ingrediente o rimuovi i filtri selezionati.
                  </Text>
                </View>
              }
            />
          </>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 60 }}
          >
            <PantryView onSelectRecipe={setSelectedRecipe} />
          </ScrollView>
        )}

        {/* Modal Dettaglio Ricetta */}
        <RecipeModal
          recipe={selectedRecipe}
          visible={!!selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />

        {/* Modal Filtri Avanzati (Bottom Sheet) */}
        <Modal
          visible={showFilterSheet}
          animationType="fade"
          transparent
          onRequestClose={() => setShowFilterSheet(false)}
        >
          <TouchableOpacity
            style={styles.sheetOverlay}
            activeOpacity={1}
            onPress={() => setShowFilterSheet(false)}
          >
            <View
              style={[styles.sheetContainer, width >= 768 && styles.sheetContainerTablet]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>Filtri Avanzati</Text>
                  <Text style={styles.sheetSub}>Personalizza la ricerca delle ricette</Text>
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={() => setShowFilterSheet(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color="#2B332B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                {/* Tempo Massimo */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="time-outline" size={16} color="#4A6B53" style={{ marginRight: 6 }} />
                    <Text style={styles.sheetSectionTitle}>Tempo Massimo</Text>
                  </View>
                  <View style={styles.sheetChipsRow}>
                    {[
                      { label: 'Qualsiasi', value: null },
                      { label: '< 20 min', value: 20 },
                      { label: '< 35 min', value: 35 },
                      { label: '< 50 min', value: 50 },
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

                {/* Difficoltà */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="speedometer-outline" size={16} color="#4A6B53" style={{ marginRight: 6 }} />
                    <Text style={styles.sheetSectionTitle}>Difficoltà</Text>
                  </View>
                  <View style={styles.sheetChipsRow}>
                    {[
                      { label: 'Tutte', value: null },
                      { label: 'Facile', value: 'Facile' },
                      { label: 'Media', value: 'Media' },
                      { label: 'Difficile', value: 'Difficile' },
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

                {/* Caratteristiche */}
                <View style={styles.sheetSection}>
                  <View style={styles.sectionLabelRow}>
                    <Ionicons name="leaf-outline" size={16} color="#4A6B53" style={{ marginRight: 6 }} />
                    <Text style={styles.sheetSectionTitle}>Caratteristiche</Text>
                  </View>
                  <View style={styles.sheetChipsRow}>
                    {[
                      { label: 'Tutte', value: null },
                      { label: 'Senza Glutine', value: 'Senza Glutine' },
                      { label: 'Al forno', value: 'Al forno' },
                      { label: 'Senza cottura', value: 'Senza cottura' },
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
                    <Ionicons name="refresh-outline" size={15} color="#6E7E72" style={{ marginRight: 4 }} />
                    <Text style={styles.sheetResetText}>Azzera</Text>
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
                    Mostra {filteredRecipes.length} {filteredRecipes.length === 1 ? 'ricetta' : 'ricette'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Floating Action Button: Importa AI */}
        {viewMode === 'catalog' && (
          <TouchableOpacity
            style={styles.fabImportBtn}
            onPress={() => setShowMagicImporter(true)}
            activeOpacity={0.88}
          >
            <Ionicons name="sparkles" size={17} color="#FFFFFF" style={{ marginRight: 7 }} />
            <Text style={styles.fabImportText}>Importa AI</Text>
          </TouchableOpacity>
        )}

        {/* Magic Recipe Importer AI Modal */}
        <MagicRecipeImporterModal
          visible={showMagicImporter}
          onClose={() => setShowMagicImporter(false)}
          onRecipeSaved={handleRecipeSaved}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fabImportBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34523C',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  fabImportText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#243328',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#718073',
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECE7DF',
    borderRadius: 14,
    padding: 3,
    marginBottom: 12,
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
    backgroundColor: '#34523C',
    shadowColor: '#1A2E1F',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#556658',
  },
  modeToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#2B332B',
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE7DF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  filterBtnActive: {
    backgroundColor: '#34523C',
    borderColor: '#34523C',
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
    borderColor: '#FBF9F5',
  },
  filterBadgeText: {
    color: '#FFFFFF',
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
    color: '#FFFFFF',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEBE4',
  },
  categoryChipSelected: {
    backgroundColor: '#4A6B53',
    borderColor: '#4A6B53',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#657367',
  },
  categoryChipTextSelected: {
    color: '#FFFFFF',
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
    backgroundColor: '#F0EBE3',
    borderWidth: 1,
    borderColor: '#E2DBD0',
  },
  subCategoryChipSelected: {
    backgroundColor: '#34523C',
    borderColor: '#34523C',
  },
  subCategoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5C6C5F',
  },
  subCategoryChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  counterRow: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A998D',
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
    color: '#2B332B',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#7E8B80',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  // Filter Bottom Sheet Styles
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FBF9F5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  sheetContainerTablet: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEBE4',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B332B',
  },
  sheetSub: {
    fontSize: 13,
    color: '#7E8B80',
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EBE5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    maxHeight: 340,
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
    color: '#2B332B',
  },
  sheetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  sheetChipSelected: {
    backgroundColor: '#34523C',
    borderColor: '#34523C',
  },
  sheetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#556658',
  },
  sheetChipTextSelected: {
    color: '#FFFFFF',
  },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EFEBE4',
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
    color: '#6E7E72',
  },
  sheetApplyBtn: {
    backgroundColor: '#34523C',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginLeft: 'auto',
  },
  sheetApplyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
