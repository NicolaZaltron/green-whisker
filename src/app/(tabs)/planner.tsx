import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  TextInput,
  FlatList
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { Recipe, MealPlanEntry } from '../../types/recipe';
import { getMealPlans, saveMealPlanEntry, deleteMealPlanEntry } from '../../db/database';
import { getWeekDays, aggregateAndAddToShopping } from '../../services/plannerService';
import { RecipeModal } from '../../components/RecipeModal';

const rawRecipes = require('../../../assets/ricette.json') as Recipe[];
const recipeMap: Record<string, Recipe> = {};
rawRecipes.forEach(r => {
  recipeMap[r.id] = r;
});

export default function PlannerScreen() {
  const weekDays = useMemo(() => getWeekDays(), []);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [plans, setPlans] = useState<MealPlanEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Recipe Picker Modal State
  const [pickerVisible, setPickerVisible] = useState(false);
  const [targetSlot, setTargetSlot] = useState<'pranzo' | 'cena'>('pranzo');
  const [pickerQuery, setPickerQuery] = useState('');
  const [selectedDetailRecipe, setSelectedDetailRecipe] = useState<Recipe | null>(null);

  const loadPlans = async () => {
    const list = await getMealPlans();
    setPlans(list);
  };

  useFocusEffect(
    useCallback(() => {
      loadPlans();
    }, [])
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Plans for the currently selected day
  const dayPlans = useMemo(() => {
    return {
      pranzo: plans.find(p => p.date === selectedDate && p.slot === 'pranzo'),
      cena: plans.find(p => p.date === selectedDate && p.slot === 'cena'),
    };
  }, [plans, selectedDate]);

  const handleOpenPicker = (slot: 'pranzo' | 'cena') => {
    setTargetSlot(slot);
    setPickerQuery('');
    setPickerVisible(true);
  };

  const handleSelectRecipeForSlot = async (recipe: Recipe) => {
    await saveMealPlanEntry({
      date: selectedDate,
      slot: targetSlot,
      recipeId: recipe.id,
      servings: recipe.porzioni || 4
    });
    setPickerVisible(false);
    loadPlans();
    showToast(`Pianificato per ${targetSlot === 'pranzo' ? 'Pranzo' : 'Cena'}! 🌿`);
  };

  const handleDeleteSlot = async (id: string) => {
    await deleteMealPlanEntry(id);
    loadPlans();
    showToast('Pasto rimosso dal piano.');
  };

  const handleGenerateShopping = async () => {
    if (plans.length === 0) {
      showToast('Nessun pasto pianificato al momento.');
      return;
    }
    const count = await aggregateAndAddToShopping(plans, recipeMap);
    showToast(`🛒 ${count} ingredienti generati e aggiunti alla Spesa!`);
  };

  const pickerFiltered = useMemo(() => {
    if (!pickerQuery.trim()) return rawRecipes.slice(0, 30);
    const q = pickerQuery.toLowerCase().trim();
    return rawRecipes
      .filter(r => r.titolo.toLowerCase().includes(q) || r.categoria.toLowerCase().includes(q))
      .slice(0, 40);
  }, [pickerQuery]);

  const selectedDayInfo = weekDays.find(d => d.dateString === selectedDate) || weekDays[0];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainWrapper}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="calendar" size={20} color="#4A6B53" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Meal Planner</Text>
              <Text style={styles.subtitle}>Pianifica la tua settimana botanica</Text>
            </View>

            {plans.length > 0 && (
              <TouchableOpacity
                style={styles.genShoppingBtn}
                onPress={handleGenerateShopping}
                activeOpacity={0.8}
              >
                <Ionicons name="cart" size={16} color="#FFF" />
                <Text style={styles.genShoppingBtnText}>Crea Spesa</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Toast */}
        {toastMessage && (
          <View style={styles.toastBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        )}

        {/* Days of Week Horizontal Bar */}
        <View style={styles.daysBarWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysBar}>
            {weekDays.map(d => {
              const isSelected = d.dateString === selectedDate;
              const hasMeal = plans.some(p => p.date === d.dateString);
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
                  {hasMeal && <View style={[styles.mealDot, isSelected && styles.mealDotSelected]} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Selected Day Content */}
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayHeading}>
              {selectedDayInfo.dayName} {selectedDayInfo.dayNumber}
            </Text>
            <Text style={styles.daySub}>
              {plans.filter(p => p.date === selectedDate).length} pasti pianificati
            </Text>
          </View>

          {/* Pranzo Slot */}
          <View style={styles.slotContainer}>
            <View style={styles.slotHeader}>
              <View style={styles.slotBadge}>
                <Ionicons name="sunny-outline" size={16} color="#4A6B53" />
                <Text style={styles.slotBadgeText}>PRANZO</Text>
              </View>
            </View>

            {dayPlans.pranzo ? (
              <View style={styles.mealCard}>
                {recipeMap[dayPlans.pranzo.recipe_id]?.immagine ? (
                  <Image
                    source={{ uri: recipeMap[dayPlans.pranzo.recipe_id].immagine }}
                    style={styles.mealImage}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : (
                  <View style={[styles.mealImage, styles.mealImagePlaceholder]}>
                    <Ionicons name="restaurant-outline" size={24} color="#A3B2A6" />
                  </View>
                )}
                <View style={styles.mealInfo}>
                  <Text style={styles.mealCategory}>
                    {recipeMap[dayPlans.pranzo.recipe_id]?.categoria || 'Ricetta'}
                  </Text>
                  <Text style={styles.mealTitle} numberOfLines={2}>
                    {recipeMap[dayPlans.pranzo.recipe_id]?.titolo || 'Ricetta Pianificata'}
                  </Text>
                  <View style={styles.mealMeta}>
                    <Ionicons name="people-outline" size={14} color="#7E8B80" style={{ marginRight: 3 }} />
                    <Text style={styles.mealMetaText}>{dayPlans.pranzo.servings} porzioni</Text>
                  </View>
                </View>

                <View style={styles.mealActions}>
                  <TouchableOpacity
                    style={styles.viewMealBtn}
                    onPress={() => setSelectedDetailRecipe(recipeMap[dayPlans.pranzo!.recipe_id])}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="book-outline" size={18} color="#4A6B53" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteMealBtn}
                    onPress={() => handleDeleteSlot(dayPlans.pranzo!.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#D9534F" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.emptySlot}
                onPress={() => handleOpenPicker('pranzo')}
                activeOpacity={0.8}
              >
                <View style={styles.addSlotCircle}>
                  <Ionicons name="add" size={20} color="#4A6B53" />
                </View>
                <Text style={styles.emptySlotText}>Scegli cosa cucinare a pranzo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cena Slot */}
          <View style={styles.slotContainer}>
            <View style={styles.slotHeader}>
              <View style={[styles.slotBadge, { backgroundColor: '#FDF0EE' }]}>
                <Ionicons name="moon-outline" size={16} color="#D97757" />
                <Text style={[styles.slotBadgeText, { color: '#D97757' }]}>CENA</Text>
              </View>
            </View>

            {dayPlans.cena ? (
              <View style={styles.mealCard}>
                {recipeMap[dayPlans.cena.recipe_id]?.immagine ? (
                  <Image
                    source={{ uri: recipeMap[dayPlans.cena.recipe_id].immagine }}
                    style={styles.mealImage}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : (
                  <View style={[styles.mealImage, styles.mealImagePlaceholder]}>
                    <Ionicons name="restaurant-outline" size={24} color="#A3B2A6" />
                  </View>
                )}
                <View style={styles.mealInfo}>
                  <Text style={styles.mealCategory}>
                    {recipeMap[dayPlans.cena.recipe_id]?.categoria || 'Ricetta'}
                  </Text>
                  <Text style={styles.mealTitle} numberOfLines={2}>
                    {recipeMap[dayPlans.cena.recipe_id]?.titolo || 'Ricetta Pianificata'}
                  </Text>
                  <View style={styles.mealMeta}>
                    <Ionicons name="people-outline" size={14} color="#7E8B80" style={{ marginRight: 3 }} />
                    <Text style={styles.mealMetaText}>{dayPlans.cena.servings} porzioni</Text>
                  </View>
                </View>

                <View style={styles.mealActions}>
                  <TouchableOpacity
                    style={styles.viewMealBtn}
                    onPress={() => setSelectedDetailRecipe(recipeMap[dayPlans.cena!.recipe_id])}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="book-outline" size={18} color="#4A6B53" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteMealBtn}
                    onPress={() => handleDeleteSlot(dayPlans.cena!.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#D9534F" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.emptySlot}
                onPress={() => handleOpenPicker('cena')}
                activeOpacity={0.8}
              >
                <View style={[styles.addSlotCircle, { backgroundColor: '#FDF0EE' }]}>
                  <Ionicons name="add" size={20} color="#D97757" />
                </View>
                <Text style={styles.emptySlotText}>Scegli cosa preparare per cena</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Recipe Picker Modal */}
        <Modal
          visible={pickerVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPickerVisible(false)}
        >
          <SafeAreaView style={styles.pickerSafeArea}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                style={styles.pickerCloseBtn}
                onPress={() => setPickerVisible(false)}
              >
                <Ionicons name="close" size={24} color="#2B332B" />
              </TouchableOpacity>
              <Text style={styles.pickerHeaderTitle}>
                Pianifica per {targetSlot === 'pranzo' ? 'Pranzo' : 'Cena'}
              </Text>
              <View style={{ width: 36 }} />
            </View>

            <View style={styles.pickerSearch}>
              <Ionicons name="search" size={18} color="#7E8B80" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.pickerInput}
                placeholder="Cerca ricetta tra le 814 disponibili..."
                placeholderTextColor="#8C988F"
                value={pickerQuery}
                onChangeText={setPickerQuery}
                autoFocus
              />
            </View>

            <FlatList
              data={pickerFiltered}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => handleSelectRecipeForSlot(item)}
                  activeOpacity={0.7}
                >
                  {item.immagine ? (
                    <Image
                      source={{ uri: item.immagine }}
                      style={styles.pickerThumb}
                      contentFit="cover"
                      cachePolicy="disk"
                    />
                  ) : (
                    <View style={[styles.pickerThumb, { backgroundColor: '#EAE5DC' }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemCat}>{item.categoria}</Text>
                    <Text style={styles.pickerItemTitle}>{item.titolo}</Text>
                    <Text style={styles.pickerItemMeta}>
                      {item.tempi.tempo_totale_minuti} min • {item.porzioni} porzioni
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color="#4A6B53" />
                </TouchableOpacity>
              )}
            />
          </SafeAreaView>
        </Modal>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#243328',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#718073',
  },
  genShoppingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A6B53',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#4A6B53',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  genShoppingBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
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
  daysBarWrapper: {
    paddingVertical: 8,
  },
  daysBar: {
    paddingHorizontal: 20,
    gap: 8,
  },
  dayChip: {
    width: 62,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECE7DF',
    position: 'relative',
  },
  dayChipSelected: {
    backgroundColor: '#4A6B53',
    borderColor: '#4A6B53',
  },
  dayChipToday: {
    borderColor: '#4A6B53',
    borderWidth: 2,
  },
  dayChipName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7E8B80',
    textTransform: 'uppercase',
  },
  dayChipNameSelected: {
    color: '#FFFFFF',
  },
  dayChipNum: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B332B',
    marginTop: 4,
  },
  dayChipNumSelected: {
    color: '#FFFFFF',
  },
  mealDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4A6B53',
    marginTop: 4,
  },
  mealDotSelected: {
    backgroundColor: '#FFF',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  dayHeader: {
    marginTop: 12,
    marginBottom: 16,
  },
  dayHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B332B',
  },
  daySub: {
    fontSize: 12,
    color: '#7E8B80',
    marginTop: 2,
  },
  slotContainer: {
    marginBottom: 20,
  },
  slotHeader: {
    marginBottom: 8,
  },
  slotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EAF0EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  slotBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B53',
    letterSpacing: 0.5,
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  mealImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 12,
  },
  mealImagePlaceholder: {
    backgroundColor: '#EAE5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealInfo: {
    flex: 1,
  },
  mealCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4A6B53',
    textTransform: 'uppercase',
  },
  mealTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2B332B',
    marginTop: 2,
    lineHeight: 20,
  },
  mealMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  mealMetaText: {
    fontSize: 12,
    color: '#7E8B80',
    fontWeight: '500',
  },
  mealActions: {
    flexDirection: 'row',
    gap: 6,
  },
  viewMealBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteMealBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FDF0EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    borderStyle: 'dashed',
    gap: 12,
  },
  addSlotCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7E8B80',
  },
  pickerSafeArea: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  pickerHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE7DF',
  },
  pickerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAE5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B332B',
  },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  pickerInput: {
    flex: 1,
    fontSize: 14,
    color: '#2B332B',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    gap: 12,
  },
  pickerThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  pickerItemCat: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4A6B53',
    textTransform: 'uppercase',
  },
  pickerItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B332B',
    marginTop: 1,
  },
  pickerItemMeta: {
    fontSize: 11,
    color: '#7E8B80',
    marginTop: 2,
  },
});
