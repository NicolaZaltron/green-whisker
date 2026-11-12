import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toLocalDateString } from '../../utils/dates';
import { scheduleIdle } from '../../utils/idle';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { TabScrollView } from '../../components/TabScrollViews';
import { ScreenHeader, HeaderIconButton } from '../../components/ui/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { Recipe, MealPlanEntry } from '../../types/recipe';
import type { Ingredient, ReadyMeal } from '../../types/catalog';
import {
  getMealPlans,
  saveMealPlanEntryDetailed,
  deleteMealPlanEntry,
  deleteMealPlanForDates,
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
  SLOT_LABELS,
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


// Stesse voci nello stesso ordine con gli stessi campi (MealPlanEntry ha solo valori primitivi):
// se uguale si tiene il riferimento precedente, quindi nessun nuovo render
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
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [prefs, setPrefs] = useState<PlannerPreferences | null>(null);
  // Modalità calendario dalle preferenze ('week' finché non sono caricate)
  const calendarMode = prefs?.calendarMode ?? 'week';
  const weekResult = useMemo(
    () => getPlannerDays(calendarMode, weekOffset, i18n.language.startsWith('en') ? 'en' : 'it'),
    [calendarMode, weekOffset, i18n.language],
  );
  const weekDays = weekResult.days;
  // In settimana è l'etichetta di sempre; in modalità rolling è l'intervallo di date
  const weekLabel = weekResult.label;

  const catalogVersion = useCatalogVersion();
  // Copia nuova a ogni modifica del catalogo, così il selettore si aggiorna
  // catalogVersion: il catalogo si aggiorna sul posto, la dipendenza forza il ricalcolo
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

  // Recipe Picker Modal State
  const [pickerVisible, setPickerVisible] = useState(false);
  // Il picker resta montato dopo la prima apertura: le aperture successive non ricreano la modale
  const [pickerMounted, setPickerMounted] = useState(false);
  const [targetSlot, setTargetSlot] = useState<MealSlot>('pranzo');
  const [selectedDetailRecipe, setSelectedDetailRecipe] = useState<Recipe | null>(null);

  // Toast animation (valore tenuto in state per non essere trattato come ref in render) e timer di auto-chiusura
  const [toastAnim] = useState(() => new Animated.Value(0));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Solo i piani: ingredienti e piatti pronti hanno un effetto dedicato (vedi sotto)
  // Solo la settimana visibile (anche sfogliando settimane precedenti o successive)
  const rangeFrom = weekDays[0]?.dateString;
  const rangeTo = weekDays[weekDays.length - 1]?.dateString;
  const loadPlans = useCallback(async () => {
    const list = await getMealPlans(rangeFrom && rangeTo ? { fromDate: rangeFrom, toDate: rangeTo } : undefined);
    setPlans(prev => (sameEntries(prev, list) ? prev : list));
    return list;
  }, [rangeFrom, rangeTo]);
  const loadPlansRef = useRef(loadPlans);
  useEffect(() => { loadPlansRef.current = loadPlans; }, [loadPlans]);

  // Cambio settimana o modalità calendario: si ricarica solo l'intervallo nuovo
  useEffect(() => {
    let active = true;
    (async () => {
      const list = await getMealPlans(rangeFrom && rangeTo ? { fromDate: rangeFrom, toDate: rangeTo } : undefined);
      if (active) setPlans(prev => (sameEntries(prev, list) ? prev : list));
    })();
    return () => { active = false; };
  }, [rangeFrom, rangeTo]);

  // Toast flottante in basso (sopra la tab bar): un nuovo messaggio sostituisce il precedente e resetta il timer
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastAnim.stopAnimation();
    setToastMessage(msg);
    Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setToastMessage(null);
      });
    }, 3500);
  }, [toastAnim]);

  // Pulisce il timer del toast allo smontaggio
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // Ingredienti e piatti pronti: caricati al mount e ricaricati a ogni cambio del catalogo.
  // IngredientsModal (menu) chiama refreshCatalog via onChanged, che incrementa catalogVersion.
  useEffect(() => {
    let active = true;
    (async () => {
      const [ings, meals] = await Promise.all([listIngredients(), listReadyMeals()]);
      if (!active) return;
      // Caricati solo al mount o al cambio del catalogo: il riferimento nuovo basta
      setIngredients(ings);
      setReadyMeals(meals);
    })();
    return () => { active = false; };
  }, [catalogVersion]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Dopo la transizione della tab (InteractionManager è stato rimosso da RN 0.88), così non blocca l'animazione
      const cancelIdle = scheduleIdle(() => {
        (async () => {
          const [, p] = await Promise.all([
            loadPlansRef.current(),
            getPlannerPreferences(),
          ]);
          if (!active) return;
          setPrefs(p);

          // Auto-generate on Monday (legge il piano da sé solo se serve)
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
    }, [])
  );

  // Quando cambia settimana si seleziona oggi, se è nella settimana, altrimenti il primo giorno
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
  // catalogVersion: il catalogo si aggiorna sul posto, la dipendenza forza il ricalcolo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, selectedDate, catalogVersion, ingredientMap, readyMealMap]);

  // Pasti già pianificati nello slot aperto nel picker (giorno selezionato): stesse schede della griglia
  const plannedForSlot = useMemo<DayMealItem[]>(
    () => (dayItems[targetSlot] ?? []).filter(isVisiblePlannedItem),
    [dayItems, targetSlot]
  );

  const handleOpenPicker = useCallback((slot: MealSlot) => {
    setTargetSlot(slot);
    setPickerMounted(true);
    setPickerVisible(true);
  }, []);

  const handleSelectRecipeForSlot = async (recipe: Recipe) => {
      const currentServings = prefs?.servings ?? 2;

      await saveMealPlanEntryDetailed({
        date: selectedDate,
        slot: targetSlot,
        kind: 'recipe',
        recipeId: recipe.id,
        servings: currentServings,
      });

      loadPlans();
      showToast(`Pianificato per ${SLOT_LABELS[targetSlot]}!`);
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
  const maxMeals = weekDays.length * SLOT_ORDER.length; // 4 slot per giorno
  // Conteggi calcolati in un solo passaggio sui piani (non a ogni render con più filter)
  const planCounts = useMemo(() => {
    const weekDates = new Set(weekDays.map(d => d.dateString));
    const entriesByDate = new Map<string, number>();
    // Si conta lo slot occupato (data + pasto), non le singole voci: 8 piatti a colazione = 1 slot
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
  const capacityDay = SLOT_ORDER.length; // slot per un singolo giorno
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
            icon="calendar"
            title={t('planner.title')}
            subtitle={weekLabel}
            actions={
              <HeaderIconButton
                icon="options"
                onPress={() => setShowPrefsModal(true)}
                accessibilityLabel={t('planner.preferencesModal.title')}
              />
            }
          />

          {/* Progress bar */}
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.round((weekPlansCount / maxMeals) * 100)}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>{t('planner.mealsCount', { count: weekPlansCount, max: maxMeals })}</Text>
          </View>
        </View>

        {/* ─── Week Navigation ─── */}
        <View style={styles.weekNav}>
          <TouchableOpacity
            style={[styles.weekNavBtn, weekOffset <= -1 && styles.weekNavBtnDisabled]}
            onPress={() => setWeekOffset(o => Math.max(-1, o - 1))}
            disabled={weekOffset <= -1}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={weekOffset <= -1 ? colors.textMuted : colors.primaryText} />
          </TouchableOpacity>
          <Text style={styles.weekNavLabel}>{weekLabel}</Text>
          <TouchableOpacity
            style={[styles.weekNavBtn, weekOffset >= 1 && styles.weekNavBtnDisabled]}
            onPress={() => setWeekOffset(o => Math.min(1, o + 1))}
            disabled={weekOffset >= 1}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={18} color={weekOffset >= 1 ? colors.textMuted : colors.primaryText} />
          </TouchableOpacity>
        </View>

        {/* ─── Days Bar ─── */}
        <View style={styles.daysBarWrapper}>
          <View style={styles.daysBar}>
            {weekDays.map(d => {
              const isSelected = d.dateString === selectedDate;
              const hasMeal = (entriesByDate.get(d.dateString) ?? 0) > 0;
              // Un pallino per ogni slot pianificato (max 5), non per ogni portata
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
                    {d.dayName.slice(0, 3)}
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
        {/* Giorno e pulsanti fissi in alto: scorrono solo gli slot dei pasti */}
        <View style={styles.dayHeaderFixed}>
          <View style={styles.dayHeader}>
            <View>
              <Text style={styles.dayHeading}>
                {selectedDayInfo?.dayName} {selectedDayInfo?.dayNumber} {selectedDayInfo?.monthName}
              </Text>
              <Text style={styles.daySub}>
                {selectedDayEntries} pasti pianificati
              </Text>
            </View>

          {/* Plan / Delete buttons for current week */}
          {weekOffset === 0 && (
              <View style={styles.dayActionsInline}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity
                  style={styles.generateBtn}
                  onPress={() => setShowConfirmRegen(true)}
                  activeOpacity={0.8}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="chef-hat" size={16} color={colors.onPrimary} style={{ marginRight: 5 }} />
                      <Text style={styles.generateBtnText}>{t('planner.planBtn')}</Text>
                    </>
                  )}
                </TouchableOpacity>
                {weekPlansCount > 0 && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => setShowDeleteModal(true)}
                    activeOpacity={0.8}
                    disabled={isGenerating}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    <Text style={styles.deleteBtnText}>{t('planner.deleteBtn')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          </View>
        </View>

        <TabScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Tutti e 4 gli slot del giorno in ordine canonico */}
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

        {/* Recipe Detail Modal */}
        <RecipeModal
          recipe={selectedDetailRecipe}
          visible={!!selectedDetailRecipe}
          onClose={() => setSelectedDetailRecipe(null)}
        />
      </View>

      {/* ─── Toast (overlay in basso, sopra la tab bar; non sposta il layout) ─── */}
      {toastMessage && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastBanner,
            {
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={16} color={colors.onPrimary} style={{ marginRight: 6 }} />
          <Text style={styles.toastText}>{toastMessage}</Text>
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
  onView: (r: Recipe) => void;
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
  onView,
}: MealSlotCardProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  // Le ricette non più nel catalogo restano nascoste; i piatti semplici mancanti mostrano un segnaposto
  const visibleItems = items.filter(isVisiblePlannedItem);

  return (
    <View style={styles.slotContainer}>
      <View style={[styles.slotHeader, styles.slotHeaderRow]}>
        <View style={[styles.slotBadge, { backgroundColor: bgColor }]}>
          <Ionicons name={icon as any} size={16} color={color} />
          <Text style={[styles.slotBadgeText, { color }]}>{label}</Text>
        </View>
        {visibleItems.length > 0 && (
          <TouchableOpacity
            style={[styles.slotAddBtn, { backgroundColor: bgColor }]}
            onPress={() => onAdd(slot)}
            activeOpacity={0.7}
            accessibilityLabel={t('planner.addMeal')}
          >
            <Ionicons name="add" size={18} color={color} />
          </TouchableOpacity>
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
              />
            </View>
          ))}
        </View>
      ) : (
        <TouchableOpacity style={styles.emptySlot} onPress={() => onAdd(slot)} activeOpacity={0.8}>
          <View style={[styles.addSlotCircle, { backgroundColor: bgColor }]}>
            <Ionicons name="add" size={20} color={color} />
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
// Colori dati/brand che non hanno un token: variante scura per il tema dark
const deleteBorderPink = (isDark: boolean) => (isDark ? '#5A3634' : '#E8B4B1'); // bordo elimina

const makeStyles = (colors: Palette, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mainWrapper: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },

  header: { paddingBottom: 8 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginHorizontal: 16 },
  progressBar: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: colors.primarySoft, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  progressLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },

  toastBanner: {
    position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 100, elevation: 6,
    backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10,
  },
  toastText: { color: colors.onPrimary, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'center' },

  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 6,
  },
  weekNavBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  weekNavBtnDisabled: { backgroundColor: colors.surfaceMuted },
  weekNavLabel: { fontSize: 13, fontWeight: '700', color: colors.text },

  daysBarWrapper: { paddingVertical: 4 },
  daysBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 6 },
  dayChip: {
    flex: 1, minWidth: 0, paddingVertical: 10, borderRadius: 14,
    backgroundColor: colors.surface, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  dayChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipName: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
  dayChipNameSelected: { color: colors.onPrimary },
  dayChipNum: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 3 },
  dayChipNumSelected: { color: colors.onPrimary },
  // Giorno corrente: bordo verde dello stesso spessore dei giorni, continuo con il bordo del pulsante
  dayChipToday: { borderColor: colors.primary },
  mealDotRow: { flexDirection: 'row', gap: 3, marginTop: 4 },
  mealDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary },
  mealDotSelected: { backgroundColor: colors.onPrimary },

  scrollContent: { flex: 1, paddingHorizontal: 20 },
  dayHeaderFixed: {
    paddingHorizontal: 20,
  },
  dayHeader: {
    marginTop: 12, marginBottom: 14,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  dayHeading: { fontSize: 17, fontWeight: '700', color: colors.text },
  daySub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dayActionsInline: { marginLeft: 8, flexShrink: 1 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  generateBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: deleteBorderPink(isDark),
  },
  deleteBtnText: { color: colors.danger, fontSize: 13, fontWeight: '700' },

  slotContainer: { marginBottom: 16 },
  slotCardsGroup: { gap: 16 },
  entryBlock: { gap: 8 },
  slotHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotAddBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  slotHeader: { marginBottom: 8 },
  slotBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 6,
  },
  slotBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  emptySlot: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', gap: 12,
  },
  addSlotCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptySlotText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
