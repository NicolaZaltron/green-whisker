import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  SafeAreaView,
  StatusBar
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Recipe, IngredientItem } from '../types/recipe';
import { useResponsiveDimensions } from '../hooks/useResponsiveDimensions';
import { isFavorite, toggleFavorite, addShoppingItems, saveMealPlanEntry } from '../db/database';
import { getWeekDays } from '../services/plannerService';
import { scaleIngredient } from '../utils/servingsScaler';

interface RecipeModalProps {
  recipe: Recipe | null;
  visible: boolean;
  onClose: () => void;
  onFavoriteChange?: (isFav: boolean) => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({ recipe, visible, onClose, onFavoriteChange }) => {
  const { width } = useResponsiveDimensions();
  const [currentServings, setCurrentServings] = useState<number>(recipe?.porzioni || 4);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [favorite, setFavorite] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<'pranzo' | 'cena'>('pranzo');

  const weekDays = getWeekDays();

  // Reset & load favorite status
  useEffect(() => {
    if (recipe) {
      setCurrentServings(recipe.porzioni || 4);
      setCheckedIngredients({});
      setCompletedSteps({});
      setFeedbackMessage(null);
      setShowPlanPicker(false);

      isFavorite(recipe.id).then(setFavorite);
    }
  }, [recipe?.id]);

  if (!recipe || !visible) return null;

  const baseServings = recipe.porzioni || 4;
  const scale = currentServings / baseServings;

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 2800);
  };

  const handleToggleFavorite = async () => {
    const newFav = await toggleFavorite(recipe.id);
    setFavorite(newFav);
    if (onFavoriteChange) onFavoriteChange(newFav);
    showToast(newFav ? 'Aggiunta ai Preferiti ❤️' : 'Rimossa dai Preferiti');
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
    return scaleIngredient(item.quantita, item.unita, item.ingrediente, item.testo, scale).formattedText;
  };

  const handleAddSingleToShopping = async (item: IngredientItem) => {
    const scaled = scaleIngredient(item.quantita, item.unita, item.ingrediente, item.testo, scale);
    await addShoppingItems([{
      recipeId: recipe.id,
      recipeTitle: `${recipe.titolo} (${currentServings} porz.)`,
      ingredientText: scaled.formattedText,
      name: scaled.name,
      amount: scaled.scaledAmount,
      unit: scaled.unit,
      category: item.sezione || 'Generale'
    }]);
    showToast(`🛒 "${scaled.name}" aggiunto per ${currentServings} porzioni!`);
  };

  const handleAddAllToShopping = async () => {
    const itemsToAdd: Array<{
      recipeId: string;
      recipeTitle: string;
      ingredientText: string;
      name: string;
      amount?: number | null;
      unit?: string;
      category?: string;
    }> = [];

    const titleWithServings = `${recipe.titolo} (${currentServings} porz.)`;

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

    await addShoppingItems(itemsToAdd);
    showToast(`🛒 ${itemsToAdd.length} ingredienti aggiunti per ${currentServings} porzioni!`);
  };

  const handleScheduleMeal = async (dateStr: string) => {
    await saveMealPlanEntry({
      date: dateStr,
      slot: selectedSlot,
      recipeId: recipe.id,
      servings: currentServings
    });
    setShowPlanPicker(false);
    showToast(`📅 Pianificato per ${selectedSlot === 'pranzo' ? 'Pranzo' : 'Cena'}!`);
  };

  // Group detailed ingredients by section
  const sections: { title: string; items: IngredientItem[] }[] = [];
  const secMap: Record<string, IngredientItem[]> = {};

  (recipe.ingredienti_dettagliati || []).forEach(item => {
    const sec = item.sezione || 'Ingredienti';
    if (!secMap[sec]) {
      secMap[sec] = [];
      sections.push({ title: sec, items: secMap[sec] });
    }
    secMap[sec].push(item);
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.modalWrapper, width >= 768 && styles.modalWrapperTablet]}>
          {/* Navigation Bar Header */}
          <View style={styles.topNav}>
            <TouchableOpacity style={styles.navBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color="#2B332B" />
            </TouchableOpacity>

            <Text style={styles.topNavTitle} numberOfLines={1}>
              {recipe.titolo}
            </Text>

            <View style={styles.navActions}>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={handleToggleFavorite}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={favorite ? 'heart' : 'heart-outline'}
                  size={22}
                  color={favorite ? '#D9534F' : '#4A6B53'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navBtn, { marginLeft: 8 }]}
                onPress={() => Linking.openURL(recipe.url)}
                activeOpacity={0.7}
              >
                <Ionicons name="open-outline" size={20} color="#4A6B53" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Feedback Toast */}
          {feedbackMessage && (
            <View style={styles.toastBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.toastText}>{feedbackMessage}</Text>
            </View>
          )}

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Main Image with expo-image */}
            {recipe.immagine ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: recipe.immagine }}
                  style={styles.image}
                  contentFit="cover"
                  transition={250}
                  cachePolicy="disk"
                />
                <View style={styles.plantBadge}>
                  <Ionicons name="leaf" size={13} color="#4A6B53" style={{ marginRight: 4 }} />
                  <Text style={styles.plantBadgeText}>100% Vegetale</Text>
                </View>
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
                  <Text style={styles.categoryBadgeText}>{recipe.categoria}</Text>
                </View>
                <View style={styles.diffBadge}>
                  <Ionicons name="speedometer-outline" size={12} color="#D97757" style={{ marginRight: 3 }} />
                  <Text style={styles.diffBadgeText}>{recipe.difficolta}</Text>
                </View>
              </View>

              <Text style={styles.title}>{recipe.titolo}</Text>

              {/* Quick Metrics Bar */}
              <View style={styles.metricsBar}>
                <View style={styles.metricItem}>
                  <Ionicons name="time-outline" size={20} color="#4A6B53" />
                  <Text style={styles.metricLabel}>TEMPO</Text>
                  <Text style={styles.metricValue}>{recipe.tempi.tempo_totale_minuti} min</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="people-outline" size={20} color="#4A6B53" />
                  <Text style={styles.metricLabel}>PORZIONI</Text>
                  <Text style={styles.metricValue}>{currentServings}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="bar-chart-outline" size={20} color="#4A6B53" />
                  <Text style={styles.metricLabel}>LIVELLO</Text>
                  <Text style={styles.metricValue}>{recipe.difficolta}</Text>
                </View>
              </View>

              {/* Quick Action Hub: Spesa & Planner */}
              <View style={styles.actionHub}>
                <TouchableOpacity
                  style={styles.actionHubBtn}
                  onPress={handleAddAllToShopping}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cart-outline" size={18} color="#4A6B53" />
                  <Text style={styles.actionHubBtnText}>Aggiungi alla Spesa</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionHubBtn, styles.actionHubBtnAlt]}
                  onPress={() => setShowPlanPicker(!showPlanPicker)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={18} color="#D97757" />
                  <Text style={[styles.actionHubBtnText, { color: '#D97757' }]}>Pianifica Pasto</Text>
                </TouchableOpacity>
              </View>

              {/* Meal Plan Quick Picker Drawer */}
              {showPlanPicker && (
                <View style={styles.planDrawer}>
                  <Text style={styles.planDrawerTitle}>Scegli quando cucinare questa ricetta:</Text>
                  <View style={styles.slotToggleRow}>
                    <TouchableOpacity
                      style={[styles.slotToggle, selectedSlot === 'pranzo' && styles.slotToggleActive]}
                      onPress={() => setSelectedSlot('pranzo')}
                    >
                      <Ionicons name="sunny-outline" size={14} color={selectedSlot === 'pranzo' ? '#FFF' : '#4A6B53'} />
                      <Text style={[styles.slotToggleText, selectedSlot === 'pranzo' && styles.slotToggleTextActive]}>
                        Pranzo
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.slotToggle, selectedSlot === 'cena' && styles.slotToggleActive]}
                      onPress={() => setSelectedSlot('cena')}
                    >
                      <Ionicons name="moon-outline" size={14} color={selectedSlot === 'cena' ? '#FFF' : '#4A6B53'} />
                      <Text style={[styles.slotToggleText, selectedSlot === 'cena' && styles.slotToggleTextActive]}>
                        Cena
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
                    {weekDays.map(d => (
                      <TouchableOpacity
                        key={d.dateString}
                        style={[styles.dayCard, d.isToday && styles.dayCardToday]}
                        onPress={() => handleScheduleMeal(d.dateString)}
                      >
                        <Text style={[styles.dayCardName, d.isToday && styles.dayCardNameToday]}>
                          {d.dayName.slice(0, 3)}
                        </Text>
                        <Text style={[styles.dayCardNum, d.isToday && styles.dayCardNumToday]}>
                          {d.dayNumber}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Dynamic Servings Scaler with Quick Presets */}
              <View style={styles.scalerCard}>
                <View style={styles.scalerInfo}>
                  <Text style={styles.scalerTitle}>Dosi e ingredienti</Text>
                  <Text style={styles.scalerSub}>
                    {scale !== 1 ? `Ricalcolate per ${currentServings} porzioni` : (recipe.porzioni_testo || `Per ${baseServings} porzioni`)}
                    {scale !== 1 && ` (base: ${baseServings})`}
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
                          {num}p
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

                          <TouchableOpacity
                            style={styles.singleAddBtn}
                            onPress={() => handleAddSingleToShopping(ing)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="cart-outline" size={16} color="#7E8B80" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Instructions */}
              <View style={styles.instructionsSection}>
                <Text style={styles.sectionTitle}>Preparazione</Text>
                {recipe.istruzioni.map((step, idx) => {
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

              {/* Tips & Storage */}
              {recipe.suggerimenti && recipe.suggerimenti.length > 0 && (
                <View style={styles.tipsBox}>
                  <View style={styles.tipsHeader}>
                    <Ionicons name="bulb-outline" size={20} color="#4A6B53" />
                    <Text style={styles.tipsTitle}>I consigli per te</Text>
                  </View>
                  {recipe.suggerimenti.map((sugg, idx) => (
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

              <View style={{ height: 40 }} />
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
    borderBottomColor: '#EFEBE4',
    backgroundColor: '#FBF9F5',
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
    fontWeight: '600',
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
  actionHub: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionHubBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF0EB',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#D4E2D6',
  },
  actionHubBtnAlt: {
    backgroundColor: '#FDF3EE',
    borderColor: '#F6DDD2',
  },
  actionHubBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4A6B53',
  },
  planDrawer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EFEBE4',
  },
  planDrawerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2B332B',
    marginBottom: 10,
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
  dayCardName: {
    fontSize: 11,
    color: '#7E8B80',
    fontWeight: '600',
  },
  dayCardNameToday: {
    color: '#4A6B53',
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
});
