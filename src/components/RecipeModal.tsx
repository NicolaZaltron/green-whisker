import { SheetModal } from './SheetModal';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Recipe, IngredientItem } from '../types/recipe';
import { useResponsiveDimensions } from '../hooks/useResponsiveDimensions';
import {
  saveMealPlanEntry,
  getRecipeNote,
  saveRecipeNote
} from '../db/database';
import { useFavoritesSafe } from '../context/FavoritesContext';
import { getPlannerDays, getPlannerPreferences, MealSlot } from '../services/plannerService';
import { VariantDiet, availableVariantDiets } from '../services/catalogFormat';
import { classifyDiet } from '../utils/dietClassifier';
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

interface RecipeModalProps {
  // Ricetta originale: le varianti vengono mostrate con le schede
  recipe: Recipe | null;
  variants?: Recipe[];
  visible: boolean;
  onClose: () => void;
  onFavoriteChange?: (isFav: boolean) => void;
  onEdit?: (recipe: Recipe) => void;
  onGenerateVariant?: (source: Recipe, diet: VariantDiet) => void;
  // Dieta della variante in generazione: mostra lo spinner sul suo pulsante
  generatingDiet?: VariantDiet | null;
  onRegenerateVariant?: (variant: Recipe) => void;
  onDeleteVariant?: (variant: Recipe) => void;
}

const VERSION_LABELS: Record<VariantDiet, string> = { vegetarian: 'recipeDetail.versionVegetarian', vegan: 'recipeDetail.versionVegan' };

export const RecipeModal: React.FC<RecipeModalProps> = ({
  recipe: baseRecipe,
  variants = [],
  visible,
  onClose,
  onFavoriteChange,
  onEdit,
  onGenerateVariant,
  generatingDiet,
  onRegenerateVariant,
  onDeleteVariant,
}) => {
  const { t } = useTranslation();
  const { width } = useResponsiveDimensions();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  // La versione scelta vale solo per la ricetta aperta: cambiando ricetta si torna all'originale
  const [versionChoice, setVersionChoice] = useState<{ baseId?: string; version: 'original' | VariantDiet }>({ version: 'original' });
  const version = versionChoice.baseId === baseRecipe?.id ? versionChoice.version : 'original';
  const activeVariant = version === 'original' ? undefined : variants.find(v => v.diet === version);
  // Tutto ciò che segue (ingredienti, planner, spesa, condivisione, note) usa la versione attiva
  const recipe = activeVariant ?? baseRecipe;
  const missingDiets = baseRecipe ? availableVariantDiets(baseRecipe, variants) : [];
  const [currentServings, setCurrentServings] = useState<number>(recipe?.servings || 4);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  // Synchronous favorite state from global context: il cuore vale per tutto il gruppo (originale e varianti)
  const favContext = useFavoritesSafe();
  const favorite = baseRecipe ? (favContext?.isFavorite(baseRecipe.id) ?? false) : false;
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>('pranzo');

  // Native driver scroll value for smooth 60fps title fade without JS re-renders

  // Sharing & Personal Notes State
  const [showShareModal, setShowShareModal] = useState(false);
  // Menu "..." con rigenera ed elimina per la variante attiva
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  // Variante mancante toccata: prima della generazione si chiede conferma
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

  // Giorni del picker "pianifica": modalità calendario salvata, 'week' finché non è caricata (non blocca la modale)
  const [calendarMode, setCalendarMode] = useState<'week' | 'rolling'>('week');
  const weekDays = useMemo(() => getPlannerDays(calendarMode, 0).days, [calendarMode]);
  const [selectedDate, setSelectedDate] = useState<string>(
    () => weekDays.find(d => d.isToday)?.dateString || weekDays[0]?.dateString || ''
  );

  // Carica la modalità all'apertura. Oggi è sempre nei giorni di entrambe le modalità (offset 0).
  useEffect(() => {
    if (!visible) return;
    let active = true;
    getPlannerPreferences().then(p => {
      if (active) setCalendarMode(p.calendarMode);
    });
    return () => { active = false; };
  }, [visible]);

  // Reset & load favorite status and personal notes
  useEffect(() => {
    if (recipe) {
      setCurrentServings(recipe.servings || 4);
      setCheckedIngredients({});
      setCompletedSteps({});
      setFeedbackMessage(null);
      setShowPlanPicker(false);
      setShowShareModal(false);
      setIsEditingNote(false);
      setSavedNoteStatus(null);

      const todayStr = weekDays.find(d => d.isToday)?.dateString || weekDays[0]?.dateString || '';
      setSelectedDate(todayStr);

      if (recipe.recommended_slot === 'colazione' || recipe.recommended_slot === 'breakfast') {
        setSelectedSlot('colazione');
      } else if (recipe.recommended_slot === 'spuntino' || recipe.recommended_slot === 'snack') {
        setSelectedSlot('spuntino_pomeriggio');
      } else {
        setSelectedSlot('pranzo');
      }

      getRecipeNote(recipe.id).then(note => setUserNote(note || ''));
    }
  }, [recipe?.id]);

  if (!recipe || !visible) return null;

  const baseServings = recipe.servings || 4;
  const scale = currentServings / baseServings;
  const scalableIngredients = getScalableIngredients(recipe);
  const hasExternalLink = /^https?:\/\//i.test(recipe.url ?? '');
  // Badge in base alla dieta della ricetta (non più fisso): onnivora, nessun badge
  const recipeDiet = recipe.diet ?? classifyDiet(recipe);
  const dietBadge = recipeDiet === 'vegan' ? t('recipeDetail.dietVegan') : recipeDiet === 'vegetarian' ? t('recipeDetail.versionVegetarian') : null;

  const selectedDayObj = weekDays.find(d => d.dateString === selectedDate) || weekDays[0];
  const selectedDayLabel = selectedDayObj ? `${selectedDayObj.dayName.slice(0, 3)} ${selectedDayObj.dayNumber}` : '';
  const slotNames: Record<MealSlot, string> = {
    colazione: 'recipeDetail.slotBreakfast',
    spuntino_mattina: 'recipeDetail.slotSnack',
    pranzo: 'recipeDetail.slotLunch',
    spuntino_pomeriggio: 'recipeDetail.slotSnack',
    cena: 'recipeDetail.slotDinner'
  };
  const selectedSlotLabel = t(slotNames[selectedSlot] || 'recipeDetail.slotMeal');

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

  // Nome e quantità separati: il nome va a sinistra, la quantità allineata a destra
  const formatScaledIngredient = (item: IngredientItem) => {
    const scaled = scaleIngredient(item.amount, item.unit, item.ingredient, item.text, scale);
    return splitShoppingItemDisplay(scaled.formattedText, scaled.name, scaled.scaledAmount, scaled.unit);
  };

  const handleScheduleMeal = async (dateStr: string) => {
    try {
      // 1. Salva la ricetta nel Meal Planner
      await saveMealPlanEntry({
        date: dateStr,
        slot: selectedSlot,
        recipeId: recipe.id,
        servings: currentServings
      });

      setShowPlanPicker(false);
      const slotNames: Record<MealSlot, string> = {
        colazione: 'recipeDetail.slotBreakfast',
        spuntino_mattina: 'recipeDetail.slotSnack',
        pranzo: 'recipeDetail.slotLunch',
        spuntino_pomeriggio: 'recipeDetail.slotSnack',
        cena: 'recipeDetail.slotDinner'
      };
      const slotLabel = t(slotNames[selectedSlot] || 'recipeDetail.slotMeal');
      showToast(t('recipeDetail.plannedToast', { slot: slotLabel }));
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
    const text = getShareText();
    const ok = await shareToTelegram(text);
    if (ok) {
      setShowShareModal(false);
      showToast(t('recipeDetail.openingTelegram'));
    }
  };

  const handleShareWhatsApp = async () => {
    const text = getShareText();
    const ok = await shareToWhatsApp(text);
    if (ok) {
      setShowShareModal(false);
      showToast(t('recipeDetail.openingWhatsApp'));
    }
  };

  const handleShareNative = async () => {
    const text = getShareText();
    setShowShareModal(false);
    await shareNative(recipe.title, text);
  };

  const handleCopyClipboard = async () => {
    const text = getShareText();
    const ok = await copyRecipeToClipboard(text);
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

  // Il JSON si apre dal menu di condivisione: prima si chiude quel pannello, così due modali non si sovrappongono
  const handleShowJson = () => {
    setShowShareModal(false);
    setJsonCopied(false);
    setTimeout(() => setShowJson(true), 300);
  };

  // Chiudi e preferiti accanto al nome, sempre disponibili anche scorrendo
  const closeButton = (
    <TouchableOpacity
      style={styles.headerIconBtn}
      onPress={onClose}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={t('recipeDetail.closeRecipe')}
    >
      <Ionicons name="close" size={20} color={colors.text} />
    </TouchableOpacity>
  );

  const favoriteButton = (
    <TouchableOpacity
      style={styles.headerIconBtn}
      onPress={handleToggleFavorite}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={t('recipeDetail.favorites')}
    >
      <Ionicons
        name={favorite ? 'heart' : 'heart-outline'}
        size={18}
        color={favorite ? colors.danger : colors.primaryText}
      />
    </TouchableOpacity>
  );

  return (
    <SheetModal visible={visible} onClose={onClose} fullScreen>
      <View style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={[styles.modalWrapper, width >= 768 && styles.modalWrapperTablet]}>
          {/* Nome della ricetta sopra la foto, sempre visibile */}
          <View style={styles.recipeHeader}>
            {closeButton}
            <Text style={styles.recipeHeaderTitle} numberOfLines={2}>{recipe.title}</Text>
            {favoriteButton}
          </View>

          {/* Selettore versioni: originale, varianti esistenti e quelle ancora da generare (tratteggiate) */}
          {recipe && baseRecipe && (variants.length > 0 || missingDiets.length > 0) && (
            <View style={styles.versionBar}>
              <View style={styles.versionRow}>
                <View style={styles.versionTabs}>
                  {(['original', ...variants.map(v => v.diet as VariantDiet)] as const).map(value => {
                    const active = value === version;
                    const label = value === 'original' ? originalLabel : t(VERSION_LABELS[value as VariantDiet]);
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[styles.versionTab, active && styles.versionTabActive]}
                        onPress={() => setVersionChoice({ baseId: baseRecipe.id, version: value })}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.versionTabText, active && styles.versionTabTextActive]} numberOfLines={1}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {missingDiets.map(diet => {
                    const isGenerating = generatingDiet === diet;
                    return (
                      <TouchableOpacity
                        key={`missing-${diet}`}
                        style={[styles.versionTab, styles.versionTabMissing]}
                        onPress={() => setPendingVariantDiet(diet)}
                        disabled={!!generatingDiet}
                        activeOpacity={0.85}
                        accessibilityState={{ busy: isGenerating, disabled: !!generatingDiet }}
                      >
                        {isGenerating ? (
                          <ActivityIndicator size="small" color={colors.primaryText} />
                        ) : (
                          <Ionicons name="sparkles-outline" size={12} color={colors.primaryText} />
                        )}
                        <Text style={[styles.versionTabText, styles.versionTabMissingText]} numberOfLines={1}>
                          {isGenerating ? t('recipeDetail.generating') : t(VERSION_LABELS[diet])}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {activeVariant && (
                  <TouchableOpacity
                    style={styles.versionMenuBtn}
                    onPress={() => setVariantMenuOpen(true)}
                    activeOpacity={0.8}
                    accessibilityLabel={t('recipeDetail.variantActions')}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.primaryText} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Conferma prima di generare una variante: resta in aggiunta alla ricetta originale */}
          <Modal visible={pendingVariantDiet !== null} animationType="fade" transparent onRequestClose={() => setPendingVariantDiet(null)}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPendingVariantDiet(null)}>
              <View style={styles.confirmSheet} onStartShouldSetResponder={() => true}>
                <Text style={styles.confirmTitle}>
                  {pendingVariantDiet ? t('recipeDetail.confirmVariantTitle', { diet: t(VERSION_LABELS[pendingVariantDiet]) }) : ''}
                </Text>
                <Text style={styles.confirmBody}>{t('recipeDetail.confirmVariantBody')}</Text>
                <View style={styles.confirmActions}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, styles.confirmBtnSecondary]}
                    onPress={() => setPendingVariantDiet(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmBtnTextSecondary}>{t('common.close')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, styles.confirmBtnPrimary]}
                    onPress={() => {
                      const diet = pendingVariantDiet;
                      setPendingVariantDiet(null);
                      if (diet && baseRecipe) onGenerateVariant?.(baseRecipe, diet);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmBtnTextPrimary}>{t('recipeDetail.generateVariantAction')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Azioni sulla variante attiva: rigenera ed elimina */}
          {activeVariant && (
            <Modal visible={variantMenuOpen} animationType="fade" transparent onRequestClose={() => setVariantMenuOpen(false)}>
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setVariantMenuOpen(false)}>
                <View style={styles.variantMenu} onStartShouldSetResponder={() => true}>
                  <TouchableOpacity
                    style={styles.variantMenuItem}
                    onPress={() => {
                      setVariantMenuOpen(false);
                      onRegenerateVariant?.(activeVariant);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh" size={18} color={colors.primaryText} />
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
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    <Text style={[styles.variantMenuText, { color: colors.danger }]}>{t('recipeDetail.deleteVariant')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Feedback Toast */}
          {feedbackMessage && (
            <View style={styles.toastBanner}>
              <Ionicons name="checkmark-circle" size={16} color={colors.onPrimary} style={{ marginRight: 6 }} />
              <Text style={styles.toastText}>{feedbackMessage}</Text>
            </View>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Main Image with expo-image */}
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
                    <Ionicons name="leaf" size={13} color={colors.primaryText} style={{ marginRight: 4 }} />
                    <Text style={styles.plantBadgeText}>{dietBadge}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.imageContainer, styles.imagePlaceholder]}>
                <Ionicons name="restaurant-outline" size={48} color={colors.textMuted} />
              </View>
            )}

            {/* Content Body */}
            <View style={styles.content}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.badgeScroll}
                contentContainerStyle={styles.badgeRow}
              >
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>
                    {t('categories.' + (recipe.subcategory || recipe.category), { defaultValue: recipe.subcategory || recipe.category })}
                  </Text>
                </View>
                {!!recipe.macro_category && recipe.macro_category !== recipe.category && (
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primarySoft, borderColor: colors.borderStrong }]}>
                    <Text style={[styles.categoryBadgeText, { color: colors.primaryText }]}>
                      {t('categories.' + recipe.macro_category, { defaultValue: recipe.macro_category })}
                    </Text>
                  </View>
                )}
                <View style={styles.diffBadge}>
                  <Ionicons name="speedometer-outline" size={12} color="#D97757" style={{ marginRight: 3 }} />
                  <Text style={styles.diffBadgeText}>{recipe.difficulty}</Text>
                </View>
              </ScrollView>

              {/* Quick Metrics Bar */}
              <View style={styles.metricsBar}>
                <View style={styles.metricItem}>
                  <Ionicons name="time-outline" size={20} color={colors.primaryText} />
                  <Text style={styles.metricLabel}>{t('recipeDetail.metricTime')}</Text>
                  <Text style={styles.metricValue}>{t('common.minutes', { count: recipe.times.total_minutes })}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="people-outline" size={20} color={colors.primaryText} />
                  <Text style={styles.metricLabel}>{t('recipeDetail.metricServings')}</Text>
                  <Text style={styles.metricValue}>{currentServings}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="bar-chart-outline" size={20} color={colors.primaryText} />
                  <Text style={styles.metricLabel}>{t('recipeDetail.metricLevel')}</Text>
                  <Text style={styles.metricValue}>{recipe.difficulty}</Text>
                </View>
              </View>

              {/* Dynamic Servings Scaler with Quick Presets */}
              <View style={styles.scalerCard}>
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
                      <TouchableOpacity
                        key={num}
                        style={[styles.presetChip, currentServings === num && styles.presetChipActive]}
                        onPress={() => setCurrentServings(num)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.presetChipText, currentServings === num && styles.presetChipTextActive]}>
                          {t('recipeDetail.presetShort', { n: num })}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.scalerControls}>
                    <TouchableOpacity
                      style={[styles.scaleBtn, currentServings <= 1 && styles.scaleBtnDisabled]}
                      onPress={() => changeServings(-1)}
                      disabled={currentServings <= 1}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="remove" size={16} color={currentServings <= 1 ? colors.textMuted : colors.primaryText} />
                    </TouchableOpacity>
                    <Text style={styles.scaleNumber}>{currentServings}</Text>
                    <TouchableOpacity
                      style={styles.scaleBtn}
                      onPress={() => changeServings(1)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={16} color={colors.primaryText} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

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
                            <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                              {isChecked && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
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
                <Text style={styles.sectionTitle}>{t('recipeDetail.preparation')}</Text>
                {(recipe.instructions || []).map((step, idx) => {
                  const isDone = !!completedSteps[idx];
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.stepCard, isDone && styles.stepCardDone]}
                      onPress={() => toggleStep(idx)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.stepBadge, isDone && styles.stepBadgeDone]}>
                        {isDone ? (
                          <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                        ) : (
                          <Text style={styles.stepBadgeNumber}>{idx + 1}</Text>
                        )}
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
                    <Ionicons name="journal-outline" size={18} color={colors.primaryText} />
                    <Text style={styles.notesTitle}>{t('recipeDetail.notesTitle')}</Text>
                  </View>
                  {savedNoteStatus && (
                    <View style={styles.savedNoteBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.primaryText} style={{ marginRight: 3 }} />
                      <Text style={styles.savedNoteBadgeText}>{savedNoteStatus}</Text>
                    </View>
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
                    <TouchableOpacity
                      style={styles.notesSaveBtn}
                      onPress={handleSaveNote}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark" size={15} color={colors.onPrimary} style={{ marginRight: 4 }} />
                      <Text style={styles.notesSaveBtnText}>{t('recipeDetail.saveNote')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Tips & Storage */}
              {recipe.tips && recipe.tips.length > 0 && (
                <View style={styles.tipsBox}>
                  <View style={styles.tipsHeader}>
                    <Ionicons name="bulb-outline" size={20} color={colors.primaryText} />
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
                    <View key={idx} style={styles.tagPill}>
                      <Text style={styles.tagPillText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ height: 20 }} />
            </View>
          </ScrollView>

          {/* Sticky Meal Plan Drawer (pops up when showPlanPicker is open) */}
          {showPlanPicker && (
            <View style={styles.stickyPlanDrawer}>
              <View style={styles.planDrawerHeader}>
                <Text style={styles.planDrawerTitle}>{t('recipeDetail.choosePlanTime')}</Text>
              </View>

              <View style={styles.slotToggleRow}>
                <TouchableOpacity
                  style={[styles.slotToggle, selectedSlot === 'colazione' && styles.slotToggleActive]}
                  onPress={() => setSelectedSlot('colazione')}
                >
                  <Ionicons name="cafe-outline" size={13} color={selectedSlot === 'colazione' ? colors.onPrimary : colors.primaryText} />
                  <Text style={[styles.slotToggleText, selectedSlot === 'colazione' && styles.slotToggleTextActive]}>
                    {t('recipeDetail.slotBreakfast')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotToggle, selectedSlot === 'pranzo' && styles.slotToggleActive]}
                  onPress={() => setSelectedSlot('pranzo')}
                >
                  <Ionicons name="sunny-outline" size={13} color={selectedSlot === 'pranzo' ? colors.onPrimary : colors.primaryText} />
                  <Text style={[styles.slotToggleText, selectedSlot === 'pranzo' && styles.slotToggleTextActive]}>
                    {t('recipeDetail.slotLunch')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotToggle, (selectedSlot === 'spuntino_mattina' || selectedSlot === 'spuntino_pomeriggio') && styles.slotToggleActive]}
                  onPress={() => setSelectedSlot('spuntino_pomeriggio')}
                >
                  <Ionicons name="nutrition-outline" size={13} color={(selectedSlot === 'spuntino_mattina' || selectedSlot === 'spuntino_pomeriggio') ? colors.onPrimary : colors.primaryText} />
                  <Text style={[styles.slotToggleText, (selectedSlot === 'spuntino_mattina' || selectedSlot === 'spuntino_pomeriggio') && styles.slotToggleTextActive]}>
                    {t('recipeDetail.slotSnack')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotToggle, selectedSlot === 'cena' && styles.slotToggleActive]}
                  onPress={() => setSelectedSlot('cena')}
                >
                  <Ionicons name="moon-outline" size={13} color={selectedSlot === 'cena' ? colors.onPrimary : colors.primaryText} />
                  <Text style={[styles.slotToggleText, selectedSlot === 'cena' && styles.slotToggleTextActive]}>
                    {t('recipeDetail.slotDinner')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.daysRow}>
                {weekDays.map(d => {
                  const isSelected = selectedDate === d.dateString;
                  return (
                    <TouchableOpacity
                      key={d.dateString}
                      style={[
                        styles.dayCard,
                        d.isToday && styles.dayCardToday,
                        isSelected && styles.dayCardSelected
                      ]}
                      onPress={() => setSelectedDate(d.dateString)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.dayCardName,
                          d.isToday && styles.dayCardNameToday,
                          isSelected && styles.dayCardNameSelected
                        ]}
                      >
                        {d.dayName.slice(0, 3)}
                      </Text>
                      <Text
                        style={[
                          styles.dayCardNum,
                          d.isToday && styles.dayCardNumToday,
                          isSelected && styles.dayCardNumSelected
                        ]}
                      >
                        {d.dayNumber}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Barra in basso: pianifica (con la X accanto alla conferma) e sotto le azioni secondarie */}
          <View style={styles.stickyActionBar}>
            <View style={styles.stickyPlanRow}>
              <TouchableOpacity
                style={styles.stickyPlanBtnPrimary}
                onPress={() => {
                  if (showPlanPicker) {
                    handleScheduleMeal(selectedDate || (weekDays.find(d => d.isToday)?.dateString || weekDays[0].dateString));
                  } else {
                    setShowPlanPicker(true);
                  }
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.stickyPlanBtnText}>
                  {showPlanPicker
                    ? t('recipeDetail.confirmInPlan', { day: selectedDayLabel, slot: selectedSlotLabel })
                    : t('recipeDetail.addToPlan', { servings: currentServings })}
                </Text>
                {!showPlanPicker && (
                  <Ionicons
                    name="chevron-up"
                    size={18}
                    color={colors.onPrimary}
                    style={{ marginLeft: 6 }}
                  />
                )}
              </TouchableOpacity>
              {showPlanPicker && (
                <TouchableOpacity
                  style={styles.stickyCloseBtn}
                  onPress={() => setShowPlanPicker(false)}
                  activeOpacity={0.7}
                  accessibilityLabel={t('common.close')}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.stickyToolsRow}>
              {onEdit && (
                <TouchableOpacity
                  style={styles.stickySecondaryBtn}
                  onPress={() => onEdit(recipe)}
                  activeOpacity={0.8}
                  accessibilityLabel={t('recipeDetail.edit')}
                >
                  <Ionicons name="create-outline" size={18} color={colors.primaryText} />
                  <Text style={styles.stickySecondaryText}>{t('recipeDetail.edit')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.stickySecondaryBtn}
                onPress={() => setShowShareModal(true)}
                activeOpacity={0.8}
                accessibilityLabel={t('recipeDetail.shareRecipe')}
              >
                <Ionicons name="share-social-outline" size={18} color={colors.primaryText} />
                <Text style={styles.stickySecondaryText}>{t('recipeDetail.shareRecipe')}</Text>
              </TouchableOpacity>
              {hasExternalLink && (
                <TouchableOpacity
                  style={styles.stickySecondaryBtn}
                  onPress={() => Linking.openURL(recipe.url)}
                  activeOpacity={0.8}
                  accessibilityLabel={t('recipeDetail.openOnWeb')}
                >
                  <Ionicons name="open-outline" size={18} color={colors.primaryText} />
                  <Text style={styles.stickySecondaryText}>{t('recipeDetail.openOnWeb')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Share Modal Dialog */}
        <Modal visible={showJson} animationType="fade" transparent onRequestClose={() => setShowJson(false)}>
          <View style={styles.jsonBackdrop}>
            <View style={styles.jsonCard}>
              <View style={styles.jsonHeader}>
                <Text style={styles.jsonTitle}>{t('recipeDetail.recipeJson')}</Text>
                <TouchableOpacity onPress={() => setShowJson(false)} hitSlop={12} accessibilityLabel={t('recipeDetail.close')}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.jsonScroll} contentContainerStyle={styles.jsonScrollContent}>
                <Text selectable style={styles.jsonText}>{JSON.stringify(recipe, null, 2)}</Text>
              </ScrollView>
              <TouchableOpacity
                style={styles.jsonCopyBtn}
                onPress={async () => {
                  await Clipboard.setStringAsync(JSON.stringify(recipe, null, 2));
                  setJsonCopied(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name={jsonCopied ? 'checkmark' : 'copy-outline'} size={16} color={colors.onPrimary} />
                <Text style={styles.jsonCopyText}>{jsonCopied ? t('recipeDetail.copied') : t('recipeDetail.copyToClipboard')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showShareModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowShareModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowShareModal(false)}
          >
            <View
              style={[styles.shareSheet, width >= 768 && styles.shareSheetTablet]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.shareSheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareSheetTitle}>{t('recipeDetail.shareRecipeTitle')}</Text>
                  <Text style={styles.shareSheetSub} numberOfLines={1}>
                    {t('recipeDetail.shareSubtitle', { title: recipe.title, count: currentServings })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.shareCloseBtn}
                  onPress={() => setShowShareModal(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Note inclusion toggle if note exists */}
              {userNote.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.includeNotesToggle}
                  onPress={() => setIncludeNotesInShare(!includeNotesInShare)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={includeNotesInShare ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={includeNotesInShare ? colors.primaryText : colors.textMuted}
                    style={{ marginRight: 8 }}
                  />
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
                  <View style={[styles.shareIconCircle, { backgroundColor: '#2AABEE' }]}>
                    <Ionicons name="paper-plane" size={19} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: (isDark ? '#8ED3F5' : '#0E73A6') }]}>Telegram</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.telegramSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#2AABEE" />
                </TouchableOpacity>

                {/* WhatsApp */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionWhatsapp]}
                  onPress={handleShareWhatsApp}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: '#25D366' }]}>
                    <Ionicons name="logo-whatsapp" size={19} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: (isDark ? '#7FD39C' : '#1B8742') }]}>WhatsApp</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.whatsappSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#25D366" />
                </TouchableOpacity>

                {/* Native System Share */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionNative]}
                  onPress={handleShareNative}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: colors.primary }]}>
                    <Ionicons name="share-outline" size={19} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: colors.primaryText }]}>{t('recipeDetail.otherApps')}</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.systemShareSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.primaryText} />
                </TouchableOpacity>

                {/* Copy to Clipboard */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionClipboard]}
                  onPress={handleCopyClipboard}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: (isDark ? '#455A64' : '#607D8B') }]}>
                    <Ionicons name="copy-outline" size={19} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: (isDark ? '#CFD8DC' : '#37474F') }]}>{t('recipeDetail.copyRecipeTitle')}</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.copyRecipeSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={(isDark ? '#90A4AE' : '#607D8B')} />
                </TouchableOpacity>

                {/* Visualizza JSON */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionNative]}
                  onPress={handleShowJson}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: colors.primary }]}>
                    <Ionicons name="code-slash-outline" size={19} color={colors.onPrimary} />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: colors.primaryText }]}>{t('recipeDetail.showRecipeJson')}</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.jsonSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.primaryText} />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </SheetModal>
  );
};

const makeStyles = (colors: Palette, isDark: boolean) => StyleSheet.create({
  jsonBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 16 },
  jsonCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, maxHeight: '85%' },
  jsonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  jsonTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  // Area scorrevole con altezza limitata dalla card: il JSON scorre dentro di essa
  jsonScroll: { flexShrink: 1, minHeight: 200, backgroundColor: colors.surfaceAlt, borderRadius: 10 },
  jsonScrollContent: { padding: 10 },
  jsonText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 10,
    textAlignVertical: 'top',
  },
  jsonCopyBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  jsonCopyText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  versionBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  versionTabs: { flex: 1, flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: colors.primarySoft },
  versionTab: { flex: 1, paddingVertical: 7, borderRadius: 11, alignItems: 'center' },
  versionTabActive: { backgroundColor: colors.surface },
  versionTabText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  versionTabTextActive: { color: colors.primaryText },
  versionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  versionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  versionTabMissing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  versionTabMissingText: { color: colors.primaryText },
  versionMenuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  variantMenu: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  variantMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  variantMenuText: { fontSize: 15, fontWeight: '600', color: colors.text },
  confirmSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 10,
  },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  confirmBody: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  confirmBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirmBtnSecondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderStrong },
  confirmBtnPrimary: { backgroundColor: colors.primary },
  confirmBtnTextSecondary: { fontSize: 15, fontWeight: '700', color: colors.text },
  confirmBtnTextPrimary: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
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
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  toastBanner: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  toastText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  imageContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    aspectRatio: 16 / 10,
    maxHeight: 400,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  recipeHeaderTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 28,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  plantBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: (isDark ? 'rgba(27, 35, 28, 0.95)' : 'rgba(255, 255, 255, 0.95)'),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  plantBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryText,
  },
  content: {
    padding: 20,
  },
  badgeScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryText,
    textTransform: 'uppercase',
  },
  diffBadge: {
    backgroundColor: (isDark ? '#3A2A22' : '#FBEFEA'),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  diffBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97757',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 32,
    marginBottom: 16,
  },
  metricsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 4,
  },
  metricValue: {
    fontSize: 14,
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
    gap: 8,
  },
  stickyCloseBtn: {
    width: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  stickyToolsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stickySecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  stickySecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryText,
  },
  stickyActionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  stickyPlanBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  stickyPlanBtnText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  stickyPlanDrawer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 6,
  },
  planDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  planDrawerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  slotToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  slotToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  slotToggleActive: {
    backgroundColor: colors.primary,
  },
  slotToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  slotToggleTextActive: {
    color: colors.onPrimary,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCard: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayCardToday: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  dayCardSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayCardName: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  dayCardNameToday: {
    color: colors.primaryText,
  },
  dayCardNameSelected: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  dayCardNum: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  dayCardNumToday: {
    color: colors.primaryText,
  },
  dayCardNumSelected: {
    color: colors.onPrimary,
    fontWeight: '800',
  },
  scalerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  scalerInfo: {
    flex: 1,
  },
  scalerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  scalerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  scalerRightCol: {
    alignItems: 'flex-end',
    gap: 8,
  },
  scalerPresetsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  presetChipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  scalerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
  },
  scaleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  scaleBtnDisabled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.6,
  },
  scaleNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    minWidth: 32,
    textAlign: 'center',
  },
  ingredientsContainer: {
    marginBottom: 24,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ingredientMainTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  singleAddBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    marginLeft: 8,
  },
  ingredientRowChecked: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  ingredientText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
  ingredientQuantity: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: 12,
    textAlign: 'right',
  },
  ingredientTextChecked: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  instructionsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepCardDone: {
    backgroundColor: colors.surfaceAlt,
    opacity: 0.65,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepBadgeDone: {
    backgroundColor: colors.primary,
  },
  stepBadgeNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryText,
  },
  stepText: {
    fontSize: 14,
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
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },
  tipsText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tagPill: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagPillText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  // Notes Section Styles
  notesCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  notesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  savedNoteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  savedNoteBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryText,
  },
  notesField: {
    minHeight: 70,
  },
  notesActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  notesSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  notesSaveBtnText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  // Share Modal & Sheet Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  shareSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  shareSheetTablet: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  shareSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  shareSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  shareSheetSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  shareCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  includeNotesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  includeNotesText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  shareGrid: {
    gap: 10,
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  shareOptionTelegram: {
    backgroundColor: (isDark ? '#132630' : '#F0F8FD'),
    borderColor: (isDark ? '#1E3A48' : '#D1EAF8'),
  },
  shareOptionWhatsapp: {
    backgroundColor: (isDark ? '#13261A' : '#F0FAF3'),
    borderColor: (isDark ? '#1F3D2A' : '#D2F2DD'),
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  shareOptionTextCol: {
    flex: 1,
  },
  shareOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  shareOptionSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
});
