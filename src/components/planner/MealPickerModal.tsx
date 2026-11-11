import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  FlatList,
  ScrollView,
  TouchableOpacity,
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
import { OUT_OF_HOME_OPTIONS } from '../../constants/outOfHome';
import { isRecipeForSlot } from '../../utils/recipeSlots';
import { orderWithFavoritesFirst, rankPickerMatches } from '../../utils/pickerRanking';
import { SHOPPING_UNITS, toSelectableUnit } from '../../constants/shoppingUnits';

export interface MealPickerModalProps {
  visible: boolean;
  targetSlot: string;
  // Pasti già pianificati nello slot (giorno selezionato), solo a scopo di riferimento
  plannedForSlot: { id: string; label: string }[];
  allRecipes: Recipe[];
  // Id delle ricette preferite: mostrate con il cuore e messe prima nei risultati di ricerca
  favoriteIds?: ReadonlySet<string>;
  ingredients: Ingredient[];
  readyMeals: ReadyMeal[];
  onSelectRecipe: (recipe: Recipe) => void;
  onSelectIngredient: (ingredient: Ingredient, amount: number | null, unit: string) => void;
  onSelectReadyMeal: (meal: ReadyMeal, count: number) => void;
  onSelectOutOfHome: (label: string) => void;
  onClose: () => void;
}

// Insieme vuoto stabile: un default nuovo a ogni render invaliderebbe le liste memorizzate
const EMPTY_FAVORITE_IDS: ReadonlySet<string> = new Set<string>();

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

/**
 * Modal unico per aggiungere un pasto a uno slot del planner:
 * ricette, ingredienti crudi (con quantità), prodotti pronti (con numero di porzioni) e pasti fuori casa.
 */
const MealPickerModal: React.FC<MealPickerModalProps> = ({
  visible,
  targetSlot,
  plannedForSlot,
  allRecipes,
  favoriteIds = EMPTY_FAVORITE_IDS,
  ingredients,
  readyMeals,
  onSelectRecipe,
  onSelectIngredient,
  onSelectReadyMeal,
  onSelectOutOfHome,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<MealTab>('all');
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<TagFilter>(null);
  // Scheda Ricette: di default solo quelle compatibili con lo slot, "Tutte" le mostra tutte
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [pending, setPending] = useState<PendingItem | null>(null);
  const [amountText, setAmountText] = useState('');
  const [unitText, setUnitText] = useState('');
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [countText, setCountText] = useState('1');
  // Ultimo pasto aggiunto: la modale resta aperta per aggiungere altro allo stesso slot
  const [added, setAdded] = useState<string | null>(null);
  // Reset alla cambio di slot (la modale resta montata e cambia solo targetSlot)
  const [prevTargetSlot, setPrevTargetSlot] = useState(targetSlot);
  if (prevTargetSlot !== targetSlot) {
    setPrevTargetSlot(targetSlot);
    setShowAllRecipes(false);
  }

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
  const finishAdd = (name: string) => {
    setPending(null);
    setAmountText('');
    setUnitText('');
    setCountText('1');
    setAdded(name);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleTabChange = (next: MealTab) => {
    setTab(next);
    setTagFilter(null);
    setPending(null);
  };

  // Ricette: senza duplicati, per lo slot (se attivo il filtro).
  // Query vuota: preferite prima, poi le altre (alfabetico); con ricerca: preferite prima tra i match
  const recipeList = useMemo(() => {
    const seen = new Set<string>();
    const unique = allRecipes.filter(r => {
      if (!r || !r.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    const slotFiltered =
      tab === 'recipes' && !showAllRecipes
        ? unique.filter(r => isRecipeForSlot(r, targetSlot))
        : unique;
    const q = query.toLowerCase().trim();
    const matched = slotFiltered.filter(r => !q || r.title.toLowerCase().includes(q));
    if (!q) return orderWithFavoritesFirst(matched, favoriteIds);
    return matched.sort((a, b) => {
      const favA = favoriteIds.has(a.id);
      const favB = favoriteIds.has(b.id);
      if (favA !== favB) return favA ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [allRecipes, query, tab, showAllRecipes, targetSlot, favoriteIds]);

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
    const q = query.toLowerCase().trim();
    return edibleIngredients
      .filter(i => (!tagFilter || i.tags.some(tag => tag === tagFilter)))
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [edibleIngredients, query, tagFilter]);

  // Pronti: solo quelli previsti per questo slot
  const slotReadyMeals = useMemo(
    () => readyMeals.filter(m => m.slots.includes(targetSlot)),
    [readyMeals, targetSlot]
  );

  const readyTagOptions = useMemo(() => {
    const set = new Set<string>();
    slotReadyMeals.forEach(m => (m.tags as string[]).forEach(tag => set.add(tag)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [slotReadyMeals]);

  const readyList = useMemo(() => {
    const q = query.toLowerCase().trim();
    return slotReadyMeals
      .filter(m => !tagFilter || (m.tags as string[]).includes(tagFilter))
      .filter(m => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [slotReadyMeals, query, tagFilter]);

  const tagOptions: string[] =
    tab === 'ingredients' ? ingredientTagOptions : tab === 'ready' ? readyTagOptions : [];

  // Fuori casa: opzioni fisse, scollegate da ingredienti, lista della spesa e pronti
  const outOfHomeList = useMemo(() => {
    const q = query.toLowerCase().trim();
    return OUT_OF_HOME_OPTIONS.filter(option => !q || option.toLowerCase().includes(q));
  }, [query]);

  const rows = useMemo<PickerRow[]>(() => {
    const recipeRows = (): PickerRow[] =>
      recipeList.map(recipe => ({ kind: 'recipe', key: `recipe-${recipe.id}`, recipe }));
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
    if (query.trim()) {
      const allRows = [...recipeRows(), ...ingredientRows(), ...readyRows(), ...outRows()];
      return rankPickerMatches(
        allRows.map(row => ({
          kind: row.kind,
          label: row.kind === 'recipe' ? row.recipe.title
            : row.kind === 'ingredient' ? row.ingredient.name
            : row.kind === 'ready' ? row.meal.name
            : row.label,
          id: row.kind === 'recipe' ? row.recipe.id : undefined,
          value: row,
        })),
        query,
        favoriteIds
      ).map(item => item.value);
    }
    // Tutti: ricette, ingredienti, pronti, fuori casa
    return [...recipeRows(), ...ingredientRows(), ...readyRows(), ...outRows()];
  }, [tab, query, recipeList, ingredientList, readyList, outOfHomeList, favoriteIds]);

  const handleSelectRecipe = (recipe: Recipe) => {
    finishAdd(recipe.title);
    onSelectRecipe(recipe);
  };

  const handleSelectOutOfHome = (label: string) => {
    finishAdd(label);
    onSelectOutOfHome(label);
  };

  const handleStartIngredient = (ingredient: Ingredient) => {
    setPending({ kind: 'ingredient', ingredient });
    setAmountText(ingredient.default_amount != null ? String(ingredient.default_amount) : '');
    // Unità della porzione (default_unit) per coerenza con la quantità; purchase_unit solo come ripiego
    setUnitText(toSelectableUnit(ingredient.default_unit) || toSelectableUnit(ingredient.purchase_unit));
    setUnitMenuOpen(false);
  };

  const handleStartReady = (meal: ReadyMeal) => {
    setPending({ kind: 'ready', meal });
    setCountText('1');
  };

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
      finishAdd(ingredient.name);
      onSelectIngredient(ingredient, amount, unit);
      return;
    }
    const parsedCount = Math.floor(Number(countText.replace(',', '.')));
    const count = Number.isFinite(parsedCount) && parsedCount >= 1 ? parsedCount : 1;
    const meal = pending.meal;
    finishAdd(meal.name);
    onSelectReadyMeal(meal, count);
  };

  const renderRow = (row: PickerRow) => {
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
            <Image source={{ uri: recipe.image }} style={styles.recipeThumb} contentFit="cover" cachePolicy="disk" />
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
            <Text style={styles.pickerItemTitle} numberOfLines={2}>{ingredient.name}</Text>
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
  };

  const pendingName = pending
    ? pending.kind === 'ingredient'
      ? pending.ingredient.name
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
            {t('planner.pickerModal.planForSlot', { slot: t(`planner.slots.${targetSlot}`) })}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {plannedForSlot.length > 0 && (
          <View style={styles.pickerPlanned}>
            <Text style={styles.pickerPlannedCaption}>{t('mealPicker.plannedHere')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pickerPlannedScroll}
              contentContainerStyle={styles.pickerPlannedBar}
            >
              {plannedForSlot.map(item => (
                <View key={item.id} style={styles.pickerPlannedChip}>
                  <Text style={styles.pickerPlannedChipText} numberOfLines={1}>{item.label}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {added !== null && (
          <View style={styles.pickerAdded}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primaryText} />
            <Text style={styles.pickerAddedText} numberOfLines={2}>
              {t('mealPicker.added', { name: added })}
            </Text>
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

        {tab === 'recipes' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pickerFilterScroll}
            contentContainerStyle={styles.pickerFilterBar}
            keyboardShouldPersistTaps="handled"
          >
            {([false, true] as const).map(all => {
              const active = showAllRecipes === all;
              return (
                <TouchableOpacity
                  key={all ? 'all' : 'slot'}
                  style={[styles.pickerFilterChip, active && styles.pickerFilterChipActive]}
                  onPress={() => setShowAllRecipes(all)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerFilterChipText, active && styles.pickerFilterChipTextActive]}>
                    {all ? t('mealPicker.allRecipes') : t('mealPicker.suggestedForMeal')}
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

        <FlatList
          data={rows}
          keyExtractor={row => row.key}
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          windowSize={5}
          ListEmptyComponent={
            <Text style={styles.pickerEmpty}>{t('mealPicker.empty')}</Text>
          }
          renderItem={({ item }) => renderRow(item)}
        />
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
  pickerAdded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
  },
  pickerAddedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryText,
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
  // Altezza fissa, una sola riga di chip senza a capo
  pickerPlannedScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 40,
  },
  pickerPlannedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  pickerPlannedChip: {
    maxWidth: 220,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerPlannedChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
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
});
