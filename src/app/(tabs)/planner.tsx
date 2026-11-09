import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { TabScrollView } from '../../components/TabScrollViews';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { Recipe, MealPlanEntry } from '../../types/recipe';
import {
  getMealPlans,
  saveMealPlanEntry,
  deleteMealPlanEntry,
  updateMealPlanSideRecipe,
  updateMealPlanRecipe,
  addShoppingItems,
  deleteMealPlanForDates,
} from '../../db/database';
import { scaleIngredient } from '../../utils/servingsScaler';
import {
  getWeekDays,
  aggregateAndAddToShopping,
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
import { RecipePickerModal } from '../../components/planner/RecipePickerModal';
import { catalogRecipes, catalogVariants } from '../../services/recipeCatalog';
import { useCatalogVersion } from '../../hooks/useCatalog';


export default function PlannerScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekResult = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekDays = weekResult.days;
  const weekLabel = weekResult.weekLabel;

  const catalogVersion = useCatalogVersion();
  // Copia nuova a ogni modifica del catalogo, così il selettore si aggiorna
  // catalogVersion: il catalogo si aggiorna sul posto, la dipendenza forza il ricalcolo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pickerRecipes = useMemo(() => [...catalogRecipes, ...catalogVariants], [catalogVersion]);

  const recipeMap = useMemo(() => {
    const map: Record<string, Recipe> = {};
    [...catalogRecipes, ...catalogVariants].forEach(r => {
      map[r.id] = r;
    });
    return map;
  // catalogVersion: il catalogo si aggiorna sul posto, la dipendenza forza il ricalcolo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogVersion]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [plans, setPlans] = useState<MealPlanEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [prefs, setPrefs] = useState<PlannerPreferences | null>(null);
  const [showPrefsModal, setShowPrefsModal] = useState(false);

  // Recipe Picker Modal State
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTargetType, setPickerTargetType] = useState<'main' | 'side'>('main');
  const [targetEntryId, setTargetEntryId] = useState<string | null>(null);
  const [targetSlot, setTargetSlot] = useState<MealSlot>('pranzo');
  const [selectedDetailRecipe, setSelectedDetailRecipe] = useState<Recipe | null>(null);

  // Toast animation (valore tenuto in state per non essere trattato come ref in render) e timer di auto-chiusura
  const [toastAnim] = useState(() => new Animated.Value(0));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPlans = async () => {
    const list = await getMealPlans();
    setPlans(list);
    return list;
  };

  // Toast flottante in basso (sopra la tab bar): un nuovo messaggio sostituisce il precedente e resetta il timer
  const showToast = (msg: string) => {
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
  };

  // Pulisce il timer del toast allo smontaggio
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [list, p] = await Promise.all([
          loadPlans(),
          getPlannerPreferences(),
        ]);
        if (!active) return;
        setPrefs(p);

        // Auto-generate on Monday
        const result = await checkAndAutoGeneratePlan(list);
        if (result.generated && active) {
          await loadPlans();
          showToast(t('planner.autoBanner', { count: result.entriesCount }));
        }
      })();
      return () => { active = false; };
    }, [])
  );

  // Quando cambia settimana si seleziona oggi, se è nella settimana, altrimenti il primo giorno
  const [dateWeekOffset, setDateWeekOffset] = useState(weekOffset);
  if (dateWeekOffset !== weekOffset) {
    setDateWeekOffset(weekOffset);
    const found = weekDays.find(d => d.dateString === todayStr);
    setSelectedDate(found ? todayStr : weekDays[0]?.dateString ?? todayStr);
  }

  const dayItems = useMemo(() => {
    const result: Partial<Record<MealSlot, DayMealItem[]>> = {};
    SLOT_ORDER.forEach(slot => {
      result[slot] = plans
        .filter(p => p.date === selectedDate && p.slot === slot)
        .sort((a, b) => a.created_at - b.created_at)
        .map(entry => ({
          entry,
          recipe: recipeMap[entry.recipe_id] ?? null,
          sideRecipe: entry.side_recipe_id ? recipeMap[entry.side_recipe_id] ?? null : null,
        }));
    });
    return result;
  }, [plans, selectedDate, recipeMap]);

  const handleOpenPicker = (slot: MealSlot) => {
    setPickerTargetType('main');
    setTargetEntryId(null);
    setTargetSlot(slot);
    setPickerVisible(true);
  };

  const handleOpenSidePicker = (slot: MealSlot, entryId: string) => {
    setPickerTargetType('side');
    setTargetEntryId(entryId);
    setTargetSlot(slot);
    setPickerVisible(true);
  };

  const handleOpenSwapPicker = (slot: MealSlot, entryId: string) => {
    setPickerTargetType('main');
    setTargetEntryId(entryId);
    setTargetSlot(slot);
    setPickerVisible(true);
  };

  const handleSelectRecipeForSlot = async (recipe: Recipe) => {
    if (pickerTargetType === 'side' && targetEntryId) {
      await updateMealPlanSideRecipe(targetEntryId, recipe.id);
      setPickerVisible(false);
      loadPlans();
      showToast('Contorno aggiornato!');
    } else {
      const currentServings = prefs?.servings ?? 2;
      const baseServings = recipe.servings || 4;
      const scale = currentServings / baseServings;
      const titleWithServings = `${recipe.title} (${currentServings} porz.)`;

      const itemsToAdd: Array<{
        recipeId: string;
        recipeTitle: string;
        ingredientText: string;
        name: string;
        amount?: number | null;
        unit?: string;
        category?: string;
      }> = [];

      if (recipe.detailed_ingredients && recipe.detailed_ingredients.length > 0) {
        for (const item of recipe.detailed_ingredients) {
          const scaled = scaleIngredient(item.amount, item.unit, item.ingredient, item.text, scale);
          itemsToAdd.push({
            recipeId: recipe.id,
            recipeTitle: titleWithServings,
            ingredientText: scaled.formattedText,
            name: scaled.name,
            amount: scaled.scaledAmount,
            unit: scaled.unit,
            category: item.section || 'Generale'
          });
        }
      } else {
        for (const ing of (recipe.ingredients || [])) {
          itemsToAdd.push({
            recipeId: recipe.id,
            recipeTitle: titleWithServings,
            ingredientText: ing,
            name: ing,
            category: 'Generale'
          });
        }
      }

      if (pickerTargetType === 'main' && targetEntryId) {
        await updateMealPlanRecipe(targetEntryId, recipe.id);
      } else {
        await saveMealPlanEntry({
          date: selectedDate,
          slot: targetSlot,
          recipeId: recipe.id,
          servings: currentServings,
        });
      }

      if (itemsToAdd.length > 0) {
        await addShoppingItems(itemsToAdd);
      }

      setPickerVisible(false);
      loadPlans();
      showToast(`Pianificato per ${SLOT_LABELS[targetSlot]} e ingredienti sommati alla Spesa!`);
    }
  };

  // Il piatto principale e il contorno di una voce generata dal piano stanno nella stessa riga:
  // eliminando il principale, il contorno diventa il principale e non viene perso.
  const handleDeleteSlot = async (id: string) => {
    const entry = plans.find(p => p.id === id);
    if (entry?.side_recipe_id) {
      await updateMealPlanRecipe(id, entry.side_recipe_id);
      await updateMealPlanSideRecipe(id, null);
    } else {
      await deleteMealPlanEntry(id);
    }
    loadPlans();
    showToast(t('planner.slotRemovedToast'));
  };

  const handleDeleteSide = async (entryId: string) => {
    await updateMealPlanSideRecipe(entryId, null);
    loadPlans();
    showToast(t('planner.sideRemovedToast'));
  };

  const handleGenerateShopping = async () => {
    const weekDates = new Set(weekDays.map(d => d.dateString));
    const weekPlans = plans.filter(p => weekDates.has(p.date));
    if (weekPlans.length === 0) {
      showToast(t('planner.shoppingToastEmpty'));
      return;
    }
    const count = await aggregateAndAddToShopping(weekPlans, recipeMap);
    showToast(t('planner.shoppingToast', { count }));
  };

  const handleManualGenerate = async (overwrite: boolean = false, scope: 'day' | 'week' = 'week') => {
    setIsGenerating(true);
    setShowConfirmRegen(false);
    const count = await manualGeneratePlan(plans, overwrite, scope, selectedDate);
    await loadPlans();
    setIsGenerating(false);
    if (count > 0) {
      showToast(t('planner.autoBanner', { count }));
    }
  };

  const handleClearWeek = async () => {
    const weekDates = new Set(weekDays.map(d => d.dateString));
    const weekPlanIds = plans.filter(p => weekDates.has(p.date)).map(p => p.id);
    for (const id of weekPlanIds) {
      await deleteMealPlanEntry(id);
    }
    loadPlans();
    showToast(t('planner.weekClearedToast'));
  };

  const selectedDayInfo = weekDays.find(d => d.dateString === selectedDate) || weekDays[0];
  const weekPlansCount = plans.filter(p => weekDays.some(d => d.dateString === p.date)).length;
  const maxMeals = weekDays.length * SLOT_ORDER.length; // 4 slot per giorno

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>

        {/* ─── Header ─── */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="calendar" size={20} color={colors.primaryText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('planner.title')}</Text>
              <Text style={styles.subtitle}>{weekLabel}</Text>
            </View>

            {/* Header actions */}
            <View style={styles.headerActions}>
              {weekPlansCount > 0 && (
                <TouchableOpacity
                  style={styles.genShoppingBtn}
                  onPress={handleGenerateShopping}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cart" size={15} color={colors.onPrimary} />
                  <Text style={styles.genShoppingBtnText}>{t('planner.shoppingBtn')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.prefsBtn}
                onPress={() => setShowPrefsModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="options" size={18} color={colors.primaryText} />
              </TouchableOpacity>
            </View>
          </View>

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
              const hasMeal = plans.some(p => p.date === d.dateString);
              // Un pallino per ogni slot pianificato (max 5), non per ogni portata
              const mealCount = new Set(plans.filter(p => p.date === d.dateString).map(p => p.slot)).size;
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
        <TabScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.dayHeader}>
            <View>
              <Text style={styles.dayHeading}>
                {selectedDayInfo?.dayName} {selectedDayInfo?.dayNumber} {selectedDayInfo?.monthName}
              </Text>
              <Text style={styles.daySub}>
                {plans.filter(p => p.date === selectedDate).length} pasti pianificati
              </Text>
            </View>

          </View>

          {/* Generate / Regen / Delete buttons for current week */}
          {weekOffset === 0 && (
            <View style={styles.dayActions}>
              {weekPlansCount === 0 ? (
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
                      <Text style={styles.generateBtnText}>{t('planner.generateBtn')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {weekPlansCount < maxMeals && (
                    <TouchableOpacity
                      style={styles.completeBtn}
                      onPress={() => setShowConfirmRegen(true)}
                      activeOpacity={0.8}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="chef-hat" size={15} color={colors.onPrimary} style={{ marginRight: 4 }} />
                          <Text style={styles.completeBtnText}>{t('planner.completeBtn')} ({maxMeals - weekPlansCount})</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.regenBtn}
                    onPress={() => setShowConfirmRegen(true)}
                    activeOpacity={0.8}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <ActivityIndicator size="small" color={colors.primaryText} />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={14} color={colors.primaryText} />
                        <Text style={styles.regenBtnText}>{t('planner.regenBtn')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => setShowDeleteModal(true)}
                    activeOpacity={0.8}
                    disabled={isGenerating}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    <Text style={styles.deleteBtnText}>{t('planner.deleteBtn')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

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
                onAdd={() => handleOpenPicker(slot)}
                onSwap={entryId => handleOpenSwapPicker(slot, entryId)}
                onDelete={(id) => handleDeleteSlot(id)}
                onView={(r) => setSelectedDetailRecipe(r)}
                onSwapSide={entryId => handleOpenSidePicker(slot, entryId)}
                onDeleteSide={entryId => handleDeleteSide(entryId)}
              />
            );
          })}

        </TabScrollView>

        {/* ─── Confirm Regen Modal ─── */}
        <PlannerRegenModal
          visible={showConfirmRegen}
          onConfirm={(overwriteAll, scope) => handleManualGenerate(overwriteAll, scope)}
          onCancel={() => setShowConfirmRegen(false)}
        />

        {/* ─── Delete Modal ─── */}
        <PlannerDeleteModal
          visible={showDeleteModal}
          onDeleteDay={async () => {
            await deleteMealPlanForDates([selectedDate]);
            setShowDeleteModal(false);
            loadPlans();
            showToast(t('planner.dayClearedToast'));
          }}
          onDeleteWeek={async () => {
            await deleteMealPlanForDates(weekDays.map(d => d.dateString));
            setShowDeleteModal(false);
            loadPlans();
            showToast(t('planner.weekClearedToast'));
          }}
          onExit={() => setShowDeleteModal(false)}
        />

        {/* ─── Preferences Modal ─── */}
        <PlannerPreferencesModal
          visible={showPrefsModal}
          prefs={prefs}
          onClose={() => setShowPrefsModal(false)}
          onUpdatePrefs={(updated) => setPrefs(updated)}
          onClearWeek={handleClearWeek}
        />

        {/* ─── Recipe Picker Modal ─── */}
        <RecipePickerModal
          visible={pickerVisible}
          targetSlot={targetSlot}
          targetType={pickerTargetType}
          allRecipes={pickerRecipes}
          onSelect={handleSelectRecipeForSlot}
          onClose={() => setPickerVisible(false)}
        />

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
interface DayMealItem {
  entry: MealPlanEntry;
  recipe: Recipe | null;
  sideRecipe: Recipe | null;
}

interface MealSlotCardProps {
  slot: MealSlot;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  items: DayMealItem[];
  onAdd: () => void;
  onSwap: (entryId: string) => void;
  onDelete: (id: string) => void;
  onView: (r: Recipe) => void;
  onSwapSide: (entryId: string) => void;
  onDeleteSide: (entryId: string) => void;
}

const MealSlotCard = React.memo(function MealSlotCard({
  slot,
  label,
  icon,
  color,
  bgColor,
  items,
  onAdd,
  onSwap,
  onDelete,
  onView,
  onSwapSide,
  onDeleteSide,
}: MealSlotCardProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const visibleItems = items.filter((item): item is DayMealItem & { recipe: Recipe } => item.recipe !== null);

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
            onPress={onAdd}
            activeOpacity={0.7}
            accessibilityLabel={t('planner.addMeal')}
          >
            <Ionicons name="add" size={18} color={color} />
          </TouchableOpacity>
        )}
      </View>

      {visibleItems.length > 0 ? (
        <View style={styles.slotCardsGroup}>
          {visibleItems.map(({ entry, recipe, sideRecipe }) => (
            <View key={entry.id} style={styles.entryBlock}>
              <MealRow
                recipe={recipe}
                servings={entry.servings}
                categoryLabel={
                  <Text style={[styles.mealCategory, { color }]}>
                    {t('categories.' + recipe.category, { defaultValue: recipe.category })}
                  </Text>
                }
                placeholderIcon="restaurant-outline"
                placeholderColor={colors.textMuted}
                onView={() => onView(recipe)}
                onSwap={() => onSwap(entry.id)}
                onDelete={() => onDelete(entry.id)}
              />
              {sideRecipe && (
                <MealRow
                  side
                  recipe={sideRecipe}
                  servings={entry.servings}
                  categoryLabel={
                    <View style={styles.sideBadgeRow}>
                      <Ionicons name="leaf" size={11} color={sideTeal(isDark)} />
                      <Text style={styles.sideMealCategory}>{t('planner.sideDish').toUpperCase()}</Text>
                    </View>
                  }
                  placeholderIcon="leaf-outline"
                  placeholderColor={sideTeal(isDark)}
                  onView={() => onView(sideRecipe)}
                  onSwap={() => onSwapSide(entry.id)}
                  onDelete={() => onDeleteSide(entry.id)}
                />
              )}
            </View>
          ))}
        </View>
      ) : (
        <TouchableOpacity style={styles.emptySlot} onPress={onAdd} activeOpacity={0.8}>
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

// Riga di una ricetta pianificata (piatto principale o contorno)
function MealRow({
  side = false,
  recipe,
  servings,
  categoryLabel,
  placeholderIcon,
  placeholderColor,
  onView,
  onSwap,
  onDelete,
}: {
  side?: boolean;
  recipe: Recipe;
  servings: number;
  categoryLabel: React.ReactNode;
  placeholderIcon: React.ComponentProps<typeof Ionicons>['name'];
  placeholderColor: string;
  onView: () => void;
  onSwap: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={side ? styles.sideMealCard : styles.mealCard}>
      {recipe.image ? (
        <Image source={{ uri: recipe.image }} style={styles.mealImage} contentFit="cover" cachePolicy="disk" />
      ) : (
        <View style={[styles.mealImage, styles.mealImagePlaceholder]}>
          <Ionicons name={placeholderIcon} size={24} color={placeholderColor} />
        </View>
      )}
      <View style={styles.mealInfo}>
        {categoryLabel}
        <Text style={styles.mealTitle} numberOfLines={2}>{recipe.title}</Text>
        <View style={styles.mealMeta}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} style={{ marginRight: 3 }} />
          <Text style={styles.mealMetaText}>{t('common.minutes', { count: recipe.times.total_minutes })}</Text>
          <Text style={styles.mealMetaDivider}>·</Text>
          <Ionicons name="people-outline" size={12} color={colors.textMuted} style={{ marginRight: 3 }} />
          <Text style={styles.mealMetaText}>{t('common.servings', { count: servings })}</Text>
        </View>
      </View>

      <View style={styles.mealActions}>
        <TouchableOpacity style={styles.viewMealBtn} onPress={onView} activeOpacity={0.7}>
          <Ionicons name="book-outline" size={17} color={colors.primaryText} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.swapMealBtn} onPress={onSwap} activeOpacity={0.7}>
          <Ionicons name="swap-horizontal" size={17} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteMealBtn} onPress={onDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={17} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
// Colori dati/brand che non hanno un token: variante scura per il tema dark
const sideTeal = (isDark: boolean) => (isDark ? '#5FB8A8' : '#3A8C7E'); // categoria contorno
const completeOchre = (isDark: boolean) => (isDark ? '#9A5A26' : '#C07A3A'); // azione "completa"
const deleteBorderPink = (isDark: boolean) => (isDark ? '#5A3634' : '#E8B4B1'); // bordo elimina

const makeStyles = (colors: Palette, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mainWrapper: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  genShoppingBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, gap: 5,
  },
  genShoppingBtnText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
  prefsBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
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
  dayHeader: {
    marginTop: 12, marginBottom: 14,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  dayHeading: { fontSize: 17, fontWeight: '700', color: colors.text },
  daySub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dayActions: { marginTop: 4, marginBottom: 8 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  generateBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: completeOchre(isDark), paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 10, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  completeBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  regenBtnText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
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
  mealCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  sideMealCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 5, elevation: 1,
  },
  mealImage: { width: 64, height: 64, borderRadius: 12, marginRight: 12 },
  mealImagePlaceholder: { backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  mealInfo: { flex: 1 },
  mealCategory: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  sideBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  sideMealCategory: { fontSize: 10, fontWeight: '700', color: sideTeal(isDark), letterSpacing: 0.5 },
  mealTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2, lineHeight: 19 },
  mealMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  mealMetaText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  mealMetaDivider: { fontSize: 11, color: colors.textMuted, marginHorizontal: 4 },
  mealActions: { flexDirection: 'row', gap: 6 },
  viewMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  swapMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  deleteMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  emptySlot: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', gap: 12,
  },
  addSlotCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptySlotText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
