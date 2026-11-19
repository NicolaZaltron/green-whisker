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
import { RecipeSummary } from '../types/recipe';
import { RecipeCard, PantryMatchInfo } from './RecipeCard';
import { useResponsiveDimensions } from '../hooks/useResponsiveDimensions';
import {
  searchPantryRecipes,
  getIngredientSuggestions,
  buildIngredientVocabulary,
  POPULAR_PANTRY_ITEMS,
  IngredientVocabularyItem,
  PantryMatchResult
} from '../services/pantryService';
import { listIngredients } from '../db/ingredientsDb';
import { addShoppingItems } from '../db/database';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { AppTextField } from './ui/AppTextField';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Toast } from './ui/Toast';
import { Pill } from './ui/Pill';
import { SegmentedControl } from './ui/SegmentedControl';
import { Card } from './ui/Card';
import { SectionLabel } from './ui/SectionLabel';
import { cardRadius, radius, space, text, icon } from '../theme/tokens';

interface PantryViewProps {
  onSelectRecipe: (recipe: RecipeSummary) => void;
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

  // Suggestion vocabulary: app ingredient names plus common ones
  const [vocabulary, setVocabulary] = useState<IngredientVocabularyItem[]>([]);
  useEffect(() => {
    let active = true;
    listIngredients().then(list => {
      const built = buildIngredientVocabulary(list.map(item => item.name));
      if (active) setVocabulary(built);
    });
    return () => { active = false; };
  }, []);

  // Suggestions for autocomplete while typing
  const suggestions = useMemo(() => {
    return getIngredientSuggestions(inputText, selectedIngredients, vocabulary);
  }, [inputText, selectedIngredients, vocabulary]);

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

  const handleAddMissingToShopping = useCallback(async (missing: string[], recipeTitle: string) => {
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
  }, [t, onToastMessage]);

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
            onAddMissingToShopping={handleAddMissingToShopping}
          />
        </View>
      );
    },
    [numColumns, onSelectRecipe, handleAddMissingToShopping]
  );

  // Header element containing search inputs, autocomplete, chips, and filter tabs
  const listHeaderElement = (
    <View style={styles.headerContainer}>
      {/* Header Info */}
      <View style={styles.headerBox}>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons name="fridge-outline" size={icon.lg} color={colors.primaryText} style={{ marginRight: space.sm }} />
          <Text style={styles.headerTitle}>{t('pantry.title')}</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          {t('pantry.subtitle')}
        </Text>
      </View>

      {/* Input Box with Autocomplete */}
      <Card elevation={1} padding="xxl" style={styles.inputCard}>
        <View style={styles.inputRow}>
          <AppTextField
            variant="search"
            size="M"
            style={styles.textInput}
            leftIcon={<Ionicons name="add-circle-outline" size={icon.lg} color={colors.textMuted} />}
            placeholder={t('pantry.inputPlaceholder')}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => handleAddIngredient(inputText)}
            returnKeyType="done"
          />
          {inputText.length > 0 && (
            <Button label={t('pantry.addBtn')} onPress={() => handleAddIngredient(inputText)} />
          )}
        </View>

        {/* Dropdown Suggestions */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <SectionLabel text={t('pantry.suggestions')} />
            <View style={styles.suggestionsRow}>
              {suggestions.map((item, idx) => (
                <Pill
                  key={`sug-${idx}`}
                  icon="add"
                  label={item}
                  size="M"
                  onPress={() => handleAddIngredient(item)}
                />
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
                <Pill
                  key={`sel-${idx}`}
                  icon="close"
                  label={item}
                  size="M"
                  selected
                  onPress={() => handleRemoveIngredient(item)}
                />
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
              <Pill
                key={`qc-${idx}`}
                icon="add"
                label={chip}
                size="M"
                onPress={() => handleAddIngredient(chip)}
              />
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
            size={icon.md}
            color={assumeStaples ? colors.primaryText : colors.textMuted}
            style={{ marginRight: space.md }}
          />
          <Text style={styles.staplesText}>
            {t('pantry.staplesText')}
          </Text>
        </TouchableOpacity>
      </Card>

      {/* Results Header & Tabs */}
      {selectedIngredients.length > 0 && (
        <View style={styles.resultsHeader}>
          <View style={styles.resultsTitleRow}>
            <Text style={styles.resultsCount}>
              {t('pantry.recipesFound', { count: allResults.length })}
            </Text>
            {readyCount > 0 && (
              <View style={styles.readyBadge}>
                <Ionicons name="checkmark-circle" size={icon.xs} color={colors.primaryText} style={{ marginRight: 3 }} />
                <Text style={styles.readyBadgeText}>{t('pantry.readyBadge', { count: readyCount })}</Text>
              </View>
            )}
          </View>

          {/* Filter Pills */}
          <View style={styles.filtersRow}>
            <SegmentedControl
              accessibilityLabel={t('pantry.filtersLabel')}
              options={[
                { key: 'all', label: t('pantry.filterAll', { count: allResults.length }) },
                { key: 'ready', label: t('pantry.filterReady', { count: readyCount }) },
                { key: 'almost', label: t('pantry.filterAlmost', { count: almostCount + readyCount }) },
              ]}
              value={activeFilter}
              onChange={key => setActiveFilter(key as typeof activeFilter)}
            />
          </View>
        </View>
      )}
    </View>
  );

  // Empty state element
  const listEmptyElement = selectedIngredients.length === 0 ? (
    <Card style={styles.emptyCard}>
      <EmptyState icon="basket-outline" title={t('pantry.emptyTitle')} subtitle={t('pantry.emptySub')} />
    </Card>
  ) : filteredResults.length === 0 ? (
    <Card style={styles.emptyCard}>
      <EmptyState icon="search-outline" title={t('pantry.noResultsFilterTitle')} subtitle={t('pantry.noResultsFilterSub')} />
    </Card>
  ) : null;

  return (
    <View style={styles.root}>
      {/* Feedback Toast Notification */}
      {feedbackToast && <Toast position="top" message={feedbackToast} />}

      <FlatList
        key={`pantry-grid-${numColumns}`}
        data={filteredResults}
        keyExtractor={item => item.recipe.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: space.xxxl } : undefined}
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
    paddingHorizontal: space.huge,
    paddingBottom: 40,
  },
  headerContainer: {
    paddingBottom: space.xs,
  },
  headerBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: cardRadius,
    padding: space.xxl,
    marginBottom: space.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  headerTitle: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: text.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inputCard: {
    marginBottom: space.xxxl,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  textInput: {
    flex: 1,
  },
  suggestionsContainer: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  selectedSection: {
    marginTop: space.xl,
    paddingTop: space.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  selectedCountText: {
    fontSize: text.caption,
    fontWeight: '700',
    color: colors.primaryText,
  },
  clearAllText: {
    fontSize: text.label,
    fontWeight: '600',
    color: colors.danger,
  },
  selectedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  quickSection: {
    marginTop: space.xl,
    paddingTop: space.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quickTitle: {
    fontSize: text.label,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: space.sm,
  },
  quickScroll: {
    gap: space.sm,
  },
  staplesToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  staplesText: {
    fontSize: text.label,
    color: colors.textSecondary,
    flex: 1,
  },
  resultsHeader: {
    marginBottom: space.xl,
  },
  resultsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  resultsCount: {
    fontSize: text.body,
    fontWeight: '700',
    color: colors.text,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: space.md,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  readyBadgeText: {
    fontSize: text.label,
    fontWeight: '700',
    color: colors.primaryText,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  emptyCard: {
    marginTop: space.md,
    padding: 0,
  },
});
