import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Recipe, MealPlanEntry } from '../../types/recipe';
import {
  getMealPlans,
  saveMealPlanEntry,
  deleteMealPlanEntry,
  clearMealPlans,
  updateMealPlanSideRecipe,
  addShoppingItems,
  getCustomRecipes,
} from '../../db/database';
import { scaleIngredient } from '../../utils/servingsScaler';
import {
  getWeekDays,
  aggregateAndAddToShopping,
  checkAndAutoGeneratePlan,
  manualGeneratePlan,
  getPlannerPreferences,
  savePlannerPreferences,
  PlannerPreferences,
  type MealSlot,
  SLOT_ORDER,
  SLOT_LABELS,
  SLOT_ICONS,
  SLOT_COLORS,
  getRecipesForSlot,
} from '../../services/plannerService';
import { RecipeModal } from '../../components/RecipeModal';
import { PlannerRegenModal } from '../../components/planner/PlannerRegenModal';
import { PlannerPreferencesModal } from '../../components/planner/PlannerPreferencesModal';
import { RecipePickerModal } from '../../components/planner/RecipePickerModal';

const rawRecipes = require('../../../assets/ricette.json') as Recipe[];

// ─── Week offset navigation ───────────────────────────────────────────────────
const WEEK_OFFSETS = [-1, 0, 1];

export default function PlannerScreen() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekResult = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekDays = weekResult.days;
  const weekLabel = weekResult.weekLabel;

  const [allRecipes, setAllRecipes] = useState<Recipe[]>(rawRecipes);

  const recipeMap = useMemo(() => {
    const map: Record<string, Recipe> = {};
    allRecipes.forEach(r => {
      map[r.id] = r;
    });
    return map;
  }, [allRecipes]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [plans, setPlans] = useState<MealPlanEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [autoBanner, setAutoBanner] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [prefs, setPrefs] = useState<PlannerPreferences | null>(null);
  const [showPrefsModal, setShowPrefsModal] = useState(false);

  // Recipe Picker Modal State
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTargetType, setPickerTargetType] = useState<'main' | 'side'>('main');
  const [targetEntryId, setTargetEntryId] = useState<string | null>(null);
  const [targetSlot, setTargetSlot] = useState<MealSlot>('pranzo');
  const [selectedDetailRecipe, setSelectedDetailRecipe] = useState<Recipe | null>(null);

  // Banner animation
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const loadPlans = async () => {
    const list = await getMealPlans();
    setPlans(list);
    return list;
  };

  const showAutoBanner = (msg: string) => {
    setAutoBanner(msg);
    Animated.sequence([
      Animated.timing(bannerAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(4000),
      Animated.timing(bannerAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => setAutoBanner(null));
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [list, p, customs] = await Promise.all([
          loadPlans(),
          getPlannerPreferences(),
          getCustomRecipes(),
        ]);
        if (!active) return;
        setPrefs(p);
        if (customs && customs.length > 0) {
          const map = new Map<string, Recipe>();
          rawRecipes.forEach(r => map.set(r.id, r));
          customs.forEach(r => map.set(r.id, r));
          setAllRecipes(Array.from(map.values()));
        } else {
          setAllRecipes(rawRecipes);
        }

        // Auto-generate on Monday
        const result = await checkAndAutoGeneratePlan(list);
        if (result.generated && active) {
          await loadPlans();
          showAutoBanner(`Piano settimana generato automaticamente con ${result.entriesCount} pasti!`);
        }
      })();
      return () => { active = false; };
    }, [])
  );

  // When week changes, select today if in current week, else first day of week
  useEffect(() => {
    const found = weekDays.find(d => d.dateString === todayStr);
    setSelectedDate(found ? todayStr : weekDays[0]?.dateString ?? todayStr);
  }, [weekOffset]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  const dayPlans = useMemo(() => {
    const result: Partial<Record<MealSlot, MealPlanEntry>> = {};
    SLOT_ORDER.forEach(slot => {
      result[slot] = plans.find(p => p.date === selectedDate && p.slot === slot);
    });
    return result;
  }, [plans, selectedDate]);

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

  const handleSelectRecipeForSlot = async (recipe: Recipe) => {
    if (pickerTargetType === 'side' && targetEntryId) {
      await updateMealPlanSideRecipe(targetEntryId, recipe.id);
      setPickerVisible(false);
      loadPlans();
      showToast('Contorno aggiornato!');
    } else {
      const currentServings = prefs?.servings ?? 2;
      const baseServings = recipe.porzioni || 4;
      const scale = currentServings / baseServings;
      const titleWithServings = `${recipe.titolo} (${currentServings} porz.)`;

      const itemsToAdd: Array<{
        recipeId: string;
        recipeTitle: string;
        ingredientText: string;
        name: string;
        amount?: number | null;
        unit?: string;
        category?: string;
      }> = [];

      if (recipe.ingredienti_dettagliati && recipe.ingredienti_dettagliati.length > 0) {
        for (const item of recipe.ingredienti_dettagliati) {
          const scaled = scaleIngredient(item.quantita, item.unita, item.ingrediente, item.testo, scale);
          itemsToAdd.push({
            recipeId: recipe.id,
            recipeTitle: titleWithServings,
            ingredientText: scaled.formattedText,
            name: scaled.name,
            amount: scaled.scaledAmount,
            unit: scaled.unit,
            category: item.sezione || 'Generale'
          });
        }
      } else {
        for (const ing of recipe.ingredienti) {
          itemsToAdd.push({
            recipeId: recipe.id,
            recipeTitle: titleWithServings,
            ingredientText: ing,
            name: ing,
            category: 'Generale'
          });
        }
      }

      await saveMealPlanEntry({
        date: selectedDate,
        slot: targetSlot,
        recipeId: recipe.id,
        servings: currentServings,
      });

      if (itemsToAdd.length > 0) {
        await addShoppingItems(itemsToAdd);
      }

      setPickerVisible(false);
      loadPlans();
      showToast(`Pianificato per ${SLOT_LABELS[targetSlot]} e ingredienti sommati alla Spesa!`);
    }
  };

  const handleDeleteSlot = async (id: string) => {
    await deleteMealPlanEntry(id);
    loadPlans();
    showToast('Pasto rimosso dal piano.');
  };

  const handleDeleteSide = async (entryId: string) => {
    await updateMealPlanSideRecipe(entryId, null);
    loadPlans();
    showToast('Contorno rimosso.');
  };

  const handleGenerateShopping = async () => {
    const weekDates = new Set(weekDays.map(d => d.dateString));
    const weekPlans = plans.filter(p => weekDates.has(p.date));
    if (weekPlans.length === 0) {
      showToast('Nessun pasto pianificato questa settimana.');
      return;
    }
    const count = await aggregateAndAddToShopping(weekPlans, recipeMap);
    showToast(`Sommati ${count} ingredienti per la settimana nella Spesa!`);
  };

  const handleManualGenerate = async (overwrite: boolean = false) => {
    setIsGenerating(true);
    setShowConfirmRegen(false);
    const count = await manualGeneratePlan(plans, overwrite);
    await loadPlans();
    setIsGenerating(false);
    if (count > 0) {
      showToast(`Piano generato con ${count} nuovi pasti!`);
    } else {
      showToast('La settimana è già completa. Premi "Rigenera" per sovrascrivere.');
    }
  };

  const handleClearWeek = async () => {
    const weekDates = new Set(weekDays.map(d => d.dateString));
    const weekPlanIds = plans.filter(p => weekDates.has(p.date)).map(p => p.id);
    for (const id of weekPlanIds) {
      await deleteMealPlanEntry(id);
    }
    loadPlans();
    showToast('Piano settimana cancellato.');
  };

  const selectedDayInfo = weekDays.find(d => d.dateString === selectedDate) || weekDays[0];
  const weekPlansCount = plans.filter(p => weekDays.some(d => d.dateString === p.date)).length;
  const maxMeals = weekDays.length * SLOT_ORDER.length; // 4 slot per giorno

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>

        {/* ─── Auto-Generated Banner ─── */}
        {autoBanner && (
          <Animated.View style={[styles.autoBanner, { opacity: bannerAnim }]}>
            <Ionicons name="checkmark-circle" size={17} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.autoBannerText}>{autoBanner}</Text>
          </Animated.View>
        )}

        {/* ─── Header ─── */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="calendar" size={20} color="#4A6B53" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Meal Planner</Text>
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
                  <Ionicons name="cart" size={15} color="#FFF" />
                  <Text style={styles.genShoppingBtnText}>Spesa</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.prefsBtn}
                onPress={() => setShowPrefsModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="options" size={18} color="#4A6B53" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.round((weekPlansCount / maxMeals) * 100)}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>{weekPlansCount}/{maxMeals} pasti</Text>
          </View>
        </View>

        {/* ─── Toast ─── */}
        {toastMessage && (
          <View style={styles.toastBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        )}

        {/* ─── Week Navigation ─── */}
        <View style={styles.weekNav}>
          <TouchableOpacity
            style={[styles.weekNavBtn, weekOffset <= -1 && styles.weekNavBtnDisabled]}
            onPress={() => setWeekOffset(o => Math.max(-1, o - 1))}
            disabled={weekOffset <= -1}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={weekOffset <= -1 ? '#C5CEC7' : '#4A6B53'} />
          </TouchableOpacity>
          <Text style={styles.weekNavLabel}>{weekLabel}</Text>
          <TouchableOpacity
            style={[styles.weekNavBtn, weekOffset >= 1 && styles.weekNavBtnDisabled]}
            onPress={() => setWeekOffset(o => Math.min(1, o + 1))}
            disabled={weekOffset >= 1}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={18} color={weekOffset >= 1 ? '#C5CEC7' : '#4A6B53'} />
          </TouchableOpacity>
        </View>

        {/* ─── Days Bar ─── */}
        <View style={styles.daysBarWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysBar}>
            {weekDays.map(d => {
              const isSelected = d.dateString === selectedDate;
              const hasMeal = plans.some(p => p.date === d.dateString);
              const mealCount = plans.filter(p => p.date === d.dateString).length;
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
          </ScrollView>
        </View>

        {/* ─── Day Content ─── */}
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.dayHeader}>
            <View>
              <Text style={styles.dayHeading}>
                {selectedDayInfo?.dayName} {selectedDayInfo?.dayNumber} {selectedDayInfo?.monthName}
              </Text>
              <Text style={styles.daySub}>
                {plans.filter(p => p.date === selectedDate).length} pasti pianificati
              </Text>
            </View>

            {/* Generate / Regen buttons for current week */}
            {weekOffset === 0 && (
              <View style={styles.dayActions}>
                {weekPlansCount === 0 ? (
                  <TouchableOpacity
                    style={styles.generateBtn}
                    onPress={() => handleManualGenerate(false)}
                    activeOpacity={0.8}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="chef-hat" size={16} color="#FFF" style={{ marginRight: 5 }} />
                        <Text style={styles.generateBtnText}>Genera Piano</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {weekPlansCount < maxMeals && (
                      <TouchableOpacity
                        style={styles.completeBtn}
                        onPress={() => handleManualGenerate(false)}
                        activeOpacity={0.8}
                        disabled={isGenerating}
                      >
                        {isGenerating ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="chef-hat" size={15} color="#FFF" style={{ marginRight: 4 }} />
                            <Text style={styles.completeBtnText}>Completa ({maxMeals - weekPlansCount})</Text>
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
                        <ActivityIndicator size="small" color="#4A6B53" />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={14} color="#4A6B53" />
                          <Text style={styles.regenBtnText}>Rigenera</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Tutti e 4 gli slot del giorno in ordine canonico */}
          {SLOT_ORDER.map(slot => {
            const colors = SLOT_COLORS[slot];
            const currentEntry = dayPlans[slot];
            return (
              <MealSlotCard
                key={slot}
                slot={slot}
                label={SLOT_LABELS[slot].toUpperCase()}
                icon={SLOT_ICONS[slot]}
                color={colors.color}
                bgColor={colors.bgColor}
                entry={currentEntry}
                recipe={currentEntry ? recipeMap[currentEntry.recipe_id] : null}
                sideRecipe={currentEntry?.side_recipe_id ? recipeMap[currentEntry.side_recipe_id] : null}
                onAdd={() => handleOpenPicker(slot)}
                onDelete={(id) => handleDeleteSlot(id)}
                onView={(r) => setSelectedDetailRecipe(r)}
                onSwapSide={currentEntry ? () => handleOpenSidePicker(slot, currentEntry.id) : undefined}
                onDeleteSide={currentEntry ? () => handleDeleteSide(currentEntry.id) : undefined}
              />
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* ─── Confirm Regen Modal ─── */}
        <PlannerRegenModal
          visible={showConfirmRegen}
          onConfirm={(overwriteAll) => handleManualGenerate(overwriteAll)}
          onCancel={() => setShowConfirmRegen(false)}
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
          allRecipes={allRecipes}
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
  entry: MealPlanEntry | undefined;
  recipe?: Recipe | null;
  sideRecipe?: Recipe | null;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onView: (r: Recipe) => void;
  onSwapSide?: () => void;
  onDeleteSide?: (id: string) => void;
}

const EMPTY_SLOT_TEXTS: Record<MealSlot, string> = {
  colazione: 'Scegli cosa gustare a colazione',
  spuntino_mattina: 'Scegli frutta fresca o frutta secca per la mattina',
  pranzo: 'Scegli cosa cucinare a pranzo',
  spuntino_pomeriggio: 'Scegli uno snack o merenda per il pomeriggio',
  cena: 'Scegli cosa preparare per cena',
};

const MealSlotCard = React.memo(function MealSlotCard({
  slot,
  label,
  icon,
  color,
  bgColor,
  entry,
  recipe,
  sideRecipe,
  onAdd,
  onDelete,
  onView,
  onSwapSide,
  onDeleteSide,
}: MealSlotCardProps) {

  return (
    <View style={styles.slotContainer}>
      <View style={styles.slotHeader}>
        <View style={[styles.slotBadge, { backgroundColor: bgColor }]}>
          <Ionicons name={icon as any} size={16} color={color} />
          <Text style={[styles.slotBadgeText, { color }]}>{label}</Text>
        </View>
      </View>

      {entry && recipe ? (
        <View style={styles.slotCardsGroup}>
          <View style={styles.mealCard}>
            {recipe.immagine ? (
              <Image source={{ uri: recipe.immagine }} style={styles.mealImage} contentFit="cover" cachePolicy="disk" />
            ) : (
              <View style={[styles.mealImage, styles.mealImagePlaceholder]}>
                <Ionicons name="restaurant-outline" size={24} color="#A3B2A6" />
              </View>
            )}
            <View style={styles.mealInfo}>
              <Text style={[styles.mealCategory, { color }]}>{recipe.categoria}</Text>
              <Text style={styles.mealTitle} numberOfLines={2}>{recipe.titolo}</Text>
              <View style={styles.mealMeta}>
                <Ionicons name="time-outline" size={12} color="#7E8B80" style={{ marginRight: 3 }} />
                <Text style={styles.mealMetaText}>{recipe.tempi.tempo_totale_minuti} min</Text>
                <Text style={styles.mealMetaDivider}>·</Text>
                <Ionicons name="people-outline" size={12} color="#7E8B80" style={{ marginRight: 3 }} />
                <Text style={styles.mealMetaText}>{entry.servings} porz.</Text>
              </View>
            </View>

            <View style={styles.mealActions}>
              <TouchableOpacity style={styles.viewMealBtn} onPress={() => onView(recipe)} activeOpacity={0.7}>
                <Ionicons name="book-outline" size={17} color="#4A6B53" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.swapMealBtn} onPress={onAdd} activeOpacity={0.7}>
                <Ionicons name="swap-horizontal" size={17} color="#7E8B80" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteMealBtn} onPress={() => onDelete(entry.id)} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={17} color="#D9534F" />
              </TouchableOpacity>
            </View>
          </View>

          {sideRecipe && (
            <View style={styles.sideMealCard}>
              {sideRecipe.immagine ? (
                <Image source={{ uri: sideRecipe.immagine }} style={styles.mealImage} contentFit="cover" cachePolicy="disk" />
              ) : (
                <View style={[styles.mealImage, styles.mealImagePlaceholder]}>
                  <Ionicons name="leaf-outline" size={24} color="#3A8C7E" />
                </View>
              )}
              <View style={styles.mealInfo}>
                <View style={styles.sideBadgeRow}>
                  <Ionicons name="leaf" size={11} color="#3A8C7E" />
                  <Text style={styles.sideMealCategory}>CONTORNO</Text>
                </View>
                <Text style={styles.mealTitle} numberOfLines={2}>{sideRecipe.titolo}</Text>
                <View style={styles.mealMeta}>
                  <Ionicons name="time-outline" size={12} color="#7E8B80" style={{ marginRight: 3 }} />
                  <Text style={styles.mealMetaText}>{sideRecipe.tempi.tempo_totale_minuti} min</Text>
                  <Text style={styles.mealMetaDivider}>·</Text>
                  <Ionicons name="people-outline" size={12} color="#7E8B80" style={{ marginRight: 3 }} />
                  <Text style={styles.mealMetaText}>{entry.servings} porz.</Text>
                </View>
              </View>

              <View style={styles.mealActions}>
                <TouchableOpacity style={styles.viewMealBtn} onPress={() => onView(sideRecipe)} activeOpacity={0.7}>
                  <Ionicons name="book-outline" size={17} color="#4A6B53" />
                </TouchableOpacity>
                {onSwapSide && (
                  <TouchableOpacity style={styles.swapMealBtn} onPress={onSwapSide} activeOpacity={0.7}>
                    <Ionicons name="swap-horizontal" size={17} color="#7E8B80" />
                  </TouchableOpacity>
                )}
                {onDeleteSide && (
                  <TouchableOpacity style={styles.deleteMealBtn} onPress={() => onDeleteSide(entry.id)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={17} color="#D9534F" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.emptySlot} onPress={onAdd} activeOpacity={0.8}>
          <View style={[styles.addSlotCircle, { backgroundColor: bgColor }]}>
            <Ionicons name="add" size={20} color={color} />
          </View>
          <Text style={styles.emptySlotText}>
            {EMPTY_SLOT_TEXTS[slot]}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBF9F5' },
  mainWrapper: { flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center' },

  autoBanner: {
    backgroundColor: '#2E6B42',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  autoBannerText: { color: '#FFF', fontSize: 13, fontWeight: '600', flex: 1 },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#EAF0EB', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#243328', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '500', color: '#718073' },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  genShoppingBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#4A6B53', paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, gap: 5,
  },
  genShoppingBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  prefsBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EAF0EB', alignItems: 'center', justifyContent: 'center',
  },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  progressBar: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: '#E5EDE7', overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#4A6B53', borderRadius: 2 },
  progressLabel: { fontSize: 11, color: '#7E8B80', fontWeight: '600' },

  toastBanner: {
    backgroundColor: '#3E5C46', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16,
  },
  toastText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 6,
  },
  weekNavBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#EAF0EB', alignItems: 'center', justifyContent: 'center',
  },
  weekNavBtnDisabled: { backgroundColor: '#F2F1EE' },
  weekNavLabel: { fontSize: 13, fontWeight: '700', color: '#2B332B' },

  daysBarWrapper: { paddingVertical: 4 },
  daysBar: { paddingHorizontal: 20, gap: 8 },
  dayChip: {
    width: 58, paddingVertical: 10, borderRadius: 14,
    backgroundColor: '#FFFFFF', alignItems: 'center',
    borderWidth: 1, borderColor: '#ECE7DF',
  },
  dayChipSelected: { backgroundColor: '#4A6B53', borderColor: '#4A6B53' },
  dayChipToday: { borderColor: '#4A6B53', borderWidth: 2 },
  dayChipName: { fontSize: 10, fontWeight: '600', color: '#7E8B80', textTransform: 'uppercase' },
  dayChipNameSelected: { color: '#FFFFFF' },
  dayChipNum: { fontSize: 17, fontWeight: '700', color: '#2B332B', marginTop: 3 },
  dayChipNumSelected: { color: '#FFFFFF' },
  mealDotRow: { flexDirection: 'row', gap: 3, marginTop: 4 },
  mealDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4A6B53' },
  mealDotSelected: { backgroundColor: '#FFF' },

  scrollContent: { flex: 1, paddingHorizontal: 20 },
  dayHeader: {
    marginTop: 12, marginBottom: 14,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  dayHeading: { fontSize: 17, fontWeight: '700', color: '#2B332B' },
  daySub: { fontSize: 12, color: '#7E8B80', marginTop: 2 },
  dayActions: { alignItems: 'flex-end' },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#4A6B53', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, shadowColor: '#4A6B53', shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  generateBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#C07A3A', paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 10, shadowColor: '#C07A3A', shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  completeBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EAF0EB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  regenBtnText: { color: '#4A6B53', fontSize: 13, fontWeight: '700' },

  slotContainer: { marginBottom: 16 },
  slotCardsGroup: { gap: 8 },
  slotHeader: { marginBottom: 8 },
  slotBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 6,
  },
  slotBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  mealCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: '#ECE7DF',
    shadowColor: '#1A2E1F', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  sideMealCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: '#ECE7DF',
    shadowColor: '#1A2E1F', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 5, elevation: 1,
  },
  mealImage: { width: 64, height: 64, borderRadius: 12, marginRight: 12 },
  mealImagePlaceholder: { backgroundColor: '#EAE5DC', alignItems: 'center', justifyContent: 'center' },
  mealInfo: { flex: 1 },
  mealCategory: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  sideBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  sideMealCategory: { fontSize: 10, fontWeight: '700', color: '#3A8C7E', letterSpacing: 0.5 },
  mealTitle: { fontSize: 14, fontWeight: '700', color: '#2B332B', marginTop: 2, lineHeight: 19 },
  mealMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  mealMetaText: { fontSize: 11, color: '#7E8B80', fontWeight: '500' },
  mealMetaDivider: { fontSize: 11, color: '#C5CEC7', marginHorizontal: 4 },
  mealActions: { flexDirection: 'row', gap: 6 },
  viewMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EAF0EB', alignItems: 'center', justifyContent: 'center' },
  swapMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F3EF', alignItems: 'center', justifyContent: 'center' },
  deleteMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FDF0EE', alignItems: 'center', justifyContent: 'center' },
  emptySlot: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#ECE7DF', borderStyle: 'dashed', gap: 12,
  },
  addSlotCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptySlotText: { fontSize: 14, fontWeight: '600', color: '#7E8B80' },
});
