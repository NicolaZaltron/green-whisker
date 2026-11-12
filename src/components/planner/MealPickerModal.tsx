import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  Modal,
  FlatList,
  ScrollView,
  TouchableOpacity,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { Recipe } from '../../types/recipe';
import { INGREDIENT_TAGS, type Ingredient, type ReadyMeal } from '../../types/catalog';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { AppTextField } from '../../components/ui/AppTextField';
import { formatTagLabel, unitLabel } from '../../constants/simpleTags';
import { formatDayAndDate } from '../../utils/dates';
import { OUT_OF_HOME_OPTIONS } from '../../constants/outOfHome';
import { isRecipeForSlot } from '../../utils/recipeSlots';
import { rankPickerMatches } from '../../utils/pickerRanking';
import { SHOPPING_UNITS, toSelectableUnit } from '../../constants/shoppingUnits';
import { getSortedPickerRecipes, uniquePickerRecipes } from '../../services/pickerRecipes';
import { SLOT_COLORS, type MealSlot } from '../../services/plannerService';
import { PlannedItemCard, plannedItemLabel, type DayMealItem } from './PlannedItemCards';
import { ingredientDisplayName } from '../../utils/ingredientNames';

export interface MealPickerModalProps {
  visible: boolean;
  targetSlot: string;
  targetDate: string;
  // Pasti già pianificati nello slot (giorno selezionato), mostrati come schede di sola lettura
  plannedForSlot: DayMealItem[];
  allRecipes: Recipe[];
  // Id delle ricette preferite: mostrate con il cuore e messe prima nei risultati di ricerca
  favoriteIds?: ReadonlySet<string>;
  ingredients: Ingredient[];
  readyMeals: ReadyMeal[];
  onSelectRecipe: (recipe: Recipe) => void;
  onSelectIngredient: (ingredient: Ingredient, amount: number | null, unit: string) => void;
  onSelectReadyMeal: (meal: ReadyMeal, count: number) => void;
  onSelectOutOfHome: (label: string) => void;
  onDeletePlanned?: (entryId: string) => void;
  onClose: () => void;
}

// Insieme vuoto stabile: un default nuovo a ogni render invaliderebbe le liste memorizzate
const EMPTY_FAVORITE_IDS: ReadonlySet<string> = new Set<string>();

// Schede pianificate in sola lettura nel picker: niente swap né eliminazione da qui

type MealTab = 'all' | 'recipes' | 'ingredients' | 'ready' | 'out';
const TABS: MealTab[] = ['all', 'ingredients', 'recipes', 'ready', 'out'];

// null = Tutti (nessun filtro per tag)
type TagFilter = string | null;

type PendingItem =
  | { kind: 'ingredient'; ingredient: Ingredient }
  | { kind: 'ready'; meal: ReadyMeal };

type PickerRow =
  | { kind: 'recipe'; key: string; recipe: Recipe }
  | { kind: 'ingredient'; key: string; ingredient: Ingredient }
  | { kind: 'ready'; key: string; meal: ReadyMeal }
  | { kind: 'out'; key: string; label: string };

// Funzione stabile per FlatList: una nuova a ogni render farebbe ricalcolare le chiavi
const keyExtractor = (row: PickerRow) => row.key;

/**
 * Modal unico per aggiungere un pasto a uno slot del planner:
 * ricette, ingredienti crudi (con quantità), prodotti pronti (con numero di porzioni) e pasti fuori casa.
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
  onSelectRecipe,
  onSelectIngredient,
  onSelectReadyMeal,
  onSelectOutOfHome,
  onDeletePlanned,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  // Collator della lingua dell'app: ordinamenti alfabetici coerenti con quella mostrata, creato una volta per lingua
  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base' }), [i18n.language]);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Colore dello slot, come nelle schede del planner
  const slotColors = SLOT_COLORS[targetSlot as MealSlot];
  const slotAccent = slotColors ? (isDark ? slotColors.darkColor : slotColors.color) : colors.primaryText;

  const [tab, setTab] = useState<MealTab>('all');
  const [query, setQuery] = useState('');
  // Il campo di testo usa query (immediata); le liste usano deferredQuery, così la digitazione non aspetta il filtro
  const deferredQuery = useDeferredValue(query);
  const [tagFilter, setTagFilter] = useState<TagFilter>(null);
  // Scheda Ricette: di default solo quelle compatibili con lo slot, "Tutte" le mostra tutte
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  // Scheda Pronti: stesso comportamento; di default solo quelli previsti per lo slot
  const [showAllReady, setShowAllReady] = useState(false);
  const [pending, setPending] = useState<PendingItem | null>(null);
  const [amountText, setAmountText] = useState('');
  const [unitText, setUnitText] = useState('');
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [countText, setCountText] = useState('1');
  // Ultimo pasto aggiunto: la modale resta aperta per aggiungere altro allo stesso slot
  const [added, setAdded] = useState<string | null>(null);
  // Nome dell'ultima aggiunta mostrato nell'avviso: resta valorizzato durante la dissolvenza di chiusura
  const [alertName, setAlertName] = useState('');
  if (added !== null && added !== alertName) setAlertName(added);
  // Reset alla cambio di slot (la modale resta montata e cambia solo targetSlot)
  const [prevTargetSlot, setPrevTargetSlot] = useState(targetSlot);
  if (prevTargetSlot !== targetSlot) {
    setPrevTargetSlot(targetSlot);
    setShowAllRecipes(false);
  }

  // Righe della lista calcolate solo a modale aperta e dopo il primo frame: così l'apertura è immediata
  // e lo spinner resta visibile mentre si prepara la lista. Resta true tra un'apertura e l'altra
  // finché la sorgente dati (ricette, preferiti, ingredienti, pronti) non cambia.
  const [listReady, setListReady] = useState(false);
  const preparedSourceRef = useRef<{
    allRecipes: Recipe[];
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
    setUnitMenuOpen(false);
    setCountText('1');
    setAdded(null);
  }, []);

  // Dopo un'aggiunta si chiudono solo i passi in corso: scheda, ricerca e filtri restano
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

  // Ricette: senza duplicati, ordinate (preferite prima) e filtrate per ricerca.
  // Non dipende da tab/slot: il calcolo più costoso non si ripete a ogni cambio di scheda
  // Query vuota: preferite prima, poi le altre (alfabetico), memorizzate in getSortedPickerRecipes;
  // con ricerca: preferite prima tra i match
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

  // Solo il filtro per slot (scheda Ricette, "Suggerite"); il filtro preserva l'ordine di sortedRecipes
  const visibleRecipes = useMemo(
    () =>
      tab === 'recipes' && !showAllRecipes
        ? sortedRecipes.filter(r => isRecipeForSlot(r, targetSlot))
        : sortedRecipes,
    [sortedRecipes, targetSlot, showAllRecipes, tab]
  );

  // Ingredienti: solo quelli mangiabili così come sono
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

  // Pronti: di default solo quelli previsti per questo slot, "Tutti" li mostra tutti
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

  // Fuori casa: opzioni fisse, scollegate da ingredienti, lista della spesa e pronti
  const outOfHomeList = useMemo(() => {
    const q = deferredQuery.toLowerCase().trim();
    return OUT_OF_HOME_OPTIONS.filter(option => !q || option.toLowerCase().includes(q));
  }, [deferredQuery]);

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
    // Tutti con ricerca: ordinamento per pertinenza (inizio query prima, poi contenuti)
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
    // Tutti: ricette, ingredienti, pronti, fuori casa
    return [...recipeRows(), ...ingredientRows(), ...readyRows(), ...outRows()];
  }, [tab, deferredQuery, visibleRecipes, ingredientList, readyList, outOfHomeList, favoriteIds, listReady, t, collator]);

  const handleSelectRecipe = useCallback((recipe: Recipe) => {
    finishAdd(recipe.title);
    onSelectRecipe(recipe);
  }, [finishAdd, onSelectRecipe]);

  const handleSelectOutOfHome = useCallback((label: string) => {
    finishAdd(label);
    onSelectOutOfHome(label);
  }, [finishAdd, onSelectOutOfHome]);

  const handleStartIngredient = useCallback((ingredient: Ingredient) => {
    setPending({ kind: 'ingredient', ingredient });
    setAmountText(ingredient.default_amount != null ? String(ingredient.default_amount) : '');
    // Unità della porzione (default_unit) per coerenza con la quantità; purchase_unit solo come ripiego
    setUnitText(toSelectableUnit(ingredient.default_unit) || toSelectableUnit(ingredient.purchase_unit));
    setUnitMenuOpen(false);
  }, []);

  const handleStartReady = useCallback((meal: ReadyMeal) => {
    setPending({ kind: 'ready', meal });
    setCountText('1');
  }, []);

  // Eliminazione di una voce già pianificata: handler stabile, la scheda riceve l'id dal figlio
  const handleDeletePlanned = useCallback((entryId: string) => {
    onDeletePlanned?.(entryId);
  }, [onDeletePlanned]);

  const handleCancelPending = () => {
    setPending(null);
  };

  const handleConfirmPending = () => {
    if (!pending) return;
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
  };

  const renderRow = useCallback(({ item: row }: ListRenderItemInfo<PickerRow>) => {
    if (row.kind === 'recipe') {
      const { recipe } = row;
      const minutes = recipe.times?.total_minutes ?? 0;
      const servings = recipe.servings ?? 0;
      const isFavorite = favoriteIds.has(recipe.id);
      return (
        <TouchableOpacity
          style={styles.pickerItem}
          onPress={() => handleSelectRecipe(recipe)}
          activeOpacity={0.7}
        >
          {recipe.image ? (
            <Image
              source={{ uri: recipe.image }}
              style={[styles.recipeThumb, { backgroundColor: colors.surfaceMuted }]}
              contentFit="cover"
              cachePolicy="disk"
              recyclingKey={recipe.id}
              transition={0}
            />
          ) : (
            <View style={[styles.recipeThumb, styles.recipeThumbPlaceholder]}>
              <Ionicons name="restaurant-outline" size={20} color={colors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.pickerItemTitle, { flexShrink: 1 }]} numberOfLines={2}>{recipe.title}</Text>
            {(minutes > 0 || servings > 0 || isFavorite) && (
              <View style={styles.recipeMeta}>
                {minutes > 0 && (
                  <>
                    <Ionicons name="time-outline" size={12} color={colors.textMuted} style={{ marginRight: 3 }} />
                    <Text style={styles.pickerItemMeta}>{t('common.minutes', { count: minutes })}</Text>
                  </>
                )}
                {minutes > 0 && servings > 0 && (
                  <Text style={styles.recipeMetaDivider}>·</Text>
                )}
                {servings > 0 && (
                  <>
                    <Ionicons name="people-outline" size={12} color={colors.textMuted} style={{ marginRight: 3 }} />
                    <Text style={styles.pickerItemMeta}>{t('common.servings', { count: servings })}</Text>
                  </>
                )}
                {isFavorite && (
                  <Ionicons name="heart" size={14} color={colors.primary} style={{ marginLeft: 6 }} />
                )}
              </View>
            )}
          </View>
          <Ionicons name="add-circle" size={24} color={colors.primaryText} />
        </TouchableOpacity>
      );
    }
    if (row.kind === 'ingredient') {
      const { ingredient } = row;
      const quantity = ingredient.default_amount != null
        ? `${ingredient.default_amount} ${unitLabel(ingredient.default_unit, t, ingredient.default_amount ?? 1)}`.trim()
        : '';
      return (
        <TouchableOpacity
          style={styles.pickerItem}
          onPress={() => handleStartIngredient(ingredient)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerItemTitle} numberOfLines={2}>{ingredientDisplayName(ingredient, t)}</Text>
            <Text style={styles.pickerItemMeta} numberOfLines={1}>
              {t(`mealPicker.type.${ingredient.type}`)}
              {quantity ? ` • ${quantity}` : ''}
            </Text>
          </View>
          <Ionicons name="add-circle" size={24} color={colors.primaryText} />
        </TouchableOpacity>
      );
    }
    if (row.kind === 'out') {
      return (
        <TouchableOpacity
          style={styles.pickerItem}
          onPress={() => handleSelectOutOfHome(row.label)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerItemTitle} numberOfLines={2}>{row.label}</Text>
          </View>
          <Ionicons name="add-circle" size={24} color={colors.primaryText} />
        </TouchableOpacity>
      );
    }
    const { meal } = row;
    return (
      <TouchableOpacity
        style={styles.pickerItem}
        onPress={() => handleStartReady(meal)}
        activeOpacity={0.7}
      >
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
        <Ionicons name="add-circle" size={24} color={colors.primaryText} />
      </TouchableOpacity>
    );
  }, [styles, colors, t, favoriteIds, handleSelectRecipe, handleStartIngredient, handleStartReady, handleSelectOutOfHome]);

  const pendingName = pending
    ? pending.kind === 'ingredient'
      ? ingredientDisplayName(pending.ingredient, t)
      : pending.meal.name
    : '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      onDismiss={resetAll}
    >
      <SafeAreaView style={styles.pickerSafeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity style={styles.pickerCloseBtn} onPress={handleClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.pickerHeaderTitle}>
            {t('planner.pickerModal.titleWithDate', { slot: t(`planner.slots.${targetSlot}`), day: formatDayAndDate(targetDate, i18n.language) })}
          </Text>
          <View style={{ width: 36 }} />
        </View>

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

        {/* Schede: Ricette / Ingredienti / Pronti / Fuori casa */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pickerFilterScroll}
          contentContainerStyle={styles.pickerFilterBar}
          keyboardShouldPersistTaps="handled"
        >
          {TABS.map(item => {
            const active = tab === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.pickerFilterChip, active && styles.pickerFilterChipActive]}
                onPress={() => handleTabChange(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerFilterChipText, active && styles.pickerFilterChipTextActive]}>
                  {t(`mealPicker.${item}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <AppTextField
          style={styles.pickerSearch}
          leftIcon={<Ionicons name="search" size={18} color={colors.textMuted} />}
          placeholder={t('mealPicker.search')}
          value={query}
          onChangeText={setQuery}
        />

        {(tab === 'recipes' || tab === 'ready') && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pickerFilterScroll}
            contentContainerStyle={styles.pickerFilterBar}
            keyboardShouldPersistTaps="handled"
          >
            {([false, true] as const).map(all => {
              const showAll = tab === 'recipes' ? showAllRecipes : showAllReady;
              const active = showAll === all;
              return (
                <TouchableOpacity
                  key={all ? 'all' : 'slot'}
                  style={[styles.pickerFilterChip, active && styles.pickerFilterChipActive]}
                  onPress={() => (tab === 'recipes' ? setShowAllRecipes : setShowAllReady)(all)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerFilterChipText, active && styles.pickerFilterChipTextActive]}>
                    {all ? t(tab === 'recipes' ? 'mealPicker.allRecipes' : 'mealPicker.allReady') : t(tab === 'recipes' ? 'mealPicker.suggestedRecipesForMeal' : 'mealPicker.suggestedReadyForMeal')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {tab !== 'recipes' && tagOptions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pickerTagScroll}
            contentContainerStyle={styles.pickerTagBar}
            keyboardShouldPersistTaps="handled"
          >
            {([null, ...tagOptions] as TagFilter[]).map(tag => {
              const active = tagFilter === tag;
              return (
                <TouchableOpacity
                  key={tag ?? 'all'}
                  style={[styles.pickerFilterChip, active && styles.pickerFilterChipActive]}
                  onPress={() => setTagFilter(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerFilterChipText, active && styles.pickerFilterChipTextActive]}>
                    {tag === null ? t('mealPicker.all') : formatTagLabel(tag, t)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {pending && (
          <View style={styles.pickerStep}>
            <Text style={styles.pickerStepTitle} numberOfLines={2}>{pendingName}</Text>
            <View style={styles.pickerStepInputs}>
              {pending.kind === 'ingredient' ? (
                <>
                  <AppTextField
                    style={styles.pickerStepInputAmount}
                    value={amountText}
                    onChangeText={setAmountText}
                    keyboardType="decimal-pad"
                    placeholder={t('mealPicker.count')}
                  />
                  <TouchableOpacity
                    style={[styles.pickerStepInput, styles.pickerStepInputUnit, styles.qtyUnitSelect]}
                    onPress={() => setUnitMenuOpen(open => !open)}
                    activeOpacity={0.7}
                    accessibilityLabel={t('shopping.quantityUnit')}
                  >
                    <Text style={styles.qtyUnitText} numberOfLines={1}>
                      {unitLabel(unitText, t, parseFloat(amountText.replace(',', '.')) || 1) || t('shopping.unitNone')}
                    </Text>
                    <Ionicons name={unitMenuOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : (
                <AppTextField
                  style={styles.pickerStepInputAmount}
                  value={countText}
                  onChangeText={setCountText}
                  keyboardType="number-pad"
                  placeholder={t('mealPicker.count')}
                />
              )}
            </View>
            {pending.kind === 'ingredient' && unitMenuOpen && (
              <ScrollView style={styles.unitMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {['', ...SHOPPING_UNITS].map(unit => {
                  const active = unitText === unit;
                  return (
                    <TouchableOpacity
                      key={unit || 'none'}
                      style={[styles.unitOption, active && styles.unitOptionActive]}
                      onPress={() => {
                        setUnitText(unit);
                        setUnitMenuOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.unitOptionText, active && styles.unitOptionTextActive]}>
                        {unitLabel(unit, t) || t('shopping.unitNone')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <View style={styles.pickerStepButtons}>
              <TouchableOpacity
                style={[styles.pickerStepButton, styles.pickerStepButtonSecondary]}
                onPress={handleCancelPending}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerStepButtonSecondaryText}>{t('mealPicker.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerStepButton, styles.pickerStepButtonPrimary]}
                onPress={handleConfirmPending}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerStepButtonPrimaryText}>{t('mealPicker.add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {listReady ? (
          <FlatList
            data={rows}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ padding: 16 }}
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
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.pickerLoadingText}>{t('mealPicker.loading')}</Text>
          </View>
        )}

        {/* Avviso dopo un'aggiunta: non si chiude da solo, scegliere una delle due azioni */}
        <Modal
          visible={added !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setAdded(null)}
        >
          <View style={styles.alertBackdrop}>
            <View style={styles.alertCard}>
              <Ionicons name="checkmark-circle" size={32} color={colors.primary} style={styles.alertIcon} />
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
                <TouchableOpacity
                  style={[styles.alertButton, styles.pickerStepButtonPrimary]}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerStepButtonPrimaryText}>{t('mealPicker.mealComplete')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.alertButton, styles.pickerStepButtonSecondary]}
                  onPress={() => setAdded(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerStepButtonSecondaryText}>{t('mealPicker.addMore')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
};

export default MealPickerModal;

const makeStyles = (colors: Palette) => StyleSheet.create({
  pickerSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pickerHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  // Una sola riga scorrevole orizzontalmente: le schede non vanno a capo
  pickerFilterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 50,
  },
  pickerFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    gap: 8,
  },
  pickerFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pickerFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pickerFilterChipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  pickerPlanned: {
    paddingTop: 10,
  },
  pickerPlannedCaption: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  // Una sola riga di schede scorrevole orizzontalmente, altezza data dal contenuto
  // Lista verticale a tutta larghezza, con altezza massima e scorrimento verticale
  pickerPlannedScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 260,
  },
  pickerPlannedBar: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pickerPlannedCard: {
    width: '100%',
  },
  alertBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  alertCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  alertIcon: {
    alignSelf: 'center',
  },
  alertMessage: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  alertSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 8,
  },
  alertList: {
    flexGrow: 0,
    maxHeight: 240,
  },
  alertListItem: {
    fontSize: 14,
    color: colors.text,
    paddingVertical: 4,
  },
  alertButtons: {
    gap: 8,
    marginTop: 12,
  },
  alertButton: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSearch: {
    marginTop: 10,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  // Altezza minima per i chip dei tag: senza, la riga si schiaccia e il testo viene tagliato
  pickerTagScroll: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 52,
  },
  pickerTagBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  pickerStep: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: 10,
  },
  pickerStepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  pickerStepInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerStepInput: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
  },
  pickerStepInputAmount: {
    flex: 1,
  },
  pickerStepInputUnit: {
    flex: 1,
    height: 44,
  },
  qtyUnitSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  qtyUnitText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  unitMenu: { maxHeight: 240, marginTop: 0, marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  unitOption: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  unitOptionActive: { backgroundColor: colors.primarySoft },
  unitOptionText: { fontSize: 14, color: colors.text },
  unitOptionTextActive: { fontWeight: '700', color: colors.primaryText },
  pickerStepButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  pickerStepButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerStepButtonSecondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerStepButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pickerStepButtonPrimary: {
    backgroundColor: colors.primary,
  },
  pickerStepButtonPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  pickerItemCat: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryText,
    textTransform: 'uppercase',
  },
  pickerItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  pickerItemMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  recipeThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
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
    fontSize: 11,
    color: colors.textMuted,
    marginHorizontal: 4,
  },
  pickerEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
  pickerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pickerLoadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
