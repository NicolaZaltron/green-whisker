import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ScrollView,
  TouchableOpacity,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { SheetModal } from '../SheetModal';
import type { RecipeSummary, RecipeSource } from '../../types/recipe';
import { INGREDIENT_TAGS, type Ingredient, type ReadyMeal } from '../../types/catalog';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { AppTextField } from '../../components/ui/AppTextField';
import { SearchBar } from '../../components/ui/SearchBar';
import { Spinner } from '../ui/Spinner';
import { formatTagLabel, unitLabel } from '../../constants/simpleTags';
import { formatDayAndDate } from '../../utils/dates';
import { OUT_OF_HOME_OPTIONS } from '../../constants/outOfHome';
import { listOutOfHomeOptions } from '../../services/outOfHomeService';
import { isRecipeForSlot } from '../../utils/recipeSlots';
import { rankPickerMatches } from '../../utils/pickerRanking';
import { SHOPPING_UNITS, toSelectableUnit } from '../../constants/shoppingUnits';
import { getSortedPickerRecipes, uniquePickerRecipes } from '../../services/pickerRecipes';
import { SLOT_COLORS, type MealSlot } from '../../services/plannerService';
import { PlannedItemCard, plannedItemLabel, type DayMealItem } from './PlannedItemCards';
import { RecipeServingsStep } from './RecipeServingsStep';
import { ingredientDisplayName } from '../../utils/ingredientNames';
import { ModalHeader } from '../ui/ModalHeader';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { cardRadius, display, radius, space, text, icon } from '../../theme/tokens';
import { SegmentedControl } from '../ui/SegmentedControl';

export interface MealPickerModalProps {
  visible: boolean;
  targetSlot: string;
  targetDate: string;
  // Meals already planned in the slot (selected day), shown as read-only cards
  plannedForSlot: DayMealItem[];
  allRecipes: RecipeSummary[];
  // Ids of favorite recipes: shown with the heart and placed first in search results
  favoriteIds?: ReadonlySet<string>;
  ingredients: Ingredient[];
  readyMeals: ReadyMeal[];
  // Default servings to eat (planner setting): when preparing, the default is the recipe's
  eatServings: number;
  onSelectRecipe: (recipe: RecipeSummary, servings: number, source: RecipeSource) => void;
  onSelectIngredient: (ingredient: Ingredient, amount: number | null, unit: string) => void;
  onSelectReadyMeal: (meal: ReadyMeal, count: number) => void;
  onSelectOutOfHome: (label: string) => void;
  onDeletePlanned?: (entryId: string) => void;
  onClose: () => void;
}

// Stable empty set: a new default on every render would invalidate memoized lists
const EMPTY_FAVORITE_IDS: ReadonlySet<string> = new Set<string>();

// Read-only planned cards in the picker: no swap or deletion from here

type MealTab = 'all' | 'recipes' | 'ingredients' | 'ready' | 'out';
const TABS: MealTab[] = ['all', 'ingredients', 'recipes', 'ready', 'out'];

// null = All (no tag filter)
type TagFilter = string | null;

type PendingItem =
  | { kind: 'recipe'; recipe: RecipeSummary }
  | { kind: 'ingredient'; ingredient: Ingredient }
  | { kind: 'ready'; meal: ReadyMeal };

type PickerRow =
  | { kind: 'recipe'; key: string; recipe: RecipeSummary }
  | { kind: 'ingredient'; key: string; ingredient: Ingredient }
  | { kind: 'ready'; key: string; meal: ReadyMeal }
  | { kind: 'out'; key: string; label: string };

// Stable function for FlatList: a new one on every render would recompute the keys
const keyExtractor = (row: PickerRow) => row.key;

// Picker rows for ingredients, out of home and ready meals: memoized like the recipes
const PickerIngredientRow = React.memo(function PickerIngredientRow({ ingredient, onStart }: { ingredient: Ingredient; onStart: (ingredient: Ingredient) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const quantity = ingredient.default_amount != null
    ? `${ingredient.default_amount} ${unitLabel(ingredient.default_unit, t, ingredient.default_amount ?? 1)}`.trim()
    : '';
  return (
    <TouchableOpacity style={styles.pickerItem} onPress={() => onStart(ingredient)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerItemTitle} numberOfLines={2}>{ingredientDisplayName(ingredient, t)}</Text>
        <Text style={styles.pickerItemMeta} numberOfLines={1}>
          {t(`mealPicker.type.${ingredient.type}`)}
          {quantity ? ` • ${quantity}` : ''}
        </Text>
      </View>
      <Ionicons name="add-circle" size={icon.xl} color={colors.primaryText} />
    </TouchableOpacity>
  );
});

const PickerOutRow = React.memo(function PickerOutRow({ label, onSelect }: { label: string; onSelect: (label: string) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.pickerItem} onPress={() => onSelect(label)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerItemTitle} numberOfLines={2}>{label}</Text>
      </View>
      <Ionicons name="add-circle" size={icon.xl} color={colors.primaryText} />
    </TouchableOpacity>
  );
});

const PickerReadyRow = React.memo(function PickerReadyRow({ meal, onStart }: { meal: ReadyMeal; onStart: (meal: ReadyMeal) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.pickerItem} onPress={() => onStart(meal)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerItemCat}>
          {t(`mealPicker.category.${meal.category}`)}
        </Text>
        <Text style={styles.pickerItemTitle} numberOfLines={2}>{meal.name}</Text>
        {meal.tags.length > 0 && (
          <Text style={styles.pickerItemMeta} numberOfLines={1}>
            {(meal.tags as string[]).map(tag => formatTagLabel(tag, t)).join(' • ')}
          </Text>
        )}
      </View>
      <Ionicons name="add-circle" size={icon.xl} color={colors.primaryText} />
    </TouchableOpacity>
  );
});

// Row of a recipe in the picker. Memoized: with unchanged props it does not re-render when
// another row's step (source, servings) changes, so the tap does not reload all images
const PickerRecipeRow = React.memo(function PickerRecipeRow({
  recipe,
  isFavorite,
  expanded,
  step,
  onStart,
  onCollapse,
}: {
  recipe: RecipeSummary;
  isFavorite: boolean;
  expanded: boolean;
  step: React.ReactNode;
  onStart: (recipe: RecipeSummary) => void;
  onCollapse: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const minutes = recipe.times?.total_minutes ?? 0;
  const servings = recipe.servings ?? 0;
  const imageSource = useMemo(() => ({ uri: recipe.image }), [recipe.image]);
  return (
    <View>
      <TouchableOpacity
        style={[styles.pickerItem, expanded && styles.pickerItemExpanded]}
        onPress={() => (expanded ? onCollapse() : onStart(recipe))}
        activeOpacity={0.7}
      >
        {recipe.image ? (
          <Image
            source={imageSource}
            style={[styles.recipeThumb, { backgroundColor: colors.surfaceMuted }]}
            contentFit="cover"
            cachePolicy="disk"
            recyclingKey={recipe.id}
            transition={0}
          />
        ) : (
          <View style={[styles.recipeThumb, styles.recipeThumbPlaceholder]}>
            <Ionicons name="restaurant-outline" size={icon.lg} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.pickerItemTitle, { flexShrink: 1 }]} numberOfLines={2}>{recipe.title}</Text>
          {(minutes > 0 || servings > 0 || isFavorite) && (
            <View style={styles.recipeMeta}>
              {minutes > 0 && (
                <>
                  <Ionicons name="time-outline" size={icon.xs} color={colors.textMuted} style={{ marginRight: 3 }} />
                  <Text style={styles.pickerItemMeta}>{t('common.minutes', { count: minutes })}</Text>
                </>
              )}
              {minutes > 0 && servings > 0 && (
                <Text style={styles.recipeMetaDivider}>·</Text>
              )}
              {servings > 0 && (
                <>
                  <Ionicons name="people-outline" size={icon.xs} color={colors.textMuted} style={{ marginRight: 3 }} />
                  <Text style={styles.pickerItemMeta}>{t('common.servings', { count: servings })}</Text>
                </>
              )}
              {isFavorite && (
                <Ionicons name="heart" size={icon.xs} color={colors.primary} style={{ marginLeft: space.sm }} />
              )}
            </View>
          )}
        </View>
        <Ionicons name="add-circle" size={icon.xl} color={colors.primaryText} />
      </TouchableOpacity>
      {step}
    </View>
  );
});


/**
 * Single modal to add a meal to a planner slot:
 * recipes, raw ingredients (with quantity), ready products (with number of servings) and out-of-home meals.
 */
const MealPickerModal: React.FC<MealPickerModalProps> = ({
  visible,
  targetSlot,
  targetDate,
  plannedForSlot,
  allRecipes,
  favoriteIds = EMPTY_FAVORITE_IDS,
  ingredients,
  readyMeals,
  eatServings,
  onSelectRecipe,
  onSelectIngredient,
  onSelectReadyMeal,
  onSelectOutOfHome,
  onDeletePlanned,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  // Collator for the app language: alphabetical sorting consistent with the displayed one, created once per language
  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base' }), [i18n.language]);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Slot color, as in the planner cards
  const slotColors = SLOT_COLORS[targetSlot as MealSlot];
  const slotAccent = slotColors ? (isDark ? slotColors.darkColor : slotColors.color) : colors.primaryText;

  const [tab, setTab] = useState<MealTab>('all');
  const [query, setQuery] = useState('');
  // The text field uses query (immediate); the lists use deferredQuery, so typing does not wait for the filter
  const deferredQuery = useDeferredValue(query);
  const [tagFilter, setTagFilter] = useState<TagFilter>(null);
  // Recipes tab: by default only those compatible with the slot, "All" shows them all
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  // Ready tab: same behavior; by default only those intended for the slot
  const [showAllReady, setShowAllReady] = useState(false);
  const [pending, setPending] = useState<PendingItem | null>(null);
  const [amountText, setAmountText] = useState('');
  const [unitText, setUnitText] = useState('');
  const [countText, setCountText] = useState('1');
  const [recipeServings, setRecipeServings] = useState(eatServings);
  const [recipeSource, setRecipeSource] = useState<RecipeSource>('prepare');
  // Last meal added: the modal stays open to add more to the same slot
  const [added, setAdded] = useState<string | null>(null);
  // Name of the last addition shown in the notice: stays set during the closing fade
  const [alertName, setAlertName] = useState('');
  if (added !== null && added !== alertName) setAlertName(added);
  // Reset on slot change (the modal stays mounted and only targetSlot changes)
  const [prevTargetSlot, setPrevTargetSlot] = useState(targetSlot);
  if (prevTargetSlot !== targetSlot) {
    setPrevTargetSlot(targetSlot);
    setShowAllRecipes(false);
  }

  // List rows computed only when the modal is open and after the first frame: so opening is immediate
  // and the spinner stays visible while the list is prepared. Stays true between openings
  // until the data source (recipes, favorites, ingredients, ready meals) changes.
  const [listReady, setListReady] = useState(false);
  const preparedSourceRef = useRef<{
    allRecipes: RecipeSummary[];
    favoriteIds: ReadonlySet<string>;
    ingredients: Ingredient[];
    readyMeals: ReadyMeal[];
  } | null>(null);

  useEffect(() => {
    if (!visible || listReady) return;
    const frame = requestAnimationFrame(() => {
      preparedSourceRef.current = { allRecipes, favoriteIds, ingredients, readyMeals };
      setListReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, listReady, allRecipes, favoriteIds, ingredients, readyMeals]);

  useEffect(() => {
    const prepared = preparedSourceRef.current;
    if (visible || !prepared) return;
    const changed =
      prepared.allRecipes !== allRecipes ||
      prepared.favoriteIds !== favoriteIds ||
      prepared.ingredients !== ingredients ||
      prepared.readyMeals !== readyMeals;
    if (changed) {
      preparedSourceRef.current = null;
      setListReady(false);
    }
  }, [visible, allRecipes, favoriteIds, ingredients, readyMeals]);

  const resetAll = useCallback(() => {
    setTab('all');
    setQuery('');
    setTagFilter(null);
    setShowAllRecipes(false);
    setPending(null);
    setAmountText('');
    setUnitText('');
    setCountText('1');
    setAdded(null);
  }, []);

  // After an addition only the steps in progress are closed: tab, search and filters remain
  const finishAdd = useCallback((name: string) => {
    setPending(null);
    setAmountText('');
    setUnitText('');
    setCountText('1');
    setAdded(name);
  }, []);

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleTabChange = (next: MealTab) => {
    setTab(next);
    setTagFilter(null);
    setPending(null);
  };

  // Recipes: without duplicates, sorted (favorites first) and filtered by search.
  // Does not depend on tab/slot: the most expensive computation is not repeated on every tab change
  // Empty query: favorites first, then the others (alphabetical), memoized in getSortedPickerRecipes;
  // with search: favorites first among matches
  const sortedRecipes = useMemo(() => {
    if (!listReady) return [];
    const q = deferredQuery.toLowerCase().trim();
    if (!q) return getSortedPickerRecipes(allRecipes, favoriteIds, collator);
    const matched = uniquePickerRecipes(allRecipes).filter(r => r.title.toLowerCase().includes(q));
    return matched.sort((a, b) => {
      const favA = favoriteIds.has(a.id);
      const favB = favoriteIds.has(b.id);
      if (favA !== favB) return favA ? -1 : 1;
      return collator.compare(a.title, b.title);
    });
  }, [allRecipes, deferredQuery, favoriteIds, listReady, collator]);

  // Only the slot filter (Recipes tab, "Suggested"); the filter preserves the order of sortedRecipes
  const visibleRecipes = useMemo(
    () =>
      tab === 'recipes' && !showAllRecipes
        ? sortedRecipes.filter(r => isRecipeForSlot(r, targetSlot))
        : sortedRecipes,
    [sortedRecipes, targetSlot, showAllRecipes, tab]
  );

  // Ingredients: only those edible as they are
  const edibleIngredients = useMemo(
    () => ingredients.filter(i => i.edible_alone === true),
    [ingredients]
  );

  const ingredientTagOptions = useMemo(
    () => INGREDIENT_TAGS.filter(tag => edibleIngredients.some(i => i.tags.some(x => x === tag))),
    [edibleIngredients]
  );

  const ingredientList = useMemo(() => {
    if (!listReady) return [];
    const q = deferredQuery.toLowerCase().trim();
    return edibleIngredients
      .filter(i => (!tagFilter || i.tags.some(tag => tag === tagFilter)))
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [edibleIngredients, deferredQuery, tagFilter, listReady, collator]);

  // Ready: by default only those intended for this slot, "All" shows them all
  const slotReadyMeals = useMemo(
    () => (showAllReady ? readyMeals : readyMeals.filter(m => m.slots.includes(targetSlot))),
    [readyMeals, targetSlot, showAllReady]
  );

  const readyTagOptions = useMemo(() => {
    const set = new Set<string>();
    slotReadyMeals.forEach(m => (m.tags as string[]).forEach(tag => set.add(tag)));
    return Array.from(set).sort((a, b) => collator.compare(a, b));
  }, [slotReadyMeals, collator]);

  const readyList = useMemo(() => {
    if (!listReady) return [];
    const q = deferredQuery.toLowerCase().trim();
    return slotReadyMeals
      .filter(m => !tagFilter || (m.tags as string[]).includes(tagFilter))
      .filter(m => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [slotReadyMeals, deferredQuery, tagFilter, listReady, collator]);

  const tagOptions: string[] =
    tab === 'ingredients' ? ingredientTagOptions : tab === 'ready' ? readyTagOptions : [];

  // Out of home: options from the table (seeded from the constant), unlinked from ingredients, shopping list and ready meals
  const [outOfHomeOptions, setOutOfHomeOptions] = useState<readonly string[]>(OUT_OF_HOME_OPTIONS);
  useEffect(() => {
    let active = true;
    listOutOfHomeOptions()
      .then(list => {
        if (active) setOutOfHomeOptions(list);
      })
      .catch(e => console.warn('Opzioni fuori casa non lette, uso quelle predefinite:', e));
    return () => {
      active = false;
    };
  }, []);
  const outOfHomeList = useMemo(() => {
    const q = deferredQuery.toLowerCase().trim();
    return outOfHomeOptions.filter(option => !q || option.toLowerCase().includes(q));
  }, [deferredQuery, outOfHomeOptions]);

  // RecipeSummary with the servings step open: its row expands in place
  const expandedRecipeId = pending?.kind === 'recipe' ? pending.recipe.id : null;

  const rows = useMemo<PickerRow[]>(() => {
    if (!listReady) return [];
    const recipeRows = (): PickerRow[] =>
      visibleRecipes.map(recipe => ({ kind: 'recipe', key: `recipe-${recipe.id}`, recipe }));
    const ingredientRows = (): PickerRow[] =>
      ingredientList.map(ingredient => ({
        kind: 'ingredient',
        key: `ingredient-${ingredient.id}`,
        ingredient,
      }));
    const outRows = (): PickerRow[] =>
      outOfHomeList.map(label => ({ kind: 'out', key: `out-${label}`, label }));
    const readyRows = (): PickerRow[] =>
      readyList.map(meal => ({ kind: 'ready', key: `ready-${meal.id}`, meal }));

    if (tab === 'recipes') return recipeRows();
    if (tab === 'ingredients') return ingredientRows();
    if (tab === 'out') return outRows();
    if (tab === 'ready') return readyRows();
    // All with search: sorted by relevance (query start first, then contains)
    if (deferredQuery.trim()) {
      const allRows = [...recipeRows(), ...ingredientRows(), ...readyRows(), ...outRows()];
      return rankPickerMatches(
        allRows.map(row => ({
          kind: row.kind,
          label: row.kind === 'recipe' ? row.recipe.title
            : row.kind === 'ingredient' ? ingredientDisplayName(row.ingredient, t)
            : row.kind === 'ready' ? row.meal.name
            : row.label,
          id: row.kind === 'recipe' ? row.recipe.id : undefined,
          value: row,
        })),
        deferredQuery,
        favoriteIds,
        collator
      ).map(item => item.value);
    }
    // All: recipes, ingredients, ready meals, out of home
    return [...recipeRows(), ...ingredientRows(), ...readyRows(), ...outRows()];
  }, [tab, deferredQuery, visibleRecipes, ingredientList, readyList, outOfHomeList, favoriteIds, listReady, t, collator]);

  // To prepare: recipe servings. Already ready: planner servings to eat
  const handleStartRecipe = useCallback((recipe: RecipeSummary) => {
    setPending({ kind: 'recipe', recipe });
    setRecipeServings(recipe.servings || eatServings);
    setRecipeSource('prepare');
  }, [eatServings]);

  // Changing the choice resets the value to the default of that choice
  const handleChangeRecipeSource = useCallback((source: RecipeSource) => {
    const recipe = pending?.kind === 'recipe' ? pending.recipe : null;
    setRecipeSource(source);
    setRecipeServings(source === 'prepare' && recipe ? recipe.servings || eatServings : eatServings);
  }, [pending, eatServings]);

  const changeRecipeServings = useCallback((delta: number) => {
    setRecipeServings(current => Math.min(24, Math.max(1, current + delta)));
  }, []);

  const handleSelectOutOfHome = useCallback((label: string) => {
    finishAdd(label);
    onSelectOutOfHome(label);
  }, [finishAdd, onSelectOutOfHome]);

  const handleStartIngredient = useCallback((ingredient: Ingredient) => {
    setPending({ kind: 'ingredient', ingredient });
    setAmountText(ingredient.default_amount != null ? String(ingredient.default_amount) : '');
    // Portion unit (default_unit) for consistency with the quantity; purchase_unit only as a fallback
    setUnitText(toSelectableUnit(ingredient.default_unit) || toSelectableUnit(ingredient.purchase_unit));
  }, []);

  const handleStartReady = useCallback((meal: ReadyMeal) => {
    setPending({ kind: 'ready', meal });
    setCountText('1');
  }, []);

  // Deleting an already planned entry: stable handler, the card receives the id from the child
  const handleDeletePlanned = useCallback((entryId: string) => {
    onDeletePlanned?.(entryId);
  }, [onDeletePlanned]);

  const handleCancelPending = useCallback(() => {
    setPending(null);
  }, []);

  const handleConfirmPending = useCallback(() => {
    if (!pending) return;
    if (pending.kind === 'recipe') {
      const recipe = pending.recipe;
      finishAdd(recipe.title);
      onSelectRecipe(recipe, recipeServings, recipeSource);
      return;
    }
    if (pending.kind === 'ingredient') {
      const parsed = parseFloat(amountText.replace(',', '.'));
      const amount = amountText.trim() === '' || Number.isNaN(parsed) ? null : parsed;
      const unit = unitText.trim();
      const ingredient = pending.ingredient;
      finishAdd(ingredientDisplayName(ingredient, t));
      onSelectIngredient(ingredient, amount, unit);
      return;
    }
    const parsedCount = Math.floor(Number(countText.replace(',', '.')));
    const count = Number.isFinite(parsedCount) && parsedCount >= 1 ? parsedCount : 1;
    const meal = pending.meal;
    finishAdd(meal.name);
    onSelectReadyMeal(meal, count);
  }, [pending, recipeServings, recipeSource, amountText, unitText, countText, finishAdd, onSelectRecipe, onSelectIngredient, onSelectReadyMeal, t]);

  const renderRow = useCallback(({ item: row }: ListRenderItemInfo<PickerRow>) => {
    if (row.kind === 'recipe') {
      const { recipe } = row;
      const expanded = expandedRecipeId === recipe.id;
      // Only the open row receives the step: the others have unchanged props and do not re-render
      return (
        <PickerRecipeRow
          recipe={recipe}
          isFavorite={favoriteIds.has(recipe.id)}
          expanded={expanded}
          step={expanded ? (
            <RecipeServingsStep
              servings={recipeServings}
              onChangeServings={changeRecipeServings}
              source={recipeSource}
              onChangeSource={handleChangeRecipeSource}
              onCancel={handleCancelPending}
              onConfirm={handleConfirmPending}
              confirmLabel={t('mealPicker.add')}
            />
          ) : null}
          onStart={handleStartRecipe}
          onCollapse={handleCancelPending}
        />
      );
    }
    if (row.kind === 'ingredient') return <PickerIngredientRow ingredient={row.ingredient} onStart={handleStartIngredient} />;
    if (row.kind === 'out') return <PickerOutRow label={row.label} onSelect={handleSelectOutOfHome} />;
    return <PickerReadyRow meal={row.meal} onStart={handleStartReady} />;
  }, [t, favoriteIds, expandedRecipeId, recipeServings, recipeSource, handleStartRecipe, handleChangeRecipeSource, handleCancelPending, handleConfirmPending, changeRecipeServings, handleStartIngredient, handleStartReady, handleSelectOutOfHome]);

  const pendingName = pending && pending.kind !== 'recipe'
    ? pending.kind === 'ingredient'
      ? ingredientDisplayName(pending.ingredient, t)
      : pending.meal.name
    : '';

  return (
    <SheetModal visible={visible} onClose={handleClose} fullScreen>
      <SafeAreaView style={styles.pickerSafeArea} edges={['top', 'bottom', 'left', 'right']}>
        <ModalHeader
          title={t('planner.pickerModal.titleWithDate', { slot: t(`planner.slots.${targetSlot}`), day: formatDayAndDate(targetDate, i18n.language) })}
          onClose={handleClose}
          closeLabel={t('common.close')}
        />

        {plannedForSlot.length > 0 && (
          <View style={styles.pickerPlanned}>
            <Text style={styles.pickerPlannedCaption}>{t('mealPicker.plannedHere')}</Text>
            <ScrollView
              showsVerticalScrollIndicator
              nestedScrollEnabled
              style={styles.pickerPlannedScroll}
              contentContainerStyle={styles.pickerPlannedBar}
            >
              {plannedForSlot.map(item => (
                <View key={item.entry.id} style={styles.pickerPlannedCard}>
                  <PlannedItemCard
                    item={item}
                    color={slotAccent}
                    onDelete={handleDeletePlanned}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Tabs: Recipes / Ingredients / Ready / Out of home */}
        <View style={styles.pickerFilterRow}>
          <SegmentedControl
            accessibilityLabel={t('mealPicker.filtersLabel')}
            options={TABS.map(item => ({ key: item, label: t(`mealPicker.${item}`) }))}
            value={tab}
            onChange={key => handleTabChange(key as typeof tab)}
          />
        </View>

        <SearchBar
          size="M"
          style={styles.pickerSearch}
          placeholder={t('mealPicker.search')}
          value={query}
          onChangeText={setQuery}
        />

        {(tab === 'recipes' || tab === 'ready') && (
          <View style={styles.pickerFilterRow}>
            <SegmentedControl
              accessibilityLabel={t('mealPicker.filtersLabel')}
              options={[
                { key: 'slot', label: t(tab === 'recipes' ? 'mealPicker.suggestedRecipesForMeal' : 'mealPicker.suggestedReadyForMeal') },
                { key: 'all', label: t(tab === 'recipes' ? 'mealPicker.allRecipes' : 'mealPicker.allReady') },
              ]}
              value={(tab === 'recipes' ? showAllRecipes : showAllReady) ? 'all' : 'slot'}
              onChange={key => (tab === 'recipes' ? setShowAllRecipes : setShowAllReady)(key === 'all')}
            />
          </View>
        )}

        {tab !== 'recipes' && tagOptions.length > 0 && (
          <View style={styles.pickerTagRow}>
            <SegmentedControl
              accessibilityLabel={t('mealPicker.all')}
              options={([null, ...tagOptions] as TagFilter[]).map(tag => ({ key: tag ?? 'all', label: tag === null ? t('mealPicker.all') : formatTagLabel(tag, t) }))}
              value={tagFilter ?? 'all'}
              onChange={key => setTagFilter(key === 'all' ? null : (key as TagFilter))}
            />
          </View>
        )}

        {pending && pending.kind !== 'recipe' && (
          <Card padding="xl" style={styles.pickerStep}>
            <Text style={styles.pickerStepTitle} numberOfLines={2}>{pendingName}</Text>
            <View style={styles.pickerStepInputs}>
              {pending.kind === 'ingredient' ? (
                <>
                  <AppTextField
                    style={styles.pickerStepInputAmount}
                    size="M"
                    value={amountText}
                    onChangeText={setAmountText}
                    keyboardType="decimal-pad"
                    placeholder={t('mealPicker.count')}
                  />
                  <View style={styles.pickerStepInputUnit}>
                    <Select
                      key={pending.ingredient.id}
                      value={unitText}
                      options={['', ...SHOPPING_UNITS].map(unit => ({ value: unit, label: unitLabel(unit, t) || t('shopping.unitNone') }))}
                      onChange={setUnitText}
                      accessibilityLabel={t('shopping.quantityUnit')}
                      size="M"
                    />
                  </View>
                </>
              ) : (
                <AppTextField
                  style={styles.pickerStepInputAmount}
                  size="M"
                  value={countText}
                  onChangeText={setCountText}
                  keyboardType="number-pad"
                  placeholder={t('mealPicker.count')}
                />
              )}
            </View>
            <View style={styles.pickerStepButtons}>
              <Button size="M" variant="secondary" label={t('mealPicker.cancel')} onPress={handleCancelPending} />
              <Button size="M" variant="primary" label={t('mealPicker.add')} onPress={handleConfirmPending} />
            </View>
          </Card>
        )}

        {listReady ? (
          <FlatList
            data={rows}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ padding: space.xxxl }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={5}
            removeClippedSubviews
            ListEmptyComponent={
              <Text style={styles.pickerEmpty}>{t('mealPicker.empty')}</Text>
            }
            renderItem={renderRow}
          />
        ) : (
          <View style={styles.pickerLoading}>
            <Spinner size="large" />
            <Text style={styles.pickerLoadingText}>{t('mealPicker.loading')}</Text>
          </View>
        )}

        {/* Notice after an addition: does not close by itself, choose one of the two actions */}
        <SheetModal visible={added !== null} onClose={() => setAdded(null)}>
            <View style={styles.alertCard}>
              <Ionicons name="checkmark-circle" size={display.sm} color={colors.primary} style={styles.alertIcon} />
              <Text style={styles.alertMessage}>{t('mealPicker.added', { name: alertName })}</Text>

              <Text style={styles.alertSummary}>{t('mealPicker.alertSummary')}</Text>
              {plannedForSlot.length > 0 && (
                <ScrollView style={styles.alertList} showsVerticalScrollIndicator={false}>
                  {plannedForSlot.map(item => (
                    <Text key={item.entry.id} style={styles.alertListItem} numberOfLines={1}>
                      {plannedItemLabel(item, t) ?? t('simpleItems.missing')}
                    </Text>
                  ))}
                </ScrollView>
              )}

              <View style={styles.alertButtons}>
                <Button size="M" variant="primary" label={t('mealPicker.mealComplete')} onPress={handleClose} />
                <Button size="M" variant="secondary" label={t('mealPicker.addMore')} onPress={() => setAdded(null)} />
              </View>
            </View>
        </SheetModal>
      </SafeAreaView>
    </SheetModal>
  );
};

export default MealPickerModal;

const makeStyles = (colors: Palette) => StyleSheet.create({
  pickerSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Rows with a SegmentedControl: it scrolls horizontally, tabs do not wrap
  pickerFilterRow: {
    paddingHorizontal: space.xxxl,
    paddingTop: space.lg,
    paddingBottom: 2,
  },
  pickerPlanned: {
    paddingTop: space.lg,
  },
  pickerPlannedCaption: {
    fontSize: text.label,
    fontWeight: '600',
    color: colors.textMuted,
    paddingHorizontal: space.xxxl,
    marginBottom: space.sm,
  },
  // A single horizontally scrollable row of tabs, height given by the content
  // Full-width vertical list, with max height and vertical scrolling
  pickerPlannedScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 260,
  },
  pickerPlannedBar: {
    paddingHorizontal: space.xxxl,
    gap: space.md,
  },
  pickerPlannedCard: {
    width: '100%',
  },
  alertCard: { padding: space.huge, gap: space.md },
  alertIcon: {
    alignSelf: 'center',
  },
  alertMessage: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  alertSummary: {
    fontSize: text.caption,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: space.md,
  },
  alertList: {
    flexGrow: 0,
    maxHeight: 240,
  },
  alertListItem: {
    fontSize: text.body,
    color: colors.text,
    paddingVertical: space.xs,
  },
  alertButtons: {
    gap: space.md,
    marginTop: space.xl,
  },
  pickerSearch: {
    marginTop: space.lg,
    marginHorizontal: space.xxxl,
    marginVertical: space.xl,
  },
  pickerTagRow: {
    paddingHorizontal: space.xxxl,
    paddingVertical: space.md,
  },
  pickerStep: {
    marginHorizontal: space.xxxl,
    marginBottom: space.md,
    borderColor: colors.borderStrong,
    gap: space.lg,
  },
  pickerStepTitle: {
    fontSize: text.body,
    fontWeight: '700',
    color: colors.text,
  },
  pickerStepInputs: {
    flexDirection: 'row',
    gap: space.md,
  },
  pickerStepInputAmount: {
    flex: 1,
  },
  pickerStepInputUnit: {
    flex: 1,
  },
  pickerStepButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.md,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: cardRadius,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.xl,
  },
  pickerItemExpanded: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
  },
  pickerItemCat: {
    fontSize: text.label,
    fontWeight: '700',
    color: colors.primaryText,
    textTransform: 'uppercase',
  },
  pickerItemTitle: {
    fontSize: text.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  pickerItemMeta: {
    fontSize: text.label,
    color: colors.textMuted,
    marginTop: 2,
  },
  recipeThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
  },
  recipeThumbPlaceholder: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  recipeMetaDivider: {
    fontSize: text.label,
    color: colors.textMuted,
    marginHorizontal: space.xs,
  },
  pickerEmpty: {
    fontSize: text.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
  pickerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
  },
  pickerLoadingText: {
    fontSize: text.body,
    color: colors.textMuted,
  },
});
