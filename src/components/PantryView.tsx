import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Keyboard,
  Platform
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Recipe } from '../types/recipe';
import { RecipeCard, PantryMatchInfo } from './RecipeCard';
import { useResponsiveDimensions } from '../hooks/useResponsiveDimensions';
import {
  searchPantryRecipes,
  getIngredientSuggestions,
  POPULAR_PANTRY_ITEMS,
  PantryMatchResult
} from '../services/pantryService';
import { addShoppingItems } from '../db/database';

interface PantryViewProps {
  onSelectRecipe: (recipe: Recipe) => void;
  onToastMessage?: (msg: string) => void;
}

export const PantryView: React.FC<PantryViewProps> = ({ onSelectRecipe, onToastMessage }) => {
  const { t } = useTranslation();
  const { width } = useResponsiveDimensions();
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const [assumeStaples, setAssumeStaples] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'ready' | 'almost'>('all');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Suggestions for autocomplete while typing
  const suggestions = useMemo(() => {
    return getIngredientSuggestions(inputText, selectedIngredients);
  }, [inputText, selectedIngredients]);

  // Quick suggestions that are not already selected
  const quickChips = useMemo(() => {
    const selectedLower = new Set(selectedIngredients.map(s => s.toLowerCase()));
    return POPULAR_PANTRY_ITEMS.filter(item => !selectedLower.has(item.toLowerCase())).slice(0, 12);
  }, [selectedIngredients]);

  // Execute matching algorithm
  const allResults = useMemo(() => {
    return searchPantryRecipes(selectedIngredients, assumeStaples);
  }, [selectedIngredients, assumeStaples]);

  // Count by category
  const readyCount = useMemo(() => {
    return allResults.filter(r => r.missingCount === 0).length;
  }, [allResults]);

  const almostCount = useMemo(() => {
    return allResults.filter(r => r.missingCount === 1).length;
  }, [allResults]);

  // Filtered list
  const filteredResults = useMemo(() => {
    if (activeFilter === 'ready') {
      return allResults.filter(r => r.missingCount === 0);
    }
    if (activeFilter === 'almost') {
      return allResults.filter(r => r.missingCount <= 1);
    }
    return allResults;
  }, [allResults, activeFilter]);

  // Number of columns based on responsive dimensions
  const numColumns = useMemo(() => {
    if (width >= 1024) return 3;
    if (width >= 600) return 2;
    return 1;
  }, [width]);

  const handleAddIngredient = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const exists = selectedIngredients.some(i => i.toLowerCase() === clean.toLowerCase());
    if (!exists) {
      setSelectedIngredients(prev => [...prev, clean]);
    }
    setInputText('');
  };

  const handleRemoveIngredient = (name: string) => {
    setSelectedIngredients(prev => prev.filter(i => i !== name));
  };

  const handleClearAll = () => {
    setSelectedIngredients([]);
    setInputText('');
  };

  const handleAddMissingToShopping = async (missing: string[], recipeTitle: string) => {
    if (missing.length === 0) return;

    await addShoppingItems(
      missing.map(rawText => ({
        recipeTitle,
        ingredientText: rawText,
        name: rawText,
        category: 'Svuotafrigo'
      }))
    );

    const msg = t(missing.length === 1 ? 'pantry.addedToShopping' : 'pantry.addedToShopping_plural', { count: missing.length });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setFeedbackToast(msg);
    if (onToastMessage) onToastMessage(msg);

    toastTimeoutRef.current = setTimeout(() => {
      setFeedbackToast(null);
    }, 3200);
  };

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // Memoized card renderer for virtualized FlatList
  const renderPantryItem = useCallback(
    ({ item }: { item: PantryMatchResult }) => {
      const pantryMatch: PantryMatchInfo = {
        percentage: item.percentage,
        missingCount: item.missingCount,
        missing: item.missing,
      };

      return (
        <View style={numColumns > 1 ? { flex: 1 / numColumns } : { width: '100%' }}>
          <RecipeCard
            recipe={item.recipe}
            onPress={() => onSelectRecipe(item.recipe)}
            pantryMatch={pantryMatch}
            onAddMissingToShopping={(missing, title) => handleAddMissingToShopping(missing, title)}
          />
        </View>
      );
    },
    [numColumns, onSelectRecipe]
  );

  // Header element containing search inputs, autocomplete, chips, and filter tabs
  const listHeaderElement = (
    <View style={styles.headerContainer}>
      {/* Header Info */}
      <View style={styles.headerBox}>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons name="fridge-outline" size={20} color="#4A6B53" style={{ marginRight: 6 }} />
          <Text style={styles.headerTitle}>{t('pantry.title')}</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          {t('pantry.subtitle')}
        </Text>
      </View>

      {/* Input Box with Autocomplete */}
      <View style={styles.inputCard}>
        <View style={styles.inputRow}>
          <Ionicons name="add-circle-outline" size={20} color="#7E8B80" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.textInput}
            placeholder={t('pantry.inputPlaceholder')}
            placeholderTextColor="#8C988F"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => handleAddIngredient(inputText)}
            returnKeyType="done"
          />
          {inputText.length > 0 && (
            <TouchableOpacity onPress={() => handleAddIngredient(inputText)} style={styles.addBtn}>
              <Text style={styles.addBtnText}>{t('pantry.addBtn')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Dropdown Suggestions */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsTitle}>{t('pantry.suggestions')}</Text>
            <View style={styles.suggestionsRow}>
              {suggestions.map((item, idx) => (
                <TouchableOpacity
                  key={`sug-${idx}`}
                  style={styles.suggestionChip}
                  onPress={() => handleAddIngredient(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={12} color="#4A6B53" style={{ marginRight: 2 }} />
                  <Text style={styles.suggestionChipText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Selected Ingredients List */}
        {selectedIngredients.length > 0 && (
          <View style={styles.selectedSection}>
            <View style={styles.selectedHeader}>
              <Text style={styles.selectedCountText}>
                {t('pantry.inYourPantry', { count: selectedIngredients.length })}
              </Text>
              <TouchableOpacity onPress={handleClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearAllText}>{t('pantry.clearAll')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.selectedChipsWrap}>
              {selectedIngredients.map((item, idx) => (
                <View key={`sel-${idx}`} style={styles.selectedChip}>
                  <Text style={styles.selectedChipText}>{item}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveIngredient(item)}
                    style={styles.removeChipBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="close" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick Add Staples */}
        <View style={styles.quickSection}>
          <Text style={styles.quickTitle}>{t('pantry.quickIngredients')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickScroll}
          >
            {quickChips.map((chip, idx) => (
              <TouchableOpacity
                key={`qc-${idx}`}
                style={styles.quickChip}
                onPress={() => handleAddIngredient(chip)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={12} color="#556658" style={{ marginRight: 3 }} />
                <Text style={styles.quickChipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Staples Toggle */}
        <TouchableOpacity
          style={styles.staplesToggleRow}
          onPress={() => setAssumeStaples(!assumeStaples)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={assumeStaples ? 'checkbox' : 'square-outline'}
            size={18}
            color={assumeStaples ? '#4A6B53' : '#8E9C91'}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.staplesText}>
            {t('pantry.staplesText')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results Header & Tabs */}
      {selectedIngredients.length > 0 && (
        <View style={styles.resultsHeader}>
          <View style={styles.resultsTitleRow}>
            <Text style={styles.resultsCount}>
              {t(allResults.length === 1 ? 'pantry.recipesFound' : 'pantry.recipesFound_plural', { count: allResults.length })}
            </Text>
            {readyCount > 0 && (
              <View style={styles.readyBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#1B6334" style={{ marginRight: 3 }} />
                <Text style={styles.readyBadgeText}>{t('pantry.readyBadge', { count: readyCount })}</Text>
              </View>
            )}
          </View>

          {/* Filter Pills */}
          <View style={styles.filtersRow}>
            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
              onPress={() => setActiveFilter('all')}
            >
              <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
                {t('pantry.filterAll', { count: allResults.length })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'ready' && styles.filterPillActive]}
              onPress={() => setActiveFilter('ready')}
            >
              <Text style={[styles.filterPillText, activeFilter === 'ready' && styles.filterPillTextActive]}>
                {t('pantry.filterReady', { count: readyCount })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'almost' && styles.filterPillActive]}
              onPress={() => setActiveFilter('almost')}
            >
              <Text style={[styles.filterPillText, activeFilter === 'almost' && styles.filterPillTextActive]}>
                {t('pantry.filterAlmost', { count: almostCount + readyCount })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // Empty state element
  const listEmptyElement = selectedIngredients.length === 0 ? (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="basket-outline" size={42} color="#8E9C91" />
      </View>
      <Text style={styles.emptyTitle}>{t('pantry.emptyTitle')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('pantry.emptySub')}
      </Text>
    </View>
  ) : filteredResults.length === 0 ? (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={38} color="#8E9C91" />
      <Text style={styles.emptyTitle}>{t('pantry.noResultsFilterTitle')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('pantry.noResultsFilterSub')}
      </Text>
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      {/* Feedback Toast Notification */}
      {feedbackToast && (
        <View style={styles.toastBanner}>
          <Ionicons name="cart" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.toastText}>{feedbackToast}</Text>
        </View>
      )}

      <FlatList
        key={`pantry-grid-${numColumns}`}
        data={filteredResults}
        keyExtractor={item => item.recipe.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: 16 } : undefined}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        ListHeaderComponent={listHeaderElement ?? undefined}
        ListEmptyComponent={listEmptyElement ?? undefined}
        renderItem={renderPantryItem}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerContainer: {
    paddingBottom: 4,
  },
  toastBanner: {
    position: 'absolute',
    top: 10,
    left: 20,
    right: 20,
    backgroundColor: '#34523C',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  headerBox: {
    backgroundColor: '#F0F5F1',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#DFE8E1',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#243328',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#556658',
    lineHeight: 18,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    marginBottom: 16,
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F6F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: '#243328',
  },
  addBtn: {
    backgroundColor: '#4A6B53',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0ECE4',
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E8B80',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF0EB',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  suggestionChipText: {
    fontSize: 12,
    color: '#34523C',
    fontWeight: '600',
  },
  selectedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0ECE4',
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34523C',
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C05621',
  },
  selectedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A6B53',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 20,
  },
  selectedChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  removeChipBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0ECE4',
  },
  quickTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E8B80',
    marginBottom: 6,
  },
  quickScroll: {
    gap: 6,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3EFEA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  quickChipText: {
    fontSize: 12,
    color: '#445246',
    fontWeight: '500',
  },
  staplesToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0ECE4',
  },
  staplesText: {
    fontSize: 11,
    color: '#657367',
    flex: 1,
  },
  resultsHeader: {
    marginBottom: 12,
  },
  resultsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B332B',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  readyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B6334',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  filterPillActive: {
    backgroundColor: '#4A6B53',
    borderColor: '#4A6B53',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556658',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F3EFEA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#243328',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#718073',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
});
