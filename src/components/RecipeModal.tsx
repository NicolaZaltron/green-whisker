import { SheetModal } from './SheetModal';
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  StatusBar,
  TextInput,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Recipe, IngredientItem } from '../types/recipe';
import { useResponsiveDimensions } from '../hooks/useResponsiveDimensions';
import {
  addShoppingItems,
  saveMealPlanEntry,
  getRecipeNote,
  saveRecipeNote
} from '../db/database';
import { useFavoritesSafe } from '../context/FavoritesContext';
import { getWeekDays, MealSlot } from '../services/plannerService';
import { VariantDiet, availableVariantDiets } from '../services/catalogFormat';
import { classifyDiet } from '../utils/dietClassifier';
import { scaleIngredient, getScalableIngredients } from '../utils/servingsScaler';
import {
  formatRecipeShareText,
  shareToTelegram,
  shareToWhatsApp,
  shareNative,
  copyRecipeToClipboard
} from '../utils/shareHelper';
import { useTranslation } from 'react-i18next';

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
  // La versione scelta vale solo per la ricetta aperta: cambiando ricetta si torna all'originale
  const [versionChoice, setVersionChoice] = useState<{ baseId?: string; version: 'original' | VariantDiet }>({ version: 'original' });
  const version = versionChoice.baseId === baseRecipe?.id ? versionChoice.version : 'original';
  const activeVariant = version === 'original' ? undefined : variants.find(v => v.diet === version);
  // Tutto ciò che segue (ingredienti, planner, spesa, condivisione, note) usa la versione attiva
  const recipe = activeVariant ?? baseRecipe;
  const missingDiets = baseRecipe ? availableVariantDiets(baseRecipe, variants) : [];
  // L'originale è già di quella dieta, o più restrittiva (una vegana è anche vegetariana)
  const originalDiet = baseRecipe ? (baseRecipe.diet ?? classifyDiet(baseRecipe)) : 'omnivore';
  const originalSatisfies = (diet: VariantDiet) =>
    diet === 'vegetarian' ? originalDiet !== 'omnivore' : originalDiet === 'vegan';
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
  const scrollY = useRef(new Animated.Value(0)).current;
  const titleOpacity = scrollY.interpolate({
    inputRange: [20, 60],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Sharing & Personal Notes State
  const [showShareModal, setShowShareModal] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [includeNotesInShare, setIncludeNotesInShare] = useState(true);
  const [userNote, setUserNote] = useState('');
  const [savedNoteStatus, setSavedNoteStatus] = useState<string | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);

  const { days: weekDays } = getWeekDays();
  const [selectedDate, setSelectedDate] = useState<string>(
    () => weekDays.find(d => d.isToday)?.dateString || weekDays[0]?.dateString || ''
  );

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
      scrollY.setValue(0);

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

  const formatScaledIngredient = (item: IngredientItem) => {
    return scaleIngredient(item.amount, item.unit, item.ingredient, item.text, scale).formattedText;
  };

  const handleScheduleMeal = async (dateStr: string) => {
    // 1. Salva la ricetta nel Meal Planner
    await saveMealPlanEntry({
      date: dateStr,
      slot: selectedSlot,
      recipeId: recipe.id,
      servings: currentServings
    });

    // 2. Aggiunge contestualmente gli ingredienti scalati alla lista della spesa
    const titleWithServings = t('recipeDetail.titleWithServings', { title: recipe.title, servings: currentServings });
    const itemsToAdd = scalableIngredients.map(item => {
      const scaled = scaleIngredient(item.amount, item.unit, item.ingredient, item.text, scale);
      return {
        recipeId: recipe.id,
        recipeTitle: titleWithServings,
        ingredientText: scaled.formattedText,
        name: scaled.name,
        amount: scaled.scaledAmount,
        unit: scaled.unit,
        category: item.section || 'Generale'
      };
    });

    if (itemsToAdd.length > 0) {
      await addShoppingItems(itemsToAdd);
    }

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
  };

  const handleSaveNote = async () => {
    await saveRecipeNote(recipe.id, userNote);
    setIsEditingNote(false);
    setSavedNoteStatus(t('recipeDetail.noteSaved'));
    showToast(t('recipeDetail.noteSavedToast'));
    setTimeout(() => setSavedNoteStatus(null), 3000);
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

  return (
    <SheetModal visible={visible} onClose={onClose} fullScreen>
      <View style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.modalWrapper, width >= 768 && styles.modalWrapperTablet]}>
          {/* Dynamic Sticky Top Navigation Bar */}
          <View style={styles.topNav}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityLabel={t('recipeDetail.closeRecipe')}
            >
              <Ionicons name="close" size={22} color="#2B332B" />
            </TouchableOpacity>

            <Animated.Text
              style={[
                styles.topNavTitle,
                { opacity: titleOpacity }
              ]}
              numberOfLines={1}
            >
              {recipe.title}
            </Animated.Text>

            <View style={styles.navActions}>
              <TouchableOpacity
                style={[styles.navBtn, { marginRight: 8 }]}
                onPress={() => {
                  setJsonCopied(false);
                  setShowJson(true);
                }}
                activeOpacity={0.7}
                accessibilityLabel={t('recipeDetail.showRecipeJson')}
              >
                <Ionicons name="code-slash-outline" size={19} color="#4A6B53" />
              </TouchableOpacity>
              {onEdit && (
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => onEdit(recipe)}
                  activeOpacity={0.7}
                  accessibilityLabel={t('recipeDetail.edit')}
                >
                  <Ionicons name="create-outline" size={19} color="#4A6B53" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.navBtn, onEdit && { marginLeft: 8 }]}
                onPress={() => setShowShareModal(true)}
                activeOpacity={0.7}
                accessibilityLabel={t('recipeDetail.shareRecipe')}
              >
                <Ionicons name="share-social-outline" size={19} color="#4A6B53" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navBtn, { marginLeft: 8 }]}
                onPress={handleToggleFavorite}
                activeOpacity={0.7}
                accessibilityLabel={t('recipeDetail.favorites')}
              >
                <Ionicons
                  name={favorite ? 'heart' : 'heart-outline'}
                  size={20}
                  color={favorite ? '#D9534F' : '#4A6B53'}
                />
              </TouchableOpacity>
              {hasExternalLink && (
                <TouchableOpacity
                  style={[styles.navBtn, { marginLeft: 8 }]}
                  onPress={() => Linking.openURL(recipe.url)}
                  activeOpacity={0.7}
                  accessibilityLabel={t('recipeDetail.openOnWeb')}
                >
                  <Ionicons name="open-outline" size={19} color="#4A6B53" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Schede delle versioni: appaiono quando la ricetta ha varianti o se ne possono generare */}
          {recipe && baseRecipe && (variants.length > 0 || missingDiets.length > 0) && (
            <View style={styles.versionBar}>
              <View style={styles.versionTabs}>
                {(['original', ...variants.map(v => v.diet as VariantDiet)] as const).map(value => {
                  const active = value === version;
                  const label = value === 'original' ? t('recipeDetail.versionOriginal') : t(VERSION_LABELS[value as VariantDiet]);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.versionTab, active && styles.versionTabActive]}
                      onPress={() => setVersionChoice({ baseId: baseRecipe.id, version: value })}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.versionTabText, active && styles.versionTabTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {version === 'original' ? (
                // Entrambi i pulsanti sempre visibili: disabilitati se la variante esiste già (o non serve)
                <View style={styles.generateRow}>
                  {(['vegetarian', 'vegan'] as const).map(diet => {
                    const available = missingDiets.includes(diet);
                    const disabled = !available || !!generatingDiet;
                    const isGenerating = generatingDiet === diet;
                    // Già presente: come variante, oppure perché l'originale è già di quella dieta (o più restrittiva)
                    const exists = variants.some(v => v.diet === diet) || originalSatisfies(diet);
                    return (
                      <TouchableOpacity
                        key={diet}
                        style={[styles.generateBtn, disabled && styles.versionActionBtnDisabled]}
                        onPress={() => onGenerateVariant?.(baseRecipe, diet)}
                        disabled={disabled}
                        activeOpacity={0.8}
                        accessibilityState={{ busy: isGenerating, disabled }}
                      >
                        {isGenerating ? (
                          <ActivityIndicator size="small" color="#34523C" />
                        ) : (
                          <Ionicons name={exists ? 'checkmark-circle' : 'sparkles-outline'} size={14} color="#34523C" />
                        )}
                        <Text style={styles.versionActionText} numberOfLines={1}>
                          {isGenerating
                            ? t('recipeDetail.generating')
                            : exists
                              ? (diet === 'vegan' ? t('recipeDetail.veganExists') : t('recipeDetail.vegetarianExists'))
                              : diet === 'vegan' ? t('recipeDetail.makeVegan') : t('recipeDetail.makeVegetarian')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : activeVariant ? (
                <View style={styles.generateRow}>
                  <TouchableOpacity style={styles.generateBtn} onPress={() => onRegenerateVariant?.(activeVariant)} activeOpacity={0.8}>
                    <Ionicons name="refresh" size={14} color="#34523C" />
                    <Text style={styles.versionActionText} numberOfLines={1}>{t('recipeDetail.regenerateVariant')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.generateBtn} onPress={() => onDeleteVariant?.(activeVariant)} activeOpacity={0.8}>
                    <Ionicons name="trash-outline" size={14} color="#D9534F" />
                    <Text style={[styles.versionActionText, { color: '#D9534F' }]} numberOfLines={1}>{t('recipeDetail.deleteVariant')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}

          {/* Feedback Toast */}
          {feedbackMessage && (
            <View style={styles.toastBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.toastText}>{feedbackMessage}</Text>
            </View>
          )}

          <Animated.ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
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
                    <Ionicons name="leaf" size={13} color="#4A6B53" style={{ marginRight: 4 }} />
                    <Text style={styles.plantBadgeText}>{dietBadge}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.imageContainer, styles.imagePlaceholder]}>
                <Ionicons name="restaurant-outline" size={48} color="#A3B2A6" />
              </View>
            )}

            {/* Content Body */}
            <View style={styles.content}>
              <View style={styles.badgeRow}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>
                    {t('categories.' + (recipe.subcategory || recipe.category), { defaultValue: recipe.subcategory || recipe.category })}
                  </Text>
                </View>
                {!!recipe.macro_category && recipe.macro_category !== recipe.category && (
                  <View style={[styles.categoryBadge, { backgroundColor: '#E2EBE5', borderColor: '#C8DACD' }]}>
                    <Text style={[styles.categoryBadgeText, { color: '#34523C' }]}>
                      {t('categories.' + recipe.macro_category, { defaultValue: recipe.macro_category })}
                    </Text>
                  </View>
                )}
                <View style={styles.diffBadge}>
                  <Ionicons name="speedometer-outline" size={12} color="#D97757" style={{ marginRight: 3 }} />
                  <Text style={styles.diffBadgeText}>{recipe.difficulty}</Text>
                </View>
              </View>

              <Text style={styles.title}>{recipe.title}</Text>

              {/* Quick Metrics Bar */}
              <View style={styles.metricsBar}>
                <View style={styles.metricItem}>
                  <Ionicons name="time-outline" size={20} color="#4A6B53" />
                  <Text style={styles.metricLabel}>{t('recipeDetail.metricTime')}</Text>
                  <Text style={styles.metricValue}>{t('common.minutes', { count: recipe.times.total_minutes })}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="people-outline" size={20} color="#4A6B53" />
                  <Text style={styles.metricLabel}>{t('recipeDetail.metricServings')}</Text>
                  <Text style={styles.metricValue}>{currentServings}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="bar-chart-outline" size={20} color="#4A6B53" />
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
                      <Ionicons name="remove" size={16} color={currentServings <= 1 ? '#C2CDC4' : '#4A6B53'} />
                    </TouchableOpacity>
                    <Text style={styles.scaleNumber}>{currentServings}</Text>
                    <TouchableOpacity
                      style={styles.scaleBtn}
                      onPress={() => changeServings(1)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={16} color="#4A6B53" />
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
                      const text = formatScaledIngredient(ing);

                      return (
                        <View key={key} style={[styles.ingredientRow, isChecked && styles.ingredientRowChecked]}>
                          <TouchableOpacity
                            style={styles.ingredientMainTouch}
                            onPress={() => toggleIngredient(key)}
                            activeOpacity={0.6}
                          >
                            <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                              {isChecked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                            </View>
                            <Text style={[styles.ingredientText, isChecked && styles.ingredientTextChecked]}>
                              {text}
                            </Text>
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
                          <Ionicons name="checkmark" size={14} color="#FFF" />
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
                    <Ionicons name="journal-outline" size={18} color="#4A6B53" />
                    <Text style={styles.notesTitle}>{t('recipeDetail.notesTitle')}</Text>
                  </View>
                  {savedNoteStatus && (
                    <View style={styles.savedNoteBadge}>
                      <Ionicons name="checkmark-circle" size={13} color="#2D5A27" style={{ marginRight: 3 }} />
                      <Text style={styles.savedNoteBadgeText}>{savedNoteStatus}</Text>
                    </View>
                  )}
                </View>
                <TextInput
                  style={styles.notesInput}
                  placeholder={t('recipeDetail.notesPlaceholder')}
                  placeholderTextColor="#9EA89F"
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
                      <Ionicons name="checkmark" size={15} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.notesSaveBtnText}>{t('recipeDetail.saveNote')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Tips & Storage */}
              {recipe.tips && recipe.tips.length > 0 && (
                <View style={styles.tipsBox}>
                  <View style={styles.tipsHeader}>
                    <Ionicons name="bulb-outline" size={20} color="#4A6B53" />
                    <Text style={styles.tipsTitle}>{t('recipeDetail.tipsTitle')}</Text>
                  </View>
                  {recipe.tips.map((sugg, idx) => (
                    <Text key={idx} style={styles.tipsText}>
                      • {sugg}
                    </Text>
                  ))}
                </View>
              )}


              {/* Tags */}
              <View style={styles.tagsContainer}>
                {recipe.tags.map((t, idx) => (
                  <View key={idx} style={styles.tagPill}>
                    <Text style={styles.tagPillText}>#{t}</Text>
                  </View>
                ))}
              </View>

              <View style={{ height: 20 }} />
            </View>
          </Animated.ScrollView>

          {/* Sticky Meal Plan Drawer (pops up when showPlanPicker is open) */}
          {showPlanPicker && (
            <View style={styles.stickyPlanDrawer}>
              <View style={styles.planDrawerHeader}>
                <Text style={styles.planDrawerTitle}>{t('recipeDetail.choosePlanTime')}</Text>
                <TouchableOpacity
                  onPress={() => setShowPlanPicker(false)}
                  style={styles.planDrawerCloseBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={18} color="#556658" />
                </TouchableOpacity>
              </View>

              <View style={styles.slotToggleRow}>
                <TouchableOpacity
                  style={[styles.slotToggle, selectedSlot === 'colazione' && styles.slotToggleActive]}
                  onPress={() => setSelectedSlot('colazione')}
                >
                  <Ionicons name="cafe-outline" size={13} color={selectedSlot === 'colazione' ? '#FFF' : '#4A6B53'} />
                  <Text style={[styles.slotToggleText, selectedSlot === 'colazione' && styles.slotToggleTextActive]}>
                    {t('recipeDetail.slotBreakfast')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotToggle, selectedSlot === 'pranzo' && styles.slotToggleActive]}
                  onPress={() => setSelectedSlot('pranzo')}
                >
                  <Ionicons name="sunny-outline" size={13} color={selectedSlot === 'pranzo' ? '#FFF' : '#4A6B53'} />
                  <Text style={[styles.slotToggleText, selectedSlot === 'pranzo' && styles.slotToggleTextActive]}>
                    {t('recipeDetail.slotLunch')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotToggle, (selectedSlot === 'spuntino_mattina' || selectedSlot === 'spuntino_pomeriggio') && styles.slotToggleActive]}
                  onPress={() => setSelectedSlot('spuntino_pomeriggio')}
                >
                  <Ionicons name="nutrition-outline" size={13} color={(selectedSlot === 'spuntino_mattina' || selectedSlot === 'spuntino_pomeriggio') ? '#FFF' : '#4A6B53'} />
                  <Text style={[styles.slotToggleText, (selectedSlot === 'spuntino_mattina' || selectedSlot === 'spuntino_pomeriggio') && styles.slotToggleTextActive]}>
                    {t('recipeDetail.slotSnack')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotToggle, selectedSlot === 'cena' && styles.slotToggleActive]}
                  onPress={() => setSelectedSlot('cena')}
                >
                  <Ionicons name="moon-outline" size={13} color={selectedSlot === 'cena' ? '#FFF' : '#4A6B53'} />
                  <Text style={[styles.slotToggleText, selectedSlot === 'cena' && styles.slotToggleTextActive]}>
                    {t('recipeDetail.slotDinner')}
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
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
              </ScrollView>
            </View>
          )}

          {/* Sticky Persistent Action Bar */}
          <View style={styles.stickyActionBar}>
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
              <MaterialCommunityIcons
                name="chef-hat"
                size={20}
                color="#FFF"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.stickyPlanBtnText}>
                {showPlanPicker
                  ? t('recipeDetail.confirmInPlan', { day: selectedDayLabel, slot: selectedSlotLabel })
                  : t('recipeDetail.addToPlan', { servings: currentServings })}
              </Text>
              {!showPlanPicker && (
                <Ionicons
                  name="chevron-up"
                  size={18}
                  color="#FFF"
                  style={{ marginLeft: 6 }}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Share Modal Dialog */}
        <Modal visible={showJson} animationType="fade" transparent onRequestClose={() => setShowJson(false)}>
          <View style={styles.jsonBackdrop}>
            <View style={styles.jsonCard}>
              <View style={styles.jsonHeader}>
                <Text style={styles.jsonTitle}>{t('recipeDetail.recipeJson')}</Text>
                <TouchableOpacity onPress={() => setShowJson(false)} hitSlop={12} accessibilityLabel={t('recipeDetail.close')}>
                  <Ionicons name="close" size={22} color="#2B332B" />
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
                <Ionicons name={jsonCopied ? 'checkmark' : 'copy-outline'} size={16} color="#FFFFFF" />
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
                  <Ionicons name="close" size={20} color="#2B332B" />
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
                    color={includeNotesInShare ? '#4A6B53' : '#7E8B80'}
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
                    <Ionicons name="paper-plane" size={19} color="#FFF" />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: '#0E73A6' }]}>Telegram</Text>
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
                    <Ionicons name="logo-whatsapp" size={19} color="#FFF" />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: '#1B8742' }]}>WhatsApp</Text>
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
                  <View style={[styles.shareIconCircle, { backgroundColor: '#4A6B53' }]}>
                    <Ionicons name="share-outline" size={19} color="#FFF" />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: '#2C4A34' }]}>{t('recipeDetail.otherApps')}</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.systemShareSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#4A6B53" />
                </TouchableOpacity>

                {/* Copy to Clipboard */}
                <TouchableOpacity
                  style={[styles.shareOption, styles.shareOptionClipboard]}
                  onPress={handleCopyClipboard}
                  activeOpacity={0.8}
                >
                  <View style={[styles.shareIconCircle, { backgroundColor: '#607D8B' }]}>
                    <Ionicons name="copy-outline" size={19} color="#FFF" />
                  </View>
                  <View style={styles.shareOptionTextCol}>
                    <Text style={[styles.shareOptionTitle, { color: '#37474F' }]}>{t('recipeDetail.copyRecipeTitle')}</Text>
                    <Text style={styles.shareOptionSub}>{t('recipeDetail.copyRecipeSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#607D8B" />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  jsonBackdrop: { flex: 1, backgroundColor: 'rgba(26, 46, 31, 0.5)', justifyContent: 'center', padding: 16 },
  jsonCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, maxHeight: '85%' },
  jsonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  jsonTitle: { fontSize: 16, fontWeight: '800', color: '#1A2E1F' },
  // Area scorrevole con altezza limitata dalla card: il JSON scorre dentro di essa
  jsonScroll: { flexShrink: 1, minHeight: 200, backgroundColor: '#F7F9F6', borderRadius: 10 },
  jsonScrollContent: { padding: 10 },
  jsonText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    color: '#1A2E1F',
    backgroundColor: '#F7F9F6',
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
    backgroundColor: '#34523C',
    borderRadius: 12,
    paddingVertical: 12,
  },
  jsonCopyText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  versionBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 },
  versionTabs: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: '#EAF0EB' },
  versionTab: { flex: 1, paddingVertical: 7, borderRadius: 11, alignItems: 'center' },
  versionTabActive: { backgroundColor: '#FFFFFF' },
  versionTabText: { fontSize: 13, fontWeight: '700', color: '#5E6D60' },
  versionTabTextActive: { color: '#34523C' },
  versionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  versionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4DDD6',
  },
  versionActionText: { fontSize: 12, fontWeight: '700', color: '#34523C' },
  versionActionBtnDisabled: { opacity: 0.45 },
  generateRow: { flexDirection: 'row', gap: 8 },
  generateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4DDD6',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  modalWrapper: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FBF9F5',
  },
  modalWrapperTablet: {
    maxWidth: 720,
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EFEBE4',
  },
  topNav: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2DCD1',
    backgroundColor: '#FBF9F5',
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EBE5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNavTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#2B332B',
    marginHorizontal: 12,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toastBanner: {
    backgroundColor: '#3E5C46',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  toastText: {
    color: '#FFF',
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
    width: '100%',
    aspectRatio: 16 / 10,
    maxHeight: 400,
    backgroundColor: '#EAE5DC',
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
  plantBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  plantBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A6B53',
  },
  content: {
    padding: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#EAF0EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A6B53',
    textTransform: 'uppercase',
  },
  diffBadge: {
    backgroundColor: '#FBEFEA',
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
    color: '#1C261E',
    lineHeight: 32,
    marginBottom: 16,
  },
  metricsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#EFEBE4',
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
    color: '#8A998D',
    marginTop: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B332B',
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#EFEBE4',
  },
  // Sticky Action Bar & Plan Drawer Styles
  stickyActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FBF9F5',
    borderTopWidth: 1,
    borderTopColor: '#EFEBE4',
    gap: 10,
    shadowColor: '#000',
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
    backgroundColor: '#34523C',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#1A2E1F',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  stickyPlanBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  stickyPlanDrawer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#EFEBE4',
    shadowColor: '#000',
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
  planDrawerCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3EFE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planDrawerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2B332B',
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
    backgroundColor: '#F3F5F3',
  },
  slotToggleActive: {
    backgroundColor: '#4A6B53',
  },
  slotToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556658',
  },
  slotToggleTextActive: {
    color: '#FFFFFF',
  },
  daysScroll: {
    flexDirection: 'row',
  },
  dayCard: {
    width: 58,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FBF9F5',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#EFEBE4',
  },
  dayCardToday: {
    borderColor: '#4A6B53',
    backgroundColor: '#EAF0EB',
  },
  dayCardSelected: {
    backgroundColor: '#34523C',
    borderColor: '#34523C',
  },
  dayCardName: {
    fontSize: 11,
    color: '#7E8B80',
    fontWeight: '600',
  },
  dayCardNameToday: {
    color: '#4A6B53',
  },
  dayCardNameSelected: {
    color: '#D4E8DA',
    fontWeight: '700',
  },
  dayCardNum: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B332B',
    marginTop: 2,
  },
  dayCardNumToday: {
    color: '#4A6B53',
  },
  dayCardNumSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  scalerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEBE4',
    marginBottom: 20,
  },
  scalerInfo: {
    flex: 1,
  },
  scalerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B332B',
  },
  scalerSub: {
    fontSize: 12,
    color: '#7E8B80',
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
    backgroundColor: '#F3F5F3',
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  presetChipActive: {
    backgroundColor: '#4A6B53',
    borderColor: '#4A6B53',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#556658',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scalerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F5F3',
    borderRadius: 12,
    padding: 4,
  },
  scaleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  scaleBtnDisabled: {
    backgroundColor: '#EAE5DC',
    opacity: 0.6,
  },
  scaleNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2B332B',
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
    color: '#4A6B53',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#F0ECE4',
  },
  ingredientMainTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  singleAddBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F3F5F3',
    marginLeft: 8,
  },
  ingredientRowChecked: {
    backgroundColor: '#F7F6F2',
    opacity: 0.6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#BDC7BE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4A6B53',
    borderColor: '#4A6B53',
  },
  ingredientText: {
    fontSize: 14,
    color: '#2B332B',
    flex: 1,
    lineHeight: 20,
  },
  ingredientTextChecked: {
    textDecorationLine: 'line-through',
    color: '#8A998D',
  },
  instructionsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B332B',
    marginBottom: 12,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EFEBE4',
  },
  stepCardDone: {
    backgroundColor: '#F8F9F8',
    opacity: 0.65,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepBadgeDone: {
    backgroundColor: '#4A6B53',
  },
  stepBadgeNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4A6B53',
  },
  stepText: {
    fontSize: 14,
    color: '#2B332B',
    lineHeight: 22,
    flex: 1,
  },
  stepTextDone: {
    textDecorationLine: 'line-through',
    color: '#7E8B80',
  },
  tipsBox: {
    backgroundColor: '#FAF5EE',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFE2D3',
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
    color: '#4A6B53',
  },
  tipsText: {
    fontSize: 13,
    color: '#5A635B',
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
    backgroundColor: '#EAE5DC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagPillText: {
    fontSize: 12,
    color: '#556658',
    fontWeight: '500',
  },
  // Notes Section Styles
  notesCard: {
    backgroundColor: '#FAF8F4',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E1D4',
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
    color: '#2B332B',
  },
  savedNoteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2F0D9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  savedNoteBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D5A27',
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#2B332B',
    borderWidth: 1,
    borderColor: '#DFD8CB',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  notesActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  notesSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A6B53',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  notesSaveBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  // Share Modal & Sheet Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  shareSheet: {
    backgroundColor: '#FBF9F5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    shadowColor: '#000',
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
    color: '#2B332B',
  },
  shareSheetSub: {
    fontSize: 13,
    color: '#7E8B80',
    marginTop: 2,
  },
  shareCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EBE5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  includeNotesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0ECE3',
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  includeNotesText: {
    fontSize: 13,
    color: '#3B473D',
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
    backgroundColor: '#F0F8FD',
    borderColor: '#D1EAF8',
  },
  shareOptionWhatsapp: {
    backgroundColor: '#F0FAF3',
    borderColor: '#D2F2DD',
  },
  shareOptionNative: {
    backgroundColor: '#F2F7F3',
    borderColor: '#D4E6D9',
  },
  shareOptionClipboard: {
    backgroundColor: '#F5F6F7',
    borderColor: '#DFE3E6',
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
    color: '#718075',
    marginTop: 1,
  },
});
