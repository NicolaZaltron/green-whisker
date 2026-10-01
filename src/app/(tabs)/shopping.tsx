import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { Recipe, ShoppingItem } from '../../types/recipe';
import {
  getShoppingItems,
  toggleShoppingItem,
  deleteShoppingItem,
  clearCheckedShoppingItems,
  clearAllShoppingItems,
  addShoppingItems,
  getMealPlans,
  getCustomRecipes,
  consolidateShoppingList,
} from '../../db/database';
import { getWeekDays, aggregateAndAddToShopping } from '../../services/plannerService';
import { cleanShoppingIngredientText } from '../../utils/servingsScaler';
import {
  SHOPPING_DEPARTMENTS,
  ShoppingDepartment,
  DEPARTMENT_ICONS,
  DEPARTMENT_COLORS,
} from '../../constants/shoppingDepartments';
import { classifyShoppingDepartment } from '../../utils/shoppingClassifier';
import {
  shareNative,
  copyRecipeToClipboard,
  formatShoppingListShareText,
} from '../../utils/shareHelper';

interface DepartmentSection {
  department: ShoppingDepartment;
  data: ShoppingItem[];
  total: number;
  checkedCount: number;
  isAllChecked: boolean;
}

const rawRecipes = require('../../../assets/ricette.json') as Recipe[];

export default function ShoppingScreen() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<ShoppingDepartment | 'ALL'>('ALL');
  const [manualDeptOverride, setManualDeptOverride] = useState<ShoppingDepartment | null>(null);
  const [showDeptPickerModal, setShowDeptPickerModal] = useState(false);
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadItems = async () => {
    await consolidateShoppingList();
    const list = await getShoppingItems();
    setItems(list);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
    showToast('Spesa aggiornata e unificata');
  };

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [])
  );

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast(null);
    }, 2800);
  };

  // Reparto rilevato in tempo reale per l'input manuale
  const detectedDept: ShoppingDepartment = useMemo(() => {
    if (manualDeptOverride) return manualDeptOverride;
    if (!newItemText.trim()) return 'Varie';
    return classifyShoppingDepartment(newItemText.trim());
  }, [newItemText, manualDeptOverride]);

  const completedCount = useMemo(() => items.filter(i => i.checked).length, [items]);

  // Raggruppamento per i 15 reparti del supermercato
  const groupedSections: DepartmentSection[] = useMemo(() => {
    const map = new Map<ShoppingDepartment, ShoppingItem[]>();
    for (const d of SHOPPING_DEPARTMENTS) {
      map.set(d, []);
    }

    for (const item of items) {
      const dept = (
        SHOPPING_DEPARTMENTS.includes(item.category as any)
          ? item.category
          : classifyShoppingDepartment(item.name || item.ingredient_text)
      ) as ShoppingDepartment;

      map.get(dept)?.push({ ...item, category: dept });
    }

    const sections: DepartmentSection[] = [];
    for (const dept of SHOPPING_DEPARTMENTS) {
      const deptItems = map.get(dept) || [];
      if (deptItems.length > 0) {
        const checked = deptItems.filter(i => i.checked).length;
        sections.push({
          department: dept,
          data: collapsedDepts[dept] ? [] : deptItems,
          total: deptItems.length,
          checkedCount: checked,
          isAllChecked: checked === deptItems.length,
        });
      }
    }
    return sections;
  }, [items, collapsedDepts]);

  // Sezioni filtrate in base alla pillola selezionata
  const displayedSections = useMemo(() => {
    if (selectedDeptFilter === 'ALL') {
      return groupedSections;
    }
    return groupedSections.filter(s => s.department === selectedDeptFilter);
  }, [groupedSections, selectedDeptFilter]);

  // Statistiche reparti attivi
  const activeDepartmentsCount = groupedSections.length;

  const handleToggle = async (id: string) => {
    await toggleShoppingItem(id);
    loadItems();
  };

  const handleDelete = async (id: string) => {
    await deleteShoppingItem(id);
    loadItems();
  };

  const handleClearCompleted = async () => {
    if (completedCount === 0) return;
    await clearCheckedShoppingItems();
    loadItems();
    showToast('Articoli spuntati rimossi');
  };

  const handleClearAll = () => {
    if (items.length === 0) return;
    Alert.alert(
      'Svuota lista della spesa',
      'Vuoi davvero eliminare tutti gli articoli dalla lista?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Svuota tutto',
          style: 'destructive',
          onPress: async () => {
            await clearAllShoppingItems();
            loadItems();
            setSelectedDeptFilter('ALL');
            showToast('Lista della spesa svuotata');
          },
        },
      ]
    );
  };

  const handleAddManual = async () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;

    const chosenDept = manualDeptOverride || classifyShoppingDepartment(trimmed);

    await addShoppingItems([
      {
        ingredientText: trimmed,
        name: trimmed,
        category: chosenDept,
      },
    ]);

    setNewItemText('');
    setManualDeptOverride(null);
    loadItems();
    showToast(`Aggiunto in "${chosenDept}"`);
  };

  const toggleCollapse = (dept: string) => {
    setCollapsedDepts(prev => ({
      ...prev,
      [dept]: !prev[dept],
    }));
  };

  const handleShare = async () => {
    if (items.length === 0) {
      Alert.alert('Lista vuota', 'Aggiungi prima degli articoli da condividere.');
      return;
    }

    const shareText = formatShoppingListShareText(items);
    const shared = await shareNative('Lista della Spesa Green-Whisker', shareText);
    if (!shared) {
      await copyRecipeToClipboard(shareText);
      showToast('Lista copiata negli appunti!');
    }
  };

  const handleSyncWeekPlan = async () => {
    try {
      const plans = await getMealPlans();
      const { days } = getWeekDays(0);
      const weekDates = new Set(days.map(d => d.dateString));
      const weekPlans = plans.filter(p => weekDates.has(p.date));

      if (weekPlans.length === 0) {
        showToast('Nessun pasto pianificato per questa settimana');
        return;
      }

      const map: Record<string, Recipe> = {};
      rawRecipes.forEach(r => { map[r.id] = r; });
      const custom = await getCustomRecipes();
      custom.forEach(r => { map[r.id] = r; });

      const count = await aggregateAndAddToShopping(weekPlans, map);
      await loadItems();
      showToast(`Sommati ${count} ingredienti della settimana!`);
    } catch (e) {
      console.error('Error syncing week plan to shopping list:', e);
      showToast('Errore durante la sincronizzazione');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="cart" size={22} color="#34523C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Lista della Spesa</Text>
              <Text style={styles.subtitle}>
                {items.length === 0
                  ? 'Nessun ingrediente in lista'
                  : `${completedCount} di ${items.length} completati • ${activeDepartmentsCount} ${
                      activeDepartmentsCount === 1 ? 'reparto' : 'reparti'
                    }`}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={handleSyncWeekPlan}
                activeOpacity={0.7}
                accessibilityLabel="Sincronizza e somma piano settimanale"
              >
                <Ionicons name="calendar-outline" size={17} color="#34523C" />
              </TouchableOpacity>

              {items.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={handleShare}
                    activeOpacity={0.7}
                    accessibilityLabel="Condividi lista"
                  >
                    <Ionicons name="share-outline" size={17} color="#34523C" />
                  </TouchableOpacity>

                  {completedCount > 0 && (
                    <TouchableOpacity
                      style={styles.headerActionBtn}
                      onPress={handleClearCompleted}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="checkbox-outline" size={16} color="#34523C" />
                      <Text style={styles.headerActionText}>Rimuovi spuntati</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.headerActionBtn, { borderColor: '#EBDAD5' }]}
                    onPress={handleClearAll}
                    activeOpacity={0.7}
                    accessibilityLabel="Svuota lista"
                  >
                    <Ionicons name="trash-outline" size={16} color="#D9534F" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Quick manual item adder */}
          <View style={styles.inputContainer}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Aggiungi ingrediente (es. Olio EVO, Zucchine, Tofu)..."
                placeholderTextColor="#8C988F"
                value={newItemText}
                onChangeText={text => {
                  setNewItemText(text);
                  // Resetta l'override manuale se si svuota il testo
                  if (!text.trim()) setManualDeptOverride(null);
                }}
                onSubmitEditing={handleAddManual}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addBtn, !newItemText.trim() && styles.addBtnDisabled]}
                onPress={handleAddManual}
                disabled={!newItemText.trim()}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Smart department badge indicator with change button */}
            {newItemText.trim().length > 0 && (
              <View style={styles.detectedDeptRow}>
                <Text style={styles.detectedDeptLabel}>Reparto:</Text>
                <TouchableOpacity
                  style={[
                    styles.detectedDeptBadge,
                    {
                      backgroundColor: DEPARTMENT_COLORS[detectedDept]?.bg || '#EAF0EB',
                      borderColor: DEPARTMENT_COLORS[detectedDept]?.border || '#CDE5CF',
                    },
                  ]}
                  onPress={() => setShowDeptPickerModal(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={(DEPARTMENT_ICONS[detectedDept] as any) || 'basket-outline'}
                    size={13}
                    color={DEPARTMENT_COLORS[detectedDept]?.text || '#34523C'}
                  />
                  <Text
                    style={[
                      styles.detectedDeptText,
                      { color: DEPARTMENT_COLORS[detectedDept]?.text || '#34523C' },
                    ]}
                  >
                    {detectedDept}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color="#7E8B80" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Filter Pills (Active Departments) */}
          {groupedSections.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsContainer}
            >
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  selectedDeptFilter === 'ALL' && styles.filterPillActive,
                ]}
                onPress={() => setSelectedDeptFilter('ALL')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    selectedDeptFilter === 'ALL' && styles.filterPillTextActive,
                  ]}
                >
                  Tutti ({items.length})
                </Text>
              </TouchableOpacity>

              {groupedSections.map(sec => {
                const isActive = selectedDeptFilter === sec.department;
                const colors = DEPARTMENT_COLORS[sec.department];
                const iconName = (DEPARTMENT_ICONS[sec.department] as any) || 'basket-outline';

                return (
                  <TouchableOpacity
                    key={sec.department}
                    style={[
                      styles.filterPill,
                      isActive && {
                        backgroundColor: colors.bg,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() =>
                      setSelectedDeptFilter(prev => (prev === sec.department ? 'ALL' : sec.department))
                    }
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={iconName}
                      size={14}
                      color={isActive ? colors.text : '#5A6B5E'}
                    />
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && { color: colors.text, fontWeight: '700' },
                      ]}
                    >
                      {sec.department} ({sec.total})
                    </Text>
                    {sec.isAllChecked && (
                      <Ionicons name="checkmark-circle" size={13} color="#34523C" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* SectionList divided by Departments */}
        <SectionList
          sections={displayedSections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#34523C"
              colors={['#34523C']}
            />
          }
          renderSectionHeader={({ section }) => {
            const colors = DEPARTMENT_COLORS[section.department] || {
              bg: '#EAF0EB',
              text: '#34523C',
              border: '#CCE7D4',
            };
            const iconName =
              (DEPARTMENT_ICONS[section.department] as any) || 'basket-outline';
            const isCollapsed = Boolean(collapsedDepts[section.department]);

            return (
              <View style={styles.sectionHeaderWrapper}>
                <TouchableOpacity
                  style={[
                    styles.sectionHeader,
                    section.isAllChecked && styles.sectionHeaderAllChecked,
                  ]}
                  onPress={() => toggleCollapse(section.department)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sectionIconCircle, { backgroundColor: colors.bg }]}>
                    <Ionicons name={iconName} size={17} color={colors.text} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.sectionTitleRow}>
                      <Text style={styles.sectionTitle}>{section.department}</Text>
                      {section.isAllChecked && (
                        <View style={styles.completedBadge}>
                          <Ionicons name="checkmark" size={11} color="#FFF" />
                          <Text style={styles.completedBadgeText}>Completato</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.sectionSubtitle}>
                      {section.checkedCount} di {section.total} presi
                    </Text>
                  </View>

                  <View style={styles.collapseBtn}>
                    <Ionicons
                      name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                      size={18}
                      color="#8A998D"
                    />
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
          renderItem={({ item }) => (
            <View style={[styles.itemCard, item.checked && styles.itemCardChecked]}>
              <TouchableOpacity
                style={styles.checkArea}
                onPress={() => handleToggle(item.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                  {item.checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
                <View style={styles.itemContent}>
                  <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>
                    {cleanShoppingIngredientText(item.ingredient_text, item.name)}
                  </Text>
                  {item.recipe_title && (
                    <Text style={styles.itemRecipe}>Da: {item.recipe_title}</Text>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color="#A3B2A6" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="basket-outline" size={44} color="#34523C" />
              </View>
              <Text style={styles.emptyTitle}>
                {selectedDeptFilter !== 'ALL'
                  ? `Nessun articolo in "${selectedDeptFilter}"`
                  : 'La tua spesa è vuota'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {selectedDeptFilter !== 'ALL'
                  ? 'Prova a selezionare "Tutti" oppure aggiungi un nuovo ingrediente per questo reparto.'
                  : 'Aggiungi ingredienti pianificando i pasti nel Meal Planner, esplorando una ricetta o scrivendoli in alto.'}
              </Text>
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => router.push('/(tabs)')}
                activeOpacity={0.8}
              >
                <Ionicons name="restaurant-outline" size={18} color="#FFF" />
                <Text style={styles.exploreBtnText}>Sfoglia le ricette</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exploreBtn, { backgroundColor: '#EAF0EB', marginTop: 10, shadowOpacity: 0 }]}
                onPress={handleSyncWeekPlan}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={18} color="#34523C" />
                <Text style={[styles.exploreBtnText, { color: '#34523C' }]}>
                  Somma ingredienti della settimana
                </Text>
              </TouchableOpacity>
            </View>
          }
        />

        {/* Modal per selezione manuale del reparto */}
        <Modal
          visible={showDeptPickerModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeptPickerModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowDeptPickerModal(false)}
          >
            <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Scegli il Reparto</Text>
                <TouchableOpacity
                  onPress={() => setShowDeptPickerModal(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {SHOPPING_DEPARTMENTS.map(dept => {
                  const colors = DEPARTMENT_COLORS[dept];
                  const iconName = (DEPARTMENT_ICONS[dept] as any) || 'basket-outline';
                  const isSelected = detectedDept === dept;

                  return (
                    <TouchableOpacity
                      key={dept}
                      style={[
                        styles.deptOptionRow,
                        isSelected && { backgroundColor: colors.bg, borderColor: colors.border },
                      ]}
                      onPress={() => {
                        setManualDeptOverride(dept);
                        setShowDeptPickerModal(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.deptOptionIcon, { backgroundColor: colors.bg }]}>
                        <Ionicons name={iconName} size={18} color={colors.text} />
                      </View>
                      <Text
                        style={[
                          styles.deptOptionText,
                          isSelected && { color: colors.text, fontWeight: '700' },
                        ]}
                      >
                        {dept}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={18} color={colors.text} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Floating Toast Notification */}
        {feedbackToast && (
          <View style={styles.toast}>
            <Ionicons name="information-circle" size={18} color="#FFF" />
            <Text style={styles.toastText}>{feedbackToast}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: '#243328',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#67786B',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E3DB',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34523C',
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#FAF8F5',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#EAE5DC',
    color: '#243328',
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#34523C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#C4CDC6',
    opacity: 0.6,
  },
  detectedDeptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  detectedDeptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#718073',
  },
  detectedDeptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  detectedDeptText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillsContainer: {
    paddingVertical: 6,
    gap: 6,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E3DB',
  },
  filterPillActive: {
    backgroundColor: '#34523C',
    borderColor: '#34523C',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556658',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 4,
  },
  sectionHeaderWrapper: {
    marginTop: 12,
    marginBottom: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  sectionHeaderAllChecked: {
    backgroundColor: '#F7FAF7',
    borderColor: '#D7E5D9',
  },
  sectionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#243328',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#718073',
    marginTop: 1,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#34523C',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  completedBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  collapseBtn: {
    padding: 4,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#EFEBE4',
  },
  itemCardChecked: {
    backgroundColor: '#F7F8F7',
    opacity: 0.65,
    borderColor: '#EAE6DF',
  },
  checkArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#BDC7BE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  checkboxChecked: {
    backgroundColor: '#34523C',
    borderColor: '#34523C',
  },
  itemContent: {
    flex: 1,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#243328',
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: '#8A998D',
  },
  itemRecipe: {
    fontSize: 11,
    color: '#7E8B80',
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#243328',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#718073',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34523C',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#34523C',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  exploreBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE4',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#243328',
  },
  deptOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  deptOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  deptOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#2B332B',
  },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#243328',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 999,
  },
  toastText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
