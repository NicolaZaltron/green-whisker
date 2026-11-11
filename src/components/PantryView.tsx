import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ScrollView,
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
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { AppTextField } from './ui/AppTextField';

interface PantryViewProps {
  onSelectRecipe: (recipe: Recipe) => void;
  onToastMessage?: (msg: string) => void;
}

export const PantryView: React.FC<PantryViewProps> = ({ onSelectRecipe, onToastMessage }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

    const msg = t('pantry.addedToShopping', { count: missing.length });
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
          <MaterialCommunityIcons name="fridge-outline" size={20} color={colors.primaryText} style={{ marginRight: 6 }} />
          <Text style={styles.headerTitle}>{t('pantry.title')}</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          {t('pantry.subtitle')}
        </Text>
      </View>

      {/* Input Box with Autocomplete */}
      <View style={styles.inputCard}>
        <View style={styles.inputRow}>
          <AppTextField
            style={styles.textInput}
            leftIcon={<Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />}
            placeholder={t('pantry.inputPlaceholder')}
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
                  <Ionicons name="add" size={12} color={colors.primaryText} style={{ marginRight: 2 }} />
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
                    <Ionicons name="close" size={14} color={colors.onPrimary} />
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
                <Ionicons name="add" size={12} color={colors.textSecondary} style={{ marginRight: 3 }} />
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
            color={assumeStaples ? colors.primaryText : colors.textMuted}
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
              {t('pantry.recipesFound', { count: allResults.length })}
            </Text>
            {readyCount > 0 && (
              <View style={styles.readyBadge}>
                <Ionicons name="checkmark-circle" size={12} color={colors.primaryText} style={{ marginRight: 3 }} />
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
        <Ionicons name="basket-outline" size={42} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{t('pantry.emptyTitle')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('pantry.emptySub')}
      </Text>
    </View>
  ) : filteredResults.length === 0 ? (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={38} color={colors.textMuted} />
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
          <Ionicons name="cart" size={16} color={colors.onPrimary} style={{ marginRight: 6 }} />
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

const makeStyles = (colors: Palette) => StyleSheet.create({
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
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  headerBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
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
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  suggestionChipText: {
    fontSize: 12,
    color: colors.primaryText,
    fontWeight: '600',
  },
  selectedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    color: colors.primaryText,
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.danger,
  },
  selectedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 20,
  },
  selectedChipText: {
    color: colors.onPrimary,
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
    borderTopColor: colors.border,
  },
  quickTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 6,
  },
  quickScroll: {
    gap: 6,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  quickChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  staplesToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  staplesText: {
    fontSize: 11,
    color: colors.textSecondary,
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
    color: colors.text,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  readyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryText,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.onPrimary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
});
