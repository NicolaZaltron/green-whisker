import { SheetModal } from './SheetModal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Toast } from './ui/Toast';
import { Checkbox } from './ui/Checkbox';
import { IconBadge } from './ui/IconBadge';
import { SectionTitle } from './ui/SectionTitle';
import { useCatalogVersion } from '../hooks/useCatalog';
import type { RecipeSummary } from '../types/recipe';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  StatusBar,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Recipe, IngredientItem, RecipeSource } from '../types/recipe';
import { useResponsiveDimensions } from '../hooks/useResponsiveDimensions';
import {
  saveMealPlanEntryDetailed,
  getRecipeNote,
  saveRecipeNote,
  getRecipeDetail,
} from '../db/database';
import { useFavoritesSafe } from '../context/FavoritesContext';
import { getPlannerDays, getPlannerPreferences, MealSlot } from '../services/plannerService';
import { VariantDiet, availableVariantDiets } from '../services/catalogFormat';
import { classifyDiet } from '../utils/dietClassifier';
import { formatTagLabel } from '../constants/simpleTags';
import { scaleIngredient, getScalableIngredients, splitShoppingItemDisplay } from '../utils/servingsScaler';
import {
  formatRecipeShareText,
  shareToTelegram,
  shareToWhatsApp,
  shareNative,
  copyRecipeToClipboard
} from '../utils/shareHelper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { AppTextField } from './ui/AppTextField';
import { cardRadius, radius, size as sizes, space, text, icon } from '../theme/tokens';
import { brandColors, brandTextColors } from '../theme/brandColors';
import { SegmentedControl } from './ui/SegmentedControl';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { CircleButton } from './ui/CircleButton';
import { FavoriteButton } from './ui/FavoriteButton';
import { ModalHeader } from './ui/ModalHeader';
import { Pill } from './ui/Pill';
import { InlineNotice } from './ui/InlineNotice';
import { capitalize } from '../utils/text';

// Meal proposed when opening the recipe planning
function recommendedPlanSlot(recipe: Recipe): MealSlot {
  if (recipe.recommended_slot === 'colazione' || recipe.recommended_slot === 'breakfast') return 'colazione';
  if (recipe.recommended_slot === 'spuntino' || recipe.recommended_slot === 'snack') return 'spuntino_pomeriggio';
  return 'pranzo';
}

interface RecipeModalProps {
  // Original recipe summary: the card body is loaded by id. Variants are shown with the cards
  recipe: RecipeSummary | null;
  variants?: RecipeSummary[];
  visible: boolean;
  onClose: () => void;
  onFavoriteChange?: (isFav: boolean) => void;
  onEdit?: (recipe: Recipe) => void;
  onGenerateVariant?: (source: RecipeSummary, diet: VariantDiet) => void;
  // Diet of the variant being generated: shows the spinner on its button
  generatingDiet?: VariantDiet | null;
  // Last variant generation error, shown above the version selector
  variantError?: string | null;
  onDismissVariantError?: () => void;
  onRegenerateVariant?: (variant: RecipeSummary) => void;
  onDeleteVariant?: (variant: RecipeSummary) => void;
}

// The card itself works on the full recipe: RecipeModal below loads it
interface RecipeModalCardProps extends Omit<RecipeModalProps, 'recipe' | 'variants'> {
  recipe: Recipe | null;
  variants?: Recipe[];
}

const VERSION_LABELS: Record<VariantDiet, string> = { vegetarian: 'recipeDetail.versionVegetarian', vegan: 'recipeDetail.versionVegan' };

const RecipeModalCard: React.FC<RecipeModalCardProps> = ({
  recipe: baseRecipe,
  variants = [],
  visible,
  onClose,
  onFavoriteChange,
  onEdit,
  onGenerateVariant,
  generatingDiet,
  variantError,
  onDismissVariantError,
  onRegenerateVariant,
  onDeleteVariant,
}) => {
  const { t, i18n } = useTranslation();
  const { width } = useResponsiveDimensions();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const brandText = isDark ? brandTextColors.dark : brandTextColors.light;
  // The chosen version applies only to the open recipe: changing recipe returns to the original
  const [versionChoice, setVersionChoice] = useState<{ baseId?: string; version: 'original' | VariantDiet }>({ version: 'original' });
  const version = versionChoice.baseId === baseRecipe?.id ? versionChoice.version : 'original';
  const activeVariant = version === 'original' ? undefined : variants.find(v => v.diet === version);
  // Everything that follows (ingredients, planner, shopping, sharing, notes) uses the active version
  const recipe = activeVariant ?? baseRecipe;
  const missingDiets = baseRecipe ? availableVariantDiets(baseRecipe, variants) : [];
  const [currentServings, setCurrentServings] = useState<number>(recipe?.servings ?? 1);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  // Synchronous favorite state from global context: the heart applies to the whole group (original and variants)
  const favContext = useFavoritesSafe();
  const favorite = baseRecipe ? (favContext?.isFavorite(baseRecipe.id) ?? false) : false;
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  // Meals and days chosen for planning: one or more of both
  const [selectedSlots, setSelectedSlots] = useState<MealSlot[]>(() => [recipe ? recommendedPlanSlot(recipe) : 'pranzo']);
  // Summary of the plan just saved: replaces the choice panel until closed
  const [planDone, setPlanDone] = useState<string | null>(null);

  // Native driver scroll value for smooth 60fps title fade without JS re-renders

  // Sharing & Personal Notes State
  const [showShareModal, setShowShareModal] = useState(false);
  // "..." menu with regenerate and delete for the active variant
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  // Missing variant tapped: confirmation is asked before generating
  const [pendingVariantDiet, setPendingVariantDiet] = useState<VariantDiet | null>(null);
  const originalDiet = baseRecipe ? (baseRecipe.diet ?? classifyDiet(baseRecipe)) : 'omnivore';
  const originalDietName = originalDiet === 'vegan' || originalDiet === 'vegetarian' ? t(VERSION_LABELS[originalDiet]).toLowerCase() : null;
  const originalLabel = originalDietName ? `${t('recipeDetail.versionOriginal')} (${originalDietName})` : t('recipeDetail.versionOriginal');
  const [showJson, setShowJson] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [includeNotesInShare, setIncludeNotesInShare] = useState(true);
  const [userNote, setUserNote] = useState('');
  const [savedNoteStatus, setSavedNoteStatus] = useState<string | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);

  // Days of the "plan" picker: saved calendar mode, 'week' until loaded (does not block the modal)
  const [calendarMode, setCalendarMode] = useState<'week' | 'rolling'>('week');
  const weekDays = useMemo(() => getPlannerDays(calendarMode, 0, i18n.language.startsWith('en') ? 'en' : 'it').days, [calendarMode, i18n.language]);
  const [selectedDates, setSelectedDates] = useState<string[]>(
    () => {
      const today = weekDays.find(d => d.isToday)?.dateString || weekDays[0]?.dateString;
      return today ? [today] : [];
    }
  );
  // Servings, prepare or already ready, and how to prepare multiple meals: restarts from defaults on every opening
  const [planServings, setPlanServings] = useState(1);
  // Servings to eat per meal: default from planner settings, used only with "prepare once"
  const [planEatServings, setPlanEatServings] = useState(1);
  const [eatDefault, setEatDefault] = useState(1);
  const [planSource, setPlanSource] = useState<RecipeSource>('prepare');
  const [planBatch, setPlanBatch] = useState<'each' | 'once'>('each');
  const [prevVisible, setPrevVisible] = useState(visible);
  // Recipe change: restarts from the new recipe's values (synchronous, during render)
  const [prevRecipeId, setPrevRecipeId] = useState(recipe?.id);
  if (prevRecipeId !== recipe?.id) {
    setPrevRecipeId(recipe?.id);
    if (recipe) {
      setCurrentServings(recipe.servings);
      setCheckedIngredients({});
      setCompletedSteps({});
      setFeedbackMessage(null);
      setShowPlanPicker(false);
      setShowShareModal(false);
      setIsEditingNote(false);
      setSavedNoteStatus(null);
      const todayStr = weekDays.find(d => d.isToday)?.dateString || weekDays[0]?.dateString || '';
      setSelectedDates(todayStr ? [todayStr] : []);
      setPlanDone(null);
      setSelectedSlots([recommendedPlanSlot(recipe)]);
    }
  }
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    if (visible) {
      const today = weekDays.find(d => d.isToday)?.dateString || weekDays[0]?.dateString;
      setSelectedDates(today ? [today] : []);
      setSelectedSlots([recipe ? recommendedPlanSlot(recipe) : 'pranzo']);
      setPlanSource('prepare');
      setPlanBatch('each');
      setPlanDone(null);
      setShowPlanPicker(false);
    }
  }

  // Loads the mode on opening. Today is always in the days of both modes (offset 0).
  useEffect(() => {
    if (!visible) return;
    let active = true;
    getPlannerPreferences().then(p => {
      if (active) {
        setCalendarMode(p.calendarMode);
        setEatDefault(p.servings);
      }
    });
    return () => { active = false; };
  }, [visible]);

  // Async loading of the personal note: the effect does not touch state synchronously
  const recipeId = recipe?.id;
  useEffect(() => {
    if (!recipeId) return;
    let active = true;
    getRecipeNote(recipeId).then(note => {
      if (active) setUserNote(note || '');
    });
    return () => {
      active = false;
    };
  }, [recipeId]);

  if (!recipe || !visible) return null;

  const baseServings = recipe.servings;
  const scale = currentServings / baseServings;
  const scalableIngredients = getScalableIngredients(recipe);
  const hasExternalLink = /^https?:\/\//i.test(recipe.url ?? '');
  // Badge based on the recipe diet (no longer fixed): omnivore, no badge
  const recipeDiet = recipe.diet ?? classifyDiet(recipe);
  const dietBadge = recipeDiet === 'vegan' ? t('recipeDetail.dietVegan') : recipeDiet === 'vegetarian' ? t('recipeDetail.versionVegetarian') : null;

  const slotNames: Record<MealSlot, string> = {
    colazione: 'recipeDetail.slotBreakfast',
    spuntino_mattina: 'recipeDetail.slotSnack',
    pranzo: 'recipeDetail.slotLunch',
    spuntino_pomeriggio: 'recipeDetail.slotSnack',
    cena: 'recipeDetail.slotDinner'
  };
  // Number of meals to plan: each chosen meal for each chosen day
  const planCount = selectedSlots.length * selectedDates.length;
  // To prepare for several meals chosen at once
  // "How to prepare" choice useful only when preparing multiple meals
  const batchApplies = planSource === 'prepare' && planCount > 1;
  const cookOnce = batchApplies && planBatch === 'once';
  // Planned servings: those per meal multiplied by the chosen meals
  const plannedServings = planEatServings * planCount;
  // Open planning: takes the whole content area, in place of the recipe card
  const planOpen = showPlanPicker || planDone !== null;
  const planTitle = (
    <Text style={styles.planSheetTitle}>{t('recipeDetail.planScreenTitle')}</Text>
  );

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 2800);
  };

  const handleToggleFavorite = async () => {
    if (!baseRecipe || !favContext) return;
    const newFav = await favContext.toggleFavorite(baseRecipe.id);
    if (onFavoriteChange) onFavoriteChange(newFav);
    showToast(newFav ? t('recipeDetail.favoriteAdded') : t('recipeDetail.favoriteRemoved'));
  };

  const changeServings = (delta: number) => {
    const next = currentServings + delta;
    if (next >= 1 && next <= 24) {
      setCurrentServings(next);
    }
  };

  const toggleIngredient = (key: string) => {
    setCheckedIngredients(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleStep = (idx: number) => {
    setCompletedSteps(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Name and quantity separated: name on the left, quantity aligned right
  const formatScaledIngredient = (item: IngredientItem) => {
    const scaled = scaleIngredient(item.amount, item.unit, item.ingredient, item.text, scale);
    return splitShoppingItemDisplay(scaled.formattedText, scaled.name, scaled.scaledAmount, scaled.unit);
  };

  const toggleSlot = (slot: MealSlot) => {
    setSelectedSlots(prev => (prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]));
  };

  const toggleDate = (dateStr: string) => {
    setSelectedDates(prev => (prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]));
  };

  const openPlanPicker = () => {
    setPlanDone(null);
    setPlanServings(currentServings);
    setPlanEatServings(eatDefault);
    setShowPlanPicker(true);
  };

  const changePlanServings = (delta: number) => {
    setPlanServings(current => Math.min(24, Math.max(1, current + delta)));
  };

  const changePlanEatServings = (delta: number) => {
    setPlanEatServings(current => Math.min(24, Math.max(1, current + delta)));
  };

  const handleScheduleMeal = async () => {
    if (planCount === 0) return;
    // Meals and days in calendar order, as in the summary
    const slots = (['colazione', 'spuntino_mattina', 'pranzo', 'spuntino_pomeriggio', 'cena'] as MealSlot[])
      .filter(s => selectedSlots.includes(s));
    const days = weekDays.filter(d => selectedDates.includes(d.dateString));
    const entries = days.flatMap(day => slots.map(slot => ({ date: day.dateString, slot })));
    try {
      // Single preparation: the first entry prepares the chosen servings, the following are already ready.
      // Servings eaten on later days are a user choice: no automatic count
      await Promise.all(entries.map((entry, index) => saveMealPlanEntryDetailed({
        date: entry.date,
        slot: entry.slot,
        kind: 'recipe',
        recipeId: recipe.id,
        recipeSource: cookOnce && index > 0 ? 'ready' : planSource,
        // With "prepare once" the first entry has the prepared servings, the others those eaten per meal
        servings: cookOnce && index > 0 ? planEatServings : planServings,
      })));

      setShowPlanPicker(false);
      const slotLabels = slots.map(slot => t(slotNames[slot]));
      const dayLabels = days.map(d => `${d.dayShort} ${d.dayNumber}`);
      setPlanDone(t('recipeDetail.plannedSummary', {
        count: planCount,
        slots: slotLabels.join(', '),
        days: dayLabels.join(', ')
      }));
    } catch (e) {
      console.error('handleScheduleMeal error', e);
      showToast(t('errors.somethingWentWrong'));
    }
  };

  const handleSaveNote = async () => {
    try {
      await saveRecipeNote(recipe.id, userNote);
      setIsEditingNote(false);
      setSavedNoteStatus(t('recipeDetail.noteSaved'));
      showToast(t('recipeDetail.noteSavedToast'));
      setTimeout(() => setSavedNoteStatus(null), 3000);
    } catch (e) {
      console.error('handleSaveNote error', e);
      showToast(t('errors.somethingWentWrong'));
    }
  };

  const getShareText = () => {
    const scaledList = scalableIngredients.map(item => {
      const sc = scaleIngredient(item.amount, item.unit, item.ingredient, item.text, scale);
      return {
        ...item,
        amount: sc.scaledAmount ?? null,
        text: sc.formattedText,
      };
    });
    return formatRecipeShareText(
      recipe,
      scaledList,
      currentServings,
      includeNotesInShare ? userNote : undefined
    );
  };

  const handleShareTelegram = async () => {
    const shareText = getShareText();
    const ok = await shareToTelegram(shareText);
    if (ok) {
      setShowShareModal(false);
      showToast(t('recipeDetail.openingTelegram'));
    }
  };

  const handleShareWhatsApp = async () => {
    const shareText = getShareText();
    const ok = await shareToWhatsApp(shareText);
    if (ok) {
      setShowShareModal(false);
      showToast(t('recipeDetail.openingWhatsApp'));
    }
  };

  const handleShareNative = async () => {
    const shareText = getShareText();
    setShowShareModal(false);
    await shareNative(recipe.title, shareText);
  };

  const handleCopyClipboard = async () => {
    const shareText = getShareText();
    const ok = await copyRecipeToClipboard(shareText);
    if (ok) {
      setShowShareModal(false);
      showToast(t('recipeDetail.copiedToClipboard'));
    }
  };

  // Group detailed ingredients by section
  const sections: { title: string; items: IngredientItem[] }[] = [];
  const secMap: Record<string, IngredientItem[]> = {};

  scalableIngredients.forEach(item => {
    const sec = item.section || 'Ingredienti';
    if (!secMap[sec]) {
      secMap[sec] = [];
      sections.push({ title: sec, items: secMap[sec] });
    }
    secMap[sec].push(item);
  });

  // The JSON opens from the share menu: that panel is closed first, so two modals do not overlap
  const handleShowJson = () => {
    setShowShareModal(false);
    setJsonCopied(false);
    setTimeout(() => setShowJson(true), 300);
  };

  const favoriteButton = (
    <FavoriteButton
      isFavorite={favorite}
      onPress={handleToggleFavorite}
      accessibilityLabel={t('recipeDetail.favorites')}
    />
  );

  // Compact servings stepper (minus, number, plus), aligned to the right
  const renderStepper = (value: number, onChange: (delta: number) => void) => (
    <View style={styles.scalerControls}>
      <CircleButton icon="remove" size="S" onPress={() => onChange(-1)} disabled={value <= 1} accessibilityLabel={t('recipeDetail.servingsLabel')} />
      <Text style={styles.scaleNumber}>{value}</Text>
      <CircleButton icon="add" size="S" onPress={() => onChange(1)} accessibilityLabel={t('recipeDetail.servingsLabel')} />
    </View>
  );

  return (
    <SheetModal visible={visible} onClose={onClose} fullScreen>
      <View style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={[styles.modalWrapper, width >= 768 && styles.modalWrapperTablet]}>
          <ModalHeader title={recipe.title} onClose={onClose} closeLabel={t('common.close')} titleMaxLines={3} />

          {variantError ? (
            <View style={styles.versionRow}>
              <View style={styles.versionControl}>
                <InlineNotice tone="danger" icon="alert-circle-outline" text={variantError} />
              </View>
              <CircleButton icon="close" size="S" onPress={() => onDismissVariantError?.()} accessibilityLabel={t('common.close')} />
            </View>
          ) : null}

          {/* Version selector: original, existing variants and those still to be generated (dashed) */}
          {recipe && baseRecipe && (variants.length > 0 || missingDiets.length > 0) && (
            <View style={styles.versionBar}>
              <View style={styles.versionRow}>
                <View style={styles.versionControl}>
                  <SegmentedControl
                    accessibilityLabel={t('recipeDetail.versionSelector')}
                    options={[
                      { key: 'original', label: originalLabel },
                      ...variants.map(v => ({ key: v.diet as VariantDiet, label: t(VERSION_LABELS[v.diet as VariantDiet]) })),
                      // Not generated yet: a tap asks for confirmation, ignored while another one is generating
                      ...missingDiets.map(diet => ({
                        key: diet,
                        label: generatingDiet === diet ? t('recipeDetail.generating') : t(VERSION_LABELS[diet]),
                        icon: 'sparkles-outline' as const,
                        dashed: true,
                      })),
                    ]}
                    value={version}
                    onChange={key => {
                      if (missingDiets.includes(key as VariantDiet)) {
                        if (!generatingDiet) setPendingVariantDiet(key as VariantDiet);
                        return;
                      }
                      setVersionChoice({ baseId: baseRecipe.id, version: key as 'original' | VariantDiet });
                    }}
                  />
                </View>
                {activeVariant && (
                  <CircleButton
                    icon="ellipsis-horizontal"
                    size="M"
                    variant="outline"
                    onPress={() => setVariantMenuOpen(true)}
                    accessibilityLabel={t('recipeDetail.variantActions')}
                  />
                )}
              </View>
            </View>
          )}

          {/* Confirmation before generating a variant: stays in addition to the original recipe */}
          <ConfirmDialog
            visible={pendingVariantDiet !== null}
            title={pendingVariantDiet ? t('recipeDetail.confirmVariantTitle', { diet: t(VERSION_LABELS[pendingVariantDiet]) }) : ''}
            body={t('recipeDetail.confirmVariantBody')}
            confirmLabel={t('recipeDetail.generateVariantAction')}
            cancelLabel={t('common.close')}
            onConfirm={() => {
              const diet = pendingVariantDiet;
              setPendingVariantDiet(null);
              if (diet && baseRecipe) onGenerateVariant?.(baseRecipe, diet);
            }}
            onCancel={() => setPendingVariantDiet(null)}
          />

          {/* Actions on the active variant: regenerate and delete */}
          {activeVariant && (
            <SheetModal visible={variantMenuOpen} onClose={() => setVariantMenuOpen(false)}>
                <View style={styles.variantMenu}>
                  <TouchableOpacity
                    style={styles.variantMenuItem}
                    onPress={() => {
                      setVariantMenuOpen(false);
                      onRegenerateVariant?.(activeVariant);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh" size={icon.md} color={colors.primaryText} />
                    <Text style={styles.variantMenuText}>{t('recipeDetail.regenerateVariant')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.variantMenuItem}
                    onPress={() => {
                      setVariantMenuOpen(false);
                      onDeleteVariant?.(activeVariant);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={icon.md} color={colors.danger} />
                    <Text style={[styles.variantMenuText, { color: colors.danger }]}>{t('recipeDetail.deleteVariant')}</Text>
                  </TouchableOpacity>
                </View>
            </SheetModal>
          )}

          {/* Feedback Toast */}
          {feedbackMessage && (
            <Toast message={feedbackMessage} position="top" />
          )}

          {!planOpen && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Main image; without an image there is no picture area, only the diet badge stays, on its own row */}
            {recipe.image ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: recipe.image }}
                  style={styles.image}
                  contentFit="cover"
                  transition={250}
                  cachePolicy="disk"
                />
                {dietBadge && (
                  <View style={styles.plantBadge}>
                    <Pill size="S" variant="primary" icon="leaf" label={capitalize(dietBadge)} />
                  </View>
                )}
                {/* Favorite in the photo corner, as in the home cards */}
                <View style={styles.favoriteOnImage}>{favoriteButton}</View>
              </View>
            ) : (
              dietBadge && (
                <View style={styles.plantBadgeRow}>
                  <Pill size="S" variant="primary" icon="leaf" label={capitalize(dietBadge)} />
                </View>
              )
            )}

            {/* Content Body */}
            <View style={styles.content}>
              <View style={styles.badgeLine}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.badgeScroll}
                contentContainerStyle={styles.badgeRow}
              >
                <Pill
                  size="S"
                  variant="primary"
                  label={capitalize(t('categories.' + (recipe.subcategory || recipe.category), { defaultValue: recipe.subcategory || recipe.category }))}
                />
                {!!recipe.macro_category && recipe.macro_category !== recipe.category && (
                  <Pill
                    size="S"
                    variant="primary"
                    label={capitalize(t('categories.' + recipe.macro_category, { defaultValue: recipe.macro_category }))}
                  />
                )}
                <Pill
                  size="S"
                  variant="accent"
                  icon="speedometer-outline"
                  label={capitalize(t(`explore.advanced.difficultyLevel.${recipe.difficulty}`, { defaultValue: recipe.difficulty }))}
                />
              </ScrollView>
              {/* Without a photo the favorite sits at the right of the badges */}
              {!recipe.image && <View style={styles.favoriteInline}>{favoriteButton}</View>}
              </View>

              {/* Quick Metrics Bar */}
              <Card style={styles.metricsBar}>
                <View style={styles.metricItem}>
                  <Ionicons name="time-outline" size={icon.lg} color={colors.primaryText} />
                  <Text style={styles.metricLabel}>{t('recipeDetail.metricTime')}</Text>
                  <Text style={styles.metricValue}>{t('common.minutes', { count: recipe.times.total_minutes })}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="people-outline" size={icon.lg} color={colors.primaryText} />
                  <Text style={styles.metricLabel}>{t('recipeDetail.metricServings')}</Text>
                  <Text style={styles.metricValue}>{currentServings}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="bar-chart-outline" size={icon.lg} color={colors.primaryText} />
                  <Text style={styles.metricLabel}>{t('recipeDetail.metricLevel')}</Text>
                  <Text style={styles.metricValue}>{t(`explore.advanced.difficultyLevel.${recipe.difficulty}`, { defaultValue: recipe.difficulty })}</Text>
                </View>
              </Card>

              {/* Dynamic Servings Scaler with Quick Presets */}
              <Card style={styles.scalerCard}>
                <View style={styles.scalerInfo}>
                  <Text style={styles.scalerTitle}>{t('recipeDetail.ingredientsTitle')}</Text>
                  <Text style={styles.scalerSub}>
                    {scale !== 1 ? t('recipeDetail.recalculatedFor', { servings: currentServings }) : (recipe.servings_text || t('recipeDetail.servingsBase', { servings: baseServings }))}
                    {scale !== 1 && t('recipeDetail.baseServings', { servings: baseServings })}
                  </Text>
                </View>

                <View style={styles.scalerRightCol}>
                  <View style={styles.scalerPresetsRow}>
                    {[1, 2, 4, 6].map(num => (
                      <Pill
                        key={num}
                        size="S"
                        label={t('recipeDetail.presetShort', { n: num })}
                        selected={currentServings === num}
                        onPress={() => setCurrentServings(num)}
                      />
                    ))}
                  </View>

                  {renderStepper(currentServings, changeServings)}
                </View>
              </Card>

              {/* Ingredients Sections */}
              <View style={styles.ingredientsContainer}>
                {sections.map((sec, sIdx) => (
                  <View key={sIdx} style={styles.sectionBlock}>
                    {sec.title !== 'Principale' && sec.title !== 'Ingredienti' && (
                      <Text style={styles.sectionHeading}>{sec.title}</Text>
                    )}
                    {sec.items.map((ing, iIdx) => {
                      const key = `${sIdx}-${iIdx}`;
                      const isChecked = !!checkedIngredients[key];
                      const { displayName, displayQuantity } = formatScaledIngredient(ing);

                      return (
                        <View key={key} style={[styles.ingredientRow, isChecked && styles.ingredientRowChecked]}>
                          <TouchableOpacity
                            style={styles.ingredientMainTouch}
                            onPress={() => toggleIngredient(key)}
                            activeOpacity={0.6}
                          >
                            <View style={styles.checkbox}>
                              <Checkbox
                                checked={isChecked}
                                onToggle={() => toggleIngredient(key)}
                                accessibilityLabel={displayName}
                              />
                            </View>
                            <Text style={[styles.ingredientText, isChecked && styles.ingredientTextChecked]}>
                              {displayName}
                            </Text>
                            {displayQuantity !== '' && (
                              <Text style={[styles.ingredientQuantity, isChecked && styles.ingredientTextChecked]}>
                                {displayQuantity}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Instructions */}
              <View style={styles.instructionsSection}>
                <SectionTitle title={t('recipeDetail.preparation')} />
                {(recipe.instructions || []).map((step, idx) => {
                  const isDone = !!completedSteps[idx];
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.stepCard, isDone && styles.stepCardDone]}
                      onPress={() => toggleStep(idx)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.stepBadge}>
                        <IconBadge size="S" icon={isDone ? 'checkmark' : undefined} text={String(idx + 1)} />
                      </View>
                      <Text style={[styles.stepText, isDone && styles.stepTextDone]}>
                        {step}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Personal Notes Section */}
              <View style={styles.notesCard}>
                <View style={styles.notesHeader}>
                  <View style={styles.notesTitleRow}>
                    <Ionicons name="journal-outline" size={icon.md} color={colors.primaryText} />
                    <Text style={styles.notesTitle}>{t('recipeDetail.notesTitle')}</Text>
                  </View>
                  {savedNoteStatus && (
                    <Pill size="S" variant="primary" icon="checkmark-circle" label={capitalize(savedNoteStatus)} />
                  )}
                </View>
                <AppTextField
                  style={styles.notesField}
                  placeholder={t('recipeDetail.notesPlaceholder')}
                  multiline
                  numberOfLines={3}
                  value={userNote}
                  onChangeText={(txt) => {
                    setUserNote(txt);
                    setIsEditingNote(true);
                  }}
                  onBlur={() => {
                    if (isEditingNote) {
                      handleSaveNote();
                    }
                  }}
                />
                {isEditingNote && (
                  <View style={styles.notesActionRow}>
                    <Button label={t('recipeDetail.saveNote')} icon="checkmark" onPress={handleSaveNote} />
                  </View>
                )}
              </View>

              {/* Tips & Storage */}
              {recipe.tips && recipe.tips.length > 0 && (
                <View style={styles.tipsBox}>
                  <View style={styles.tipsHeader}>
                    <Ionicons name="bulb-outline" size={icon.lg} color={colors.primaryText} />
                    <Text style={styles.tipsTitle}>{t('recipeDetail.tipsTitle')}</Text>
                  </View>
                  {recipe.tips.map((sugg, idx) => (
                    <Text key={idx} style={styles.tipsText}>
                      • {sugg}
                    </Text>
                  ))}
                </View>
              )}

              {recipe.tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {recipe.tags.map((tag, idx) => (
                    <Pill key={idx} size="S" label={`#${capitalize(formatTagLabel(tag, t))}`} />
                  ))}
                </View>
              )}

              <View style={{ height: 20 }} />
            </View>
          </ScrollView>
          )}

          {/* Full-height planning: after confirmation the panel gives way to the summary, until closed */}
          {planDone ? (
            <View style={styles.planScreen}>
              <View style={styles.planSheet}>
                <View style={styles.planGrabber} />
                {planTitle}
              <View style={styles.planDoneWrap}>
              <View style={styles.planDoneHeader}>
                <Ionicons name="checkmark-circle" size={30} color={colors.primary} />
                <View style={styles.planDoneText}>
                  <Text style={styles.planDoneTitle}>{t('recipeDetail.plannedTitle')}</Text>
                  <Text style={styles.planDoneBody}>{planDone}</Text>
                </View>
              </View>
              </View>
              </View>
            </View>
          ) : showPlanPicker && (
            <View style={styles.planScreen}>
              <View style={styles.planSheet}>
                <View style={styles.planGrabber} />
                {planTitle}
              <ScrollView
                style={styles.planScroll}
                contentContainerStyle={styles.planScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
              <View style={styles.planSection}>
                <Text style={styles.planQuestion}>{t('mealPicker.recipeSourceQuestion')}</Text>
                <View style={styles.planChipRow}>
                  <SegmentedControl
                    accessibilityLabel={t('mealPicker.recipeSourceQuestion')}
                    options={(['prepare', 'ready'] as RecipeSource[]).map(option => ({ key: option, label: t(`mealPicker.recipeSource.${option}`) }))}
                    value={planSource}
                    onChange={key => setPlanSource(key as RecipeSource)}
                  />
                </View>
              </View>

              <View style={styles.planSection}>
                <View style={styles.planRow}>
                  <Text style={styles.planLabel}>
                    {t(planSource === 'prepare' ? 'mealPicker.servingsToPrepare' : 'mealPicker.servingsToEat')}
                  </Text>
                  {renderStepper(planServings, changePlanServings)}
                </View>
              </View>

              <View style={styles.planSection}>
                <Text style={styles.planQuestion}>{t('recipeDetail.choosePlanTime')}</Text>

              <View style={styles.slotToggleRow}>
                <Pill fill size="M" icon="cafe-outline" label={t('recipeDetail.slotBreakfast')} selected={selectedSlots.includes('colazione')} onPress={() => toggleSlot('colazione')} />
                <Pill fill size="M" icon="sunny-outline" label={t('recipeDetail.slotLunch')} selected={selectedSlots.includes('pranzo')} onPress={() => toggleSlot('pranzo')} />
                <Pill fill size="M" icon="nutrition-outline" label={t('recipeDetail.slotSnack')} selected={(selectedSlots.includes('spuntino_mattina') || selectedSlots.includes('spuntino_pomeriggio'))} onPress={() => toggleSlot('spuntino_pomeriggio')} />
                <Pill fill size="M" icon="moon-outline" label={t('recipeDetail.slotDinner')} selected={selectedSlots.includes('cena')} onPress={() => toggleSlot('cena')} />
              </View>

              <View style={styles.daysRow}>
                {weekDays.map(d => (
                  <Pill
                    key={d.dateString}
                    size="M"
                    variant={d.isToday ? 'primary' : 'neutral'}
                    label={`${d.dayShort} ${d.dayNumber}`}
                    selected={selectedDates.includes(d.dateString)}
                    onPress={() => toggleDate(d.dateString)}
                  />
                ))}
              </View>
              </View>

              <View style={styles.planSection}>
                {/* Always present, with the same height: when they do not apply they are disabled, so the content does not shift */}
                <Text style={styles.planQuestion}>{t('recipeDetail.planBatchQuestion')}</Text>
                <View style={[styles.planChipRow, !batchApplies && styles.planDisabled]}>
                  <SegmentedControl
                    accessibilityLabel={t('recipeDetail.planBatchQuestion')}
                    options={(['each', 'once'] as const).map(option => ({ key: option, label: t(option === 'each' ? 'recipeDetail.planBatchEach' : 'recipeDetail.planBatchOnce') }))}
                    value={planBatch}
                    onChange={key => setPlanBatch(key as typeof planBatch)}
                    disabled={!batchApplies}
                  />
                </View>
                {cookOnce && (
                  <View style={styles.planRow}>
                    <Text style={styles.planLabel}>{t('recipeDetail.planServingsPerMeal')}</Text>
                    {renderStepper(planEatServings, changePlanEatServings)}
                  </View>
                )}
                <View style={styles.planNoticeSlot}>
                  {!batchApplies ? (
                    <View style={styles.planNotice}>
                      <Ionicons name="information-circle-outline" size={icon.sm} color={colors.textMuted} />
                      <Text style={styles.planNoticeTextMuted}>
                        {t(planSource === 'prepare' ? 'recipeDetail.planBatchNeedsMeals' : 'recipeDetail.planBatchNeedsPrepare')}
                      </Text>
                    </View>
                  ) : cookOnce && plannedServings > planServings && (
                    <View style={styles.planNotice}>
                      <Ionicons name="information-circle-outline" size={icon.sm} color={colors.textSecondary} />
                      <Text style={styles.planNoticeText}>
                        {t('recipeDetail.planServingsExceed', { planned: plannedServings, prepared: planServings })}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              </ScrollView>
              </View>
            </View>
          )}

          {/* Bottom bar: plan (with the X next to the confirmation) and secondary actions below */}
          <View style={styles.stickyActionBar}>
            <View style={styles.stickyPlanRow}>
              <View style={styles.stickyPlanBtn}>
                <Button
                  size="XL"
                  label={planDone
                    ? t('recipeDetail.plannedDone')
                    : showPlanPicker
                      ? t('recipeDetail.confirmInPlanCount', { count: planCount })
                      : t('recipeDetail.addToPlan', { servings: currentServings })}
                  icon={!showPlanPicker && !planDone ? 'chevron-up' : undefined}
                  disabled={showPlanPicker && planCount === 0}
                  onPress={() => {
                    if (planDone) {
                      setPlanDone(null);
                    } else if (showPlanPicker) {
                      handleScheduleMeal();
                    } else {
                      openPlanPicker();
                    }
                  }}
                />
              </View>
              {showPlanPicker && (
                <CircleButton icon="close" variant="plain" onPress={() => setShowPlanPicker(false)} accessibilityLabel={t('common.close')} />
              )}
            </View>
            <View style={styles.stickyToolsRow}>
              {onEdit && (
                <View style={styles.stickyToolBtn}>
                  <Button variant="secondary" icon="create-outline" label={t('recipeDetail.edit')} onPress={() => onEdit(recipe)} />
                </View>
              )}
              <View style={styles.stickyToolBtn}>
                <Button variant="secondary" icon="share-social-outline" label={t('recipeDetail.shareRecipe')} onPress={() => setShowShareModal(true)} />
              </View>
              {hasExternalLink && (
                <View style={styles.stickyToolBtn}>
                  <Button variant="secondary" icon="open-outline" label={t('recipeDetail.openOnWeb')} onPress={() => Linking.openURL(recipe.url)} />
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Share Modal Dialog */}
        <SheetModal visible={showJson} onClose={() => setShowJson(false)}>
            <View style={styles.jsonCard}>
              <View style={styles.jsonHeader}>
                <Text style={styles.jsonTitle}>{t('recipeDetail.recipeJson')}</Text>
                <CircleButton icon="close" variant="plain" onPress={() => setShowJson(false)} accessibilityLabel={t('recipeDetail.close')} />
              </View>
              <ScrollView style={styles.jsonScroll} contentContainerStyle={styles.jsonScrollContent}>
                <Text selectable style={styles.jsonText}>{JSON.stringify(recipe, null, 2)}</Text>
              </ScrollView>
              <View style={styles.jsonCopyBtn}>
                <Button
                  size="XL"
                  icon={jsonCopied ? 'checkmark' : 'copy-outline'}
                  label={jsonCopied ? t('recipeDetail.copied') : t('recipeDetail.copyToClipboard')}
                  onPress={async () => {
                    await Clipboard.setStringAsync(JSON.stringify(recipe, null, 2));
                    setJsonCopied(true);
                  }}
                />
              </View>
            </View>
        </SheetModal>

        <SheetModal visible={showShareModal} onClose={() => setShowShareModal(false)}>
            <View style={styles.shareSheet}>
              <View style={styles.shareSheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareSheetTitle}>{t('recipeDetail.shareRecipeTitle')}</Text>
                  <Text style={styles.shareSheetSub} numberOfLines={1}>
                    {t('recipeDetail.shareSubtitle', { title: recipe.title, count: currentServings })}
                  </Text>
                </View>
                <CircleButton icon="close" variant="plain" onPress={() => setShowShareModal(false)} accessibilityLabel={t('common.close')} />
              </View>

              {/* Note inclusion toggle if note exists */}
              {userNote.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.includeNotesToggle}
                  onPress={() => setIncludeNotesInShare(!includeNotesInShare)}
                  activeOpacity={0.7}
                >
                  <View style={styles.includeNotesBox}>
                    <Checkbox
                      checked={includeNotesInShare}
                      onToggle={() => setIncludeNotesInShare(!includeNotesInShare)}
                      accessibilityLabel={t('recipeDetail.includeNotes')}
                    />
                  </View>
                  <Text style={styles.includeNotesText}>{t('recipeDetail.includeNotes')}</Text>
                </TouchableOpacity>
              )}

              {/* Share Channels */}
              <View style={styles.shareGrid}>
                {/* Telegram */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionTelegram]}
                  onPress={handleShareTelegram}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: brandColors.telegram }]}>
                    <Ionicons name="paper-plane" size={icon.md} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: brandText.telegram }]}>Telegram</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.telegramSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={icon.md} color={brandColors.telegram} />
                </TouchableOpacity>

                {/* WhatsApp */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionWhatsapp]}
                  onPress={handleShareWhatsApp}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: brandColors.whatsapp }]}>
                    <Ionicons name="logo-whatsapp" size={icon.md} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: brandText.whatsapp }]}>WhatsApp</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.whatsappSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={icon.md} color={brandColors.whatsapp} />
                </TouchableOpacity>

                {/* Native System Share */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionNative]}
                  onPress={handleShareNative}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: colors.primary }]}>
                    <Ionicons name="share-outline" size={icon.md} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: colors.primaryText }]}>{t('recipeDetail.otherApps')}</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.systemShareSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={icon.md} color={colors.primaryText} />
                </TouchableOpacity>

                {/* Copy to Clipboard */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionClipboard]}
                  onPress={handleCopyClipboard}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: colors.neutralStrong }]}>
                    <Ionicons name="copy-outline" size={icon.md} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: colors.neutralText }]}>{t('recipeDetail.copyRecipeTitle')}</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.copyRecipeSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={icon.md} color={colors.neutralIcon} />
                </TouchableOpacity>

                {/* View JSON */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionNative]}
                  onPress={handleShowJson}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: colors.primary }]}>
                    <Ionicons name="code-slash-outline" size={icon.md} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: colors.primaryText }]}>{t('recipeDetail.showRecipeJson')}</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.jsonSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={icon.md} color={colors.primaryText} />
                </TouchableOpacity>
              </View>
            </View>
        </SheetModal>
      </View>
    </SheetModal>
  );
};

const makeStyles = (colors: Palette, isDark: boolean) => StyleSheet.create({
  jsonCard: { padding: space.xxl },
  jsonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  jsonTitle: { fontSize: text.page, fontWeight: '700', color: colors.text },
  // Scrollable area with height limited by the card: the JSON scrolls inside it
  jsonScroll: { flexShrink: 1, minHeight: 200, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm },
  jsonScrollContent: { padding: space.lg },
  jsonText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: text.label,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: space.lg,
    textAlignVertical: 'top',
  },
  jsonCopyBtn: { marginTop: space.lg },
  versionBar: { paddingHorizontal: space.xxxl, paddingTop: space.md, paddingBottom: space.xs, gap: space.md },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  // Takes the row space left by the menu button; the segmented control fills it
  versionControl: { flex: 1, minWidth: 0 },
  variantMenu: { padding: space.md },
  variantMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
  },
  variantMenuText: { fontSize: text.title, fontWeight: '600', color: colors.text },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalWrapper: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  modalWrapperTablet: {
    maxWidth: 1200,
    alignSelf: 'center',
    borderRadius: cardRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Same structure as the settings page, which renders aligned on Android: no explicit width on the scroller
  scroll: {
    flex: 1,
  },
  // Top space goes on the scroll content, not on the photo: on Android a margin on the aspect-ratio photo shifts it
  scrollContent: {
    paddingTop: space.md,
    paddingBottom: space.huge,
  },
  imageContainer: {
    alignSelf: 'stretch',
    marginHorizontal: space.huge,
    aspectRatio: 16 / 10,
    maxHeight: 400,
    backgroundColor: colors.surfaceMuted,
    borderRadius: cardRadius,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  plantBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
  },
  plantBadgeRow: { paddingHorizontal: space.xxxl, paddingTop: space.md, alignItems: 'flex-start' },
  content: {
    padding: space.huge,
  },
  badgeLine: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  favoriteOnImage: { position: 'absolute', top: space.md, right: space.md },
  favoriteInline: { marginLeft: 'auto' },
  badgeScroll: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  title: {
    fontSize: text.page,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 32,
    marginBottom: space.xxxl,
  },
  metricsBar: {
    flexDirection: 'row',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    marginBottom: space.xxxl,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: text.label,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: space.xs,
  },
  metricValue: {
    fontSize: text.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  // Sticky Action Bar & Plan Drawer Styles
  stickyPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  stickyPlanBtn: { flex: 1 },
  stickyToolsRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  stickyToolBtn: { flex: 1 },
  stickyActionBar: {
    paddingHorizontal: space.xxxl,
    paddingVertical: space.xl,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.lg,
  },
  planDoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
    marginBottom: space.xxl,
    paddingHorizontal: space.xxxl,
    paddingTop: space.md,
  },
  planDoneText: { flex: 1 },
  planDoneTitle: { fontSize: text.title, fontWeight: '800', color: colors.text },
  planDoneBody: { fontSize: text.body, lineHeight: 20, color: colors.textSecondary, marginTop: 2 },
  // Planning panel: scrollable if the sections do not fit on the screen
  planScreen: { flex: 1, backgroundColor: colors.background },
  // Gray container that comes out of the footer: planning sits inside it, the rest of the screen stays above
  planSheet: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderTopLeftRadius: cardRadius,
    borderTopRightRadius: cardRadius,
    borderTopWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  planScroll: { flex: 1 },
  planScrollContent: { paddingHorizontal: space.xxxl, paddingTop: space.md, paddingBottom: 24 },
  planSection: { gap: space.md, marginBottom: space.xxxl },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg },
  planLabel: { flex: 1, fontSize: text.title, fontWeight: '700', color: colors.text },
  planQuestion: { fontSize: text.title, fontWeight: '700', color: colors.text },
  planChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  planDisabled: { opacity: 0.4 },
  planNoticeSlot: { minHeight: 34, justifyContent: 'center' },
  planNotice: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // Handle at the top of the card: indicates that planning comes out of the bottom button
  planDoneWrap: { flex: 1, justifyContent: 'flex-end' },
  planSheetTitle: { fontSize: text.page, fontWeight: '700', color: colors.text, paddingHorizontal: space.xxxl, paddingTop: space.md, paddingBottom: space.md },
  planGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.full, backgroundColor: colors.borderStrong, marginTop: space.md },
  planNoticeText: { flex: 1, fontSize: text.caption, lineHeight: 16, color: colors.textSecondary },
  planNoticeTextMuted: { flex: 1, fontSize: text.caption, lineHeight: 16, color: colors.textMuted },
  // Chips with long labels: more padding, centered and wrapped text, no flex squeezing them
  slotToggleRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  // Day pills wrap on narrow screens (no fill: seven equal columns would truncate "Mon 12")
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  scalerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.huge,
  },
  scalerInfo: {
    flex: 1,
  },
  scalerTitle: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
  },
  scalerSub: {
    fontSize: text.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  scalerRightCol: {
    alignItems: 'flex-end',
    gap: space.md,
  },
  scalerPresetsRow: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    gap: space.xs,
  },
  scalerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: space.xs,
  },
  scaleNumber: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
    minWidth: 32,
    textAlign: 'center',
  },
  ingredientsContainer: {
    marginBottom: 24,
  },
  sectionBlock: {
    marginBottom: space.xxxl,
  },
  sectionHeading: {
    fontSize: text.body,
    fontWeight: '700',
    color: colors.primaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: space.md,
    marginTop: space.xs,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ingredientMainTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ingredientRowChecked: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.6,
  },
  checkbox: { marginRight: space.xl },
  includeNotesBox: { marginRight: space.md },
  ingredientText: {
    fontSize: text.body,
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
  ingredientQuantity: {
    fontSize: text.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: space.xl,
    textAlign: 'right',
  },
  ingredientTextChecked: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  instructionsSection: {
    marginBottom: 24,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: cardRadius,
    padding: space.xxl,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepCardDone: {
    backgroundColor: colors.surfaceAlt,
    opacity: 0.65,
  },
  stepBadge: { marginRight: space.xl, marginTop: 2 },
  stepText: {
    fontSize: text.body,
    color: colors.text,
    lineHeight: 22,
    flex: 1,
  },
  stepTextDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  tipsBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: cardRadius,
    padding: space.xxxl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.huge,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  tipsTitle: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.primaryText,
  },
  tipsText: {
    fontSize: text.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: space.xs,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.md,
  },
  // Notes Section Styles
  notesCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: cardRadius,
    padding: space.xxxl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.huge,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  notesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  notesTitle: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
  },
  notesField: {
    minHeight: 70,
  },
  notesActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: space.lg,
  },
  // Share Modal & Sheet Styles
  shareSheet: {
    padding: space.huge,
    paddingBottom: 32,
  },
  shareSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.xxxl,
  },
  shareSheetTitle: {
    fontSize: text.page,
    fontWeight: '700',
    color: colors.text,
  },
  shareSheetSub: {
    fontSize: text.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  includeNotesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    padding: space.lg,
    borderRadius: radius.sm,
    marginBottom: space.xxxl,
  },
  includeNotesText: {
    fontSize: text.caption,
    color: colors.text,
    fontWeight: '500',
  },
  shareGrid: {
    gap: space.lg,
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.xl,
    borderRadius: cardRadius,
    borderWidth: 1,
  },
  shareOptionTelegram: {
    backgroundColor: colors.infoSoft,
    borderColor: colors.infoBorder,
  },
  shareOptionWhatsapp: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  shareOptionNative: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  shareOptionClipboard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  shareIconCircle: {
    width: sizes.circle.M,
    height: sizes.circle.M,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.xl,
  },
  shareOptionTextCol: {
    flex: 1,
  },
  shareOptionTitle: {
    fontSize: text.title,
    fontWeight: '700',
  },
  shareOptionSub: {
    fontSize: text.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
});

/** Recipe card for summaries: the recipe and its variants are loaded by id when the card opens. */
export const RecipeModal: React.FC<RecipeModalProps> = ({ recipe, variants = [], ...props }) => {
  const recipeId = recipe?.id;
  const variantKey = variants.map(v => v.id).join('|');
  const catalogVersion = useCatalogVersion();
  const [loaded, setLoaded] = useState<{ id: string; version: number; recipe: Recipe | null; variants: Recipe[] } | null>(null);

  useEffect(() => {
    if (!recipeId) return;
    let active = true;
    const variantIds = variantKey ? variantKey.split('|') : [];
    Promise.all([getRecipeDetail(recipeId), ...variantIds.map(id => getRecipeDetail(id))]).then(([full, ...fullVariants]) => {
      if (active) {
        setLoaded({ id: recipeId, version: catalogVersion, recipe: full, variants: fullVariants.filter((v): v is Recipe => v !== null) });
      }
    });
    return () => {
      active = false;
    };
  }, [recipeId, variantKey, catalogVersion]);

  const isLoaded = !!loaded && loaded.id === recipeId && loaded.version === catalogVersion;
  return (
    <RecipeModalCard
      {...props}
      recipe={isLoaded ? loaded!.recipe : null}
      variants={isLoaded ? loaded!.variants : []}
    />
  );
};
