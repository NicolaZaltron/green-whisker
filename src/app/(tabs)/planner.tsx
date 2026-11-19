import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toLocalDateString } from '../../utils/dates';
import { scheduleIdle } from '../../utils/idle';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { TabScrollView } from '../../components/TabScrollViews';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { CircleButton } from '../../components/ui/CircleButton';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Spinner } from '../../components/ui/Spinner';
import { Toast } from '../../components/ui/Toast';
import { cardRadius, radius, size as sizes, space, text, icon as iconSize } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { RecipeSummary, MealPlanEntry, RecipeSource } from '../../types/recipe';
import type { Ingredient, ReadyMeal } from '../../types/catalog';
import {
  getMealPlans,
  saveMealPlanEntryDetailed,
  updateMealPlanEntryDetailed,
  deleteMealPlanEntry,
  deleteMealPlanForDates,
  type MealPlanDetailInput,
} from '../../db/database';
import { listIngredients } from '../../db/ingredientsDb';
import { listReadyMeals } from '../../db/readyMealsDb';
import {
  getPlannerDays,
  checkAndAutoGeneratePlan,
  manualGeneratePlan,
  getPlannerPreferences,
  PlannerPreferences,
  type MealSlot,
  SLOT_ORDER,
  SLOT_ICONS,
  SLOT_COLORS,
} from '../../services/plannerService';
import { RecipeModal } from '../../components/RecipeModal';
import { PlannerRegenModal } from '../../components/planner/PlannerRegenModal';
import { PlannerDeleteModal } from '../../components/planner/PlannerDeleteModal';
import { PlannerPreferencesModal } from '../../components/planner/PlannerPreferencesModal';
import MealPickerModal from '../../components/planner/MealPickerModal';
import { type DayMealItem, PlannedItemCard, isVisiblePlannedItem } from '../../components/planner/PlannedItemCards';
import { catalogRecipes, catalogVariants, getRecipeById } from '../../services/recipeCatalog';
import { useCatalogVersion } from '../../hooks/useCatalog';
import { useFavorites } from '../../context/FavoritesContext';


// Same items in the same order with the same fields (MealPlanEntry has only primitive values):
// if equal, the previous reference is kept, so no new render
function sameEntries(prev: MealPlanEntry[], next: MealPlanEntry[]): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a === b) continue;
    const keys = Object.keys(a) as (keyof MealPlanEntry)[];
    if (keys.length !== Object.keys(b).length) return false;
    for (const k of keys) {
      if (a[k] !== b[k]) return false;
    }
  }
  return true;
}

export default function PlannerScreen() {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useTheme();
  const { favoriteIds } = useFavorites();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [prefs, setPrefs] = useState<PlannerPreferences | null>(null);
  // Calendar mode from preferences ('week' until they are loaded)
  const calendarMode = prefs?.calendarMode ?? 'week';
  const weekResult = useMemo(
    () => getPlannerDays(calendarMode, weekOffset, i18n.language.startsWith('en') ? 'en' : 'it'),
    [calendarMode, weekOffset, i18n.language],
  );
  const weekDays = weekResult.days;
  // In week mode it is the usual label; in rolling mode it is the date range
  const weekLabel = weekResult.label;

  const catalogVersion = useCatalogVersion();
  // New copy on every catalog change, so the picker updates
  // catalogVersion: the catalog is updated in place, the dependency forces recomputation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pickerRecipes = useMemo(() => [...catalogRecipes, ...catalogVariants], [catalogVersion]);

  const todayStr = useMemo(() => toLocalDateString(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [plans, setPlans] = useState<MealPlanEntry[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [readyMeals, setReadyMeals] = useState<ReadyMeal[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrefsModal, setShowPrefsModal] = useState(false);

  // RecipeSummary Picker Modal State
  const [pickerVisible, setPickerVisible] = useState(false);
  // The picker stays mounted after the first opening: later openings do not recreate the modal
  const [pickerMounted, setPickerMounted] = useState(false);
  const [targetSlot, setTargetSlot] = useState<MealSlot>('pranzo');
  const [selectedDetailRecipe, setSelectedDetailRecipe] = useState<RecipeSummary | null>(null);

  // Toast animation (value kept in state so it is not treated as a ref during render) and auto-close timer
  const [toastAnim] = useState(() => new Animated.Value(0));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Plans only: ingredients and ready meals have a dedicated effect (see below)
  // Only the visible week (even when browsing previous or next weeks)
  const rangeFrom = weekDays[0]?.dateString;
  const rangeTo = weekDays[weekDays.length - 1]?.dateString;
  const loadPlans = useCallback(async () => {
    const list = await getMealPlans(rangeFrom && rangeTo ? { fromDate: rangeFrom, toDate: rangeTo } : undefined);
    setPlans(prev => (sameEntries(prev, list) ? prev : list));
    return list;
  }, [rangeFrom, rangeTo]);
  const loadPlansRef = useRef(loadPlans);
  useEffect(() => { loadPlansRef.current = loadPlans; }, [loadPlans]);

  // Week or calendar mode change: only the new range is reloaded
  useEffect(() => {
    let active = true;
    (async () => {
      const list = await getMealPlans(rangeFrom && rangeTo ? { fromDate: rangeFrom, toDate: rangeTo } : undefined);
      if (active) setPlans(prev => (sameEntries(prev, list) ? prev : list));
    })();
    return () => { active = false; };
  }, [rangeFrom, rangeTo]);

  // Floating toast at the bottom (above the tab bar): a new message replaces the previous one and resets the timer
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastAnim.stopAnimation();
    setToastMessage(msg);
    Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }).start();
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
        if (finished) setToastMessage(null);
      });
    }, 3500);
  }, [toastAnim]);

  // Clears the toast timer on unmount
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // Ingredients and ready meals: loaded on mount and reloaded on every catalog change.
  // IngredientsModal (menu) calls refreshCatalog via onChanged, which increments catalogVersion.
  useEffect(() => {
    let active = true;
    (async () => {
      const [ings, meals] = await Promise.all([listIngredients(), listReadyMeals()]);
      if (!active) return;
      // Loaded only on mount or on catalog change: the new reference is enough
      setIngredients(ings);
      setReadyMeals(meals);
    })();
    return () => { active = false; };
  }, [catalogVersion]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // After the tab transition (InteractionManager was removed in RN 0.88), so it does not block the animation
      const cancelIdle = scheduleIdle(() => {
        (async () => {
          const [, p] = await Promise.all([
            loadPlansRef.current(),
            getPlannerPreferences(),
          ]);
          if (!active) return;
          setPrefs(p);

          // Auto-generate on Monday (reads the plan by itself only if needed)
          const result = await checkAndAutoGeneratePlan();
          if (result.generated && active) {
            await loadPlansRef.current();
            showToast(t('planner.autoBanner', { count: result.entriesCount }));
          }
        })();
      });
      return () => {
        active = false;
        cancelIdle();
      };
    }, [showToast, t])
  );

  // When the week changes, today is selected if it is in the week, otherwise the first day
  const [dateWeekOffset, setDateWeekOffset] = useState(weekOffset);
  if (dateWeekOffset !== weekOffset) {
    setDateWeekOffset(weekOffset);
    const found = weekDays.find(d => d.dateString === todayStr);
    setSelectedDate(found ? todayStr : weekDays[0]?.dateString ?? todayStr);
  }

  const ingredientMap = useMemo(() => {
    const m: Record<string, Ingredient> = {};
    ingredients.forEach(i => { m[i.id] = i; });
    return m;
  }, [ingredients]);

  const readyMealMap = useMemo(() => {
    const m: Record<string, ReadyMeal> = {};
    readyMeals.forEach(r => { m[r.id] = r; });
    return m;
  }, [readyMeals]);

  const dayItems = useMemo(() => {
    const result: Partial<Record<MealSlot, DayMealItem[]>> = {};
    SLOT_ORDER.forEach(slot => {
      result[slot] = plans
        .filter(p => p.date === selectedDate && p.slot === slot)
        .sort((a, b) => a.created_at - b.created_at)
        .map(entry => ({
          entry,
          recipe: entry.recipe_id ? getRecipeById(entry.recipe_id) ?? null : null,
          ingredient: entry.ingredient_id ? ingredientMap[entry.ingredient_id] ?? null : null,
          ready: entry.ready_meal_id ? readyMealMap[entry.ready_meal_id] ?? null : null,
        }));
    });
    return result;
  // catalogVersion: the catalog is updated in place, the dependency forces recomputation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, selectedDate, catalogVersion, ingredientMap, readyMealMap]);

  // Meals already planned in the slot open in the picker (selected day): same cards as the grid
  const plannedForSlot = useMemo<DayMealItem[]>(
    () => (dayItems[targetSlot] ?? []).filter(isVisiblePlannedItem),
    [dayItems, targetSlot]
  );

  const handleOpenPicker = useCallback((slot: MealSlot) => {
    setTargetSlot(slot);
    setPickerMounted(true);
    setPickerVisible(true);
  }, []);

  const handleSelectRecipeForSlot = async (recipe: RecipeSummary, servings: number, source: RecipeSource) => {
      await saveMealPlanEntryDetailed({
        date: selectedDate,
        slot: targetSlot,
        kind: 'recipe',
        recipeId: recipe.id,
        recipeSource: source,
        servings,
      });

      loadPlans();
      showToast(t('planner.scheduledFor', { slot: t(`planner.slots.${targetSlot}`) }));
  };

  const handleSelectIngredientForSlot = async (ingredient: Ingredient, amount: number | null, unit: string) => {
    const detail = { kind: 'ingredient' as const, ingredientId: ingredient.id, amount, unit };
    await saveMealPlanEntryDetailed({
      date: selectedDate,
      slot: targetSlot,
      servings: prefs?.servings ?? 2,
      ...detail,
    });
    await loadPlans();
  };

  const handleSelectReadyMealForSlot = async (meal: ReadyMeal, count: number) => {
    const detail = { kind: 'ready' as const, readyMealId: meal.id, count };
    await saveMealPlanEntryDetailed({
      date: selectedDate,
      slot: targetSlot,
      servings: prefs?.servings ?? 2,
      ...detail,
    });
    await loadPlans();
  };

  const handleSelectOutOfHomeForSlot = async (label: string) => {
    const detail = { kind: 'out' as const, label };
    await saveMealPlanEntryDetailed({
      date: selectedDate,
      slot: targetSlot,
      servings: prefs?.servings ?? 2,
      ...detail,
    });
    await loadPlans();
  };

  const handleDeleteSlot = useCallback(async (id: string) => {
    await deleteMealPlanEntry(id);
    loadPlans();
    showToast(t('planner.slotRemovedToast'));
  }, [t, loadPlans, showToast]);

  const handleUpdateSlot = useCallback(async (id: string, input: MealPlanDetailInput) => {
    await updateMealPlanEntryDetailed(id, input);
    loadPlans();
  }, [loadPlans]);

  const handleManualGenerate = async (overwrite: boolean = false, scope: 'day' | 'week' = 'week') => {
    setIsGenerating(true);
    setShowConfirmRegen(false);
    const count = await manualGeneratePlan(overwrite, scope, selectedDate);
    await loadPlans();
    setIsGenerating(false);
    if (count > 0) {
      showToast(t('planner.autoBanner', { count }));
    }
  };

  const selectedDayInfo = weekDays.find(d => d.dateString === selectedDate) || weekDays[0];
  const maxMeals = weekDays.length * SLOT_ORDER.length; // 4 slots per day
  // Counts computed in a single pass over the plans (not on every render with multiple filters)
  const planCounts = useMemo(() => {
    const weekDates = new Set(weekDays.map(d => d.dateString));
    const entriesByDate = new Map<string, number>();
    // Counts the occupied slot (date + meal), not the individual entries: 8 dishes at breakfast = 1 slot
    const filledKeys = new Set<string>();
    const filledSlotsByDate = new Map<string, number>();
    let weekPlansCount = 0;
    for (const p of plans) {
      entriesByDate.set(p.date, (entriesByDate.get(p.date) ?? 0) + 1);
      if (weekDates.has(p.date)) weekPlansCount++;
      const key = `${p.date}|${p.slot}`;
      if (!filledKeys.has(key)) {
        filledKeys.add(key);
        filledSlotsByDate.set(p.date, (filledSlotsByDate.get(p.date) ?? 0) + 1);
      }
    }
    let plannedCountWeek = 0;
    weekDates.forEach(date => { plannedCountWeek += filledSlotsByDate.get(date) ?? 0; });
    return {
      entriesByDate,
      filledSlotsByDate,
      weekPlansCount,
      plannedCountDay: filledSlotsByDate.get(selectedDate) ?? 0,
      plannedCountWeek,
      selectedDayEntries: entriesByDate.get(selectedDate) ?? 0,
    };
  }, [plans, weekDays, selectedDate]);
  const { entriesByDate, filledSlotsByDate, weekPlansCount, plannedCountDay, plannedCountWeek, selectedDayEntries } = planCounts;
  const capacityDay = SLOT_ORDER.length; // slots for a single day
  const capacityWeek = maxMeals;
  const selectedDateLabel = selectedDayInfo
    ? `${selectedDayInfo.dayName} ${selectedDayInfo.dayNumber} ${selectedDayInfo.monthName}`
    : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>

        {/* ─── Header ─── */}
        <View style={styles.header}>
          <ScreenHeader
            title={t('planner.title')}
            subtitle={weekLabel}
            actions={
              <CircleButton size="M" variant="plain" icon="settings-outline" onPress={() => setShowPrefsModal(true)} accessibilityLabel={t('planner.preferencesModal.title')} />
            }
          />

          {/* Progress bar */}
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <ProgressBar value={maxMeals > 0 ? weekPlansCount / maxMeals : 0} />
            </View>
            <Text style={styles.progressLabel}>{t('planner.mealsCount', { count: weekPlansCount, max: maxMeals })}</Text>
          </View>
        </View>

        {/* ─── Week Navigation ─── */}
        <View style={styles.weekNav}>
          <CircleButton
            size="S"
            icon="chevron-back"
            onPress={() => setWeekOffset(o => Math.max(-1, o - 1))}
            disabled={weekOffset <= -1}
            accessibilityLabel={t('planner.prevWeek')}
          />
          <Text style={styles.weekNavLabel}>{weekLabel}</Text>
          <CircleButton
            size="S"
            icon="chevron-forward"
            onPress={() => setWeekOffset(o => Math.min(1, o + 1))}
            disabled={weekOffset >= 1}
            accessibilityLabel={t('planner.nextWeek')}
          />
        </View>

        {/* ─── Days Bar ─── */}
        <View style={styles.daysBarWrapper}>
          <View style={styles.daysBar}>
            {weekDays.map(d => {
              const isSelected = d.dateString === selectedDate;
              const hasMeal = (entriesByDate.get(d.dateString) ?? 0) > 0;
              // One dot for each planned slot (max 5), not for each course
              const mealCount = filledSlotsByDate.get(d.dateString) ?? 0;
              return (
                <TouchableOpacity
                  key={d.dateString}
                  style={[
                    styles.dayChip,
                    isSelected && styles.dayChipSelected,
                    d.isToday && !isSelected && styles.dayChipToday
                  ]}
                  onPress={() => setSelectedDate(d.dateString)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayChipName, isSelected && styles.dayChipNameSelected]}>
                    {d.dayShort}
                  </Text>
                  <Text style={[styles.dayChipNum, isSelected && styles.dayChipNumSelected]}>
                    {d.dayNumber}
                  </Text>
                  {hasMeal && (
                    <View style={[styles.mealDotRow]}>
                      {[...Array(mealCount)].map((_, i) => (
                        <View key={i} style={[styles.mealDot, isSelected && styles.mealDotSelected]} />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ─── Day Content ─── */}
        {/* Day and buttons fixed at the top: only the meal slots scroll */}
        <View style={styles.dayHeaderFixed}>
          <View style={styles.dayHeader}>
            <View>
              <Text style={styles.dayHeading}>
                {selectedDayInfo?.dayName} {selectedDayInfo?.dayNumber} {selectedDayInfo?.monthName}
              </Text>
              <Text style={styles.daySub}>
                {t('planner.plannedMeals', { count: selectedDayEntries })}
              </Text>
            </View>

          {/* Plan / Delete buttons for current week */}
          {weekOffset === 0 && (
              <View style={styles.dayActionsInline}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' }}>
                {isGenerating ? (
                  <View style={styles.generatingBox}>
                    <Spinner tone="onPrimary" />
                  </View>
                ) : (
                  <Button
                    icon="restaurant-outline"
                    label={t('planner.planBtn')}
                    onPress={() => setShowConfirmRegen(true)}
                  />
                )}
                {weekPlansCount > 0 && (
                  <Button
                    variant="danger"
                    icon="trash-outline"
                    label={t('planner.deleteBtn')}
                    onPress={() => setShowDeleteModal(true)}
                    disabled={isGenerating}
                  />
                )}
              </View>
            </View>
          )}
          </View>
        </View>

        <TabScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* All 4 slots of the day in canonical order */}
          {SLOT_ORDER.map(slot => {
            const slotColors = SLOT_COLORS[slot];
            return (
              <MealSlotCard
                key={slot}
                slot={slot}
                label={t(`planner.slots.${slot}`).toUpperCase()}
                icon={SLOT_ICONS[slot]}
                color={isDark ? slotColors.darkColor : slotColors.color}
                bgColor={isDark ? slotColors.darkBgColor : slotColors.bgColor}
                items={dayItems[slot] ?? []}
                onAdd={handleOpenPicker}
                onDelete={handleDeleteSlot}
                onUpdate={handleUpdateSlot}
                onView={setSelectedDetailRecipe}
              />
            );
          })}

        </TabScrollView>

        {/* ─── Confirm Regen Modal ─── */}
        <PlannerRegenModal
          visible={showConfirmRegen}
          selectedDateLabel={selectedDateLabel}
          plannedCountDay={plannedCountDay}
          plannedCountWeek={plannedCountWeek}
          capacityDay={capacityDay}
          capacityWeek={capacityWeek}
          onConfirm={(overwriteAll, scope) => handleManualGenerate(overwriteAll, scope)}
          onCancel={() => setShowConfirmRegen(false)}
        />

        {/* ─── Delete Modal ─── */}
        <PlannerDeleteModal
          visible={showDeleteModal}
          onDeleteDay={async () => {
            try {
              await deleteMealPlanForDates([selectedDate]);
              setShowDeleteModal(false);
              loadPlans();
              showToast(t('planner.dayClearedToast'));
            } catch (e) {
              console.error('delete day error', e);
              showToast(t('common.error'));
            }
          }}
          onDeleteWeek={async () => {
            try {
              await deleteMealPlanForDates(weekDays.map(d => d.dateString));
              setShowDeleteModal(false);
              loadPlans();
              showToast(t('planner.weekClearedToast'));
            } catch (e) {
              console.error('delete week error', e);
              showToast(t('common.error'));
            }
          }}
          onExit={() => setShowDeleteModal(false)}
        />

        {/* ─── Preferences Modal ─── */}
        <PlannerPreferencesModal
          visible={showPrefsModal}
          prefs={prefs}
          onClose={() => setShowPrefsModal(false)}
          onUpdatePrefs={(updated) => setPrefs(updated)}
        />

        {/* ─── Meal Picker Modal ─── */}
        {pickerMounted && (
          <MealPickerModal
            visible={pickerVisible}
            targetSlot={targetSlot}
            targetDate={selectedDate}
            plannedForSlot={plannedForSlot}
            onDeletePlanned={handleDeleteSlot}
            allRecipes={pickerRecipes}
            eatServings={prefs?.servings ?? 2}
            favoriteIds={favoriteIds}
            ingredients={ingredients}
            readyMeals={readyMeals}
            onSelectRecipe={handleSelectRecipeForSlot}
            onSelectIngredient={handleSelectIngredientForSlot}
            onSelectReadyMeal={handleSelectReadyMealForSlot}
            onSelectOutOfHome={handleSelectOutOfHomeForSlot}
            onClose={() => setPickerVisible(false)}
          />
        )}

        {/* RecipeSummary Detail Modal */}
        <RecipeModal
          recipe={selectedDetailRecipe}
          visible={!!selectedDetailRecipe}
          onClose={() => setSelectedDetailRecipe(null)}
        />
      </View>

      {/* ─── Toast (overlay at the bottom, above the tab bar; does not shift the layout) ─── */}
      {toastMessage && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          <Toast message={toastMessage} />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── MealSlotCard Component ───────────────────────────────────────────────────
interface MealSlotCardProps {
  slot: MealSlot;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  items: DayMealItem[];
  onAdd: (slot: MealSlot) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, input: MealPlanDetailInput) => void;
  onView: (r: RecipeSummary) => void;
}

const MealSlotCard = React.memo(function MealSlotCard({
  slot,
  label,
  icon,
  color,
  bgColor,
  items,
  onAdd,
  onDelete,
  onUpdate,
  onView,
}: MealSlotCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Recipes no longer in the catalog stay hidden; missing simple dishes show a placeholder
  const visibleItems = items.filter(isVisiblePlannedItem);

  return (
    <View style={styles.slotContainer}>
      <View style={[styles.slotHeader, styles.slotHeaderRow]}>
        <View style={[styles.slotBadge, { backgroundColor: bgColor }]}>
          <Ionicons name={icon as any} size={iconSize.sm} color={color} />
          <Text style={[styles.slotBadgeText, { color }]}>{label}</Text>
        </View>
        {visibleItems.length > 0 && (
          <CircleButton
            size="S"
            icon="add"
            onPress={() => onAdd(slot)}
            accessibilityLabel={t('planner.addMeal')}
          />
        )}
      </View>

      {visibleItems.length > 0 ? (
        <View style={styles.slotCardsGroup}>
          {visibleItems.map(item => (
            <View key={item.entry.id} style={styles.entryBlock}>
              <PlannedItemCard
                item={item}
                color={color}
                onView={onView}
                onDelete={onDelete}
                onUpdate={onUpdate}
              />
            </View>
          ))}
        </View>
      ) : (
        <TouchableOpacity style={styles.emptySlot} onPress={() => onAdd(slot)} activeOpacity={0.8}>
          <View style={[styles.addSlotCircle, { backgroundColor: bgColor }]}>
            <Ionicons name="add" size={iconSize.lg} color={color} />
          </View>
          <Text style={styles.emptySlotText}>
            {t('planner.emptySlot')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────
// Data/brand colors that have no token: dark variant for the dark theme

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mainWrapper: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },

  header: { paddingBottom: space.md },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.lg, marginHorizontal: space.xxxl },
  progressBar: { flex: 1 },
  progressLabel: { fontSize: text.label, color: colors.textMuted, fontWeight: '600' },


  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.huge, paddingVertical: space.sm,
  },
  weekNavLabel: { fontSize: text.caption, fontWeight: '700', color: colors.text },

  daysBarWrapper: { paddingVertical: space.xs },
  daysBar: { flexDirection: 'row', paddingHorizontal: space.xxxl, gap: space.sm },
  dayChip: {
    flex: 1, minWidth: 0, paddingVertical: space.lg, borderRadius: cardRadius,
    backgroundColor: colors.surface, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  dayChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipName: { fontSize: text.label, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
  dayChipNameSelected: { color: colors.onPrimary },
  dayChipNum: { fontSize: text.title, fontWeight: '700', color: colors.text, marginTop: 3 },
  dayChipNumSelected: { color: colors.onPrimary },
  // Current day: green border of the same thickness as the days, continuous with the button border
  dayChipToday: { borderColor: colors.primary },
  mealDotRow: { flexDirection: 'row', gap: 2, marginTop: space.xs },
  mealDot: { width: 5, height: 5, borderRadius: radius.full, backgroundColor: colors.primary },
  mealDotSelected: { backgroundColor: colors.onPrimary },

  scrollContent: { flex: 1, paddingHorizontal: space.huge },
  dayHeaderFixed: {
    paddingHorizontal: space.huge,
  },
  // Wraps: on narrow screens the Plan / Delete buttons drop under the date instead of sitting beside it
  dayHeader: {
    marginTop: space.xl, marginBottom: space.xxl,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between',
    rowGap: space.md, columnGap: space.md,
  },
  dayHeading: { fontSize: text.title, fontWeight: '700', color: colors.text },
  daySub: { fontSize: text.caption, color: colors.textMuted, marginTop: 2 },
  dayActionsInline: { flexShrink: 0 },
  generatingBox: {
    height: sizes.field.M, paddingHorizontal: space.huge, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },

  slotContainer: { marginBottom: space.xxxl },
  slotCardsGroup: { gap: space.xxxl },
  entryBlock: { gap: space.md },
  slotHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotHeader: { marginBottom: space.md },
  slotBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: space.lg, paddingVertical: space.xs, borderRadius: radius.full, gap: space.sm,
  },
  slotBadgeText: { fontSize: text.label, fontWeight: '700', letterSpacing: 0.5 },
  emptySlot: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: cardRadius,
    paddingVertical: 18, paddingHorizontal: space.xxxl,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', gap: space.xl,
  },
  addSlotCircle: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  emptySlotText: { fontSize: text.body, fontWeight: '600', color: colors.textMuted },
});
