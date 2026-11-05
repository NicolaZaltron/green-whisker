import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
import { useTranslation } from 'react-i18next';
import { Recipe, ShoppingItem } from '../../types/recipe';
import {
  getShoppingItems,
  toggleShoppingItem,
  deleteShoppingItem,
  clearCheckedShoppingItems,
  clearAllShoppingItems,
  addShoppingItems,
  getMealPlans,
  consolidateShoppingList,
} from '../../db/database';
import { catalogRecipes, catalogVariants } from '../../services/recipeCatalog';
import { getWeekDays, aggregateAndAddToShopping } from '../../services/plannerService';
import { cleanShoppingIngredientText, splitShoppingItemDisplay } from '../../utils/servingsScaler';
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


export default function ShoppingScreen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<ShoppingDepartment | 'ALL'>('ALL');
  const [manualDeptOverride, setManualDeptOverride] = useState<ShoppingDepartment | null>(null);
  const [showDeptPickerModal, setShowDeptPickerModal] = useState(false);
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const loadItems = async (shouldConsolidate = false) => {
    if (shouldConsolidate) {
      await consolidateShoppingList();
    }
    const list = await getShoppingItems();
    setItems(list);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadItems(true);
    setRefreshing(false);
    showToast(t('shopping.updatedToast'));
  };

  useFocusEffect(
    useCallback(() => {
      loadItems(true);
    }, [])
  );

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setFeedbackToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setFeedbackToast(null);
    }, 2800);
  };

  // Reparto rilevato in tempo reale per l'input manuale
  const detectedDept: ShoppingDepartment = useMemo(() => {
    if (manualDeptOverride) return manualDeptOverride;
    if (!newItemText.trim()) return 'CAT_SHOPPING_VARIE';
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
        // Ordinamento alfabetico all'interno di ogni categoria
        deptItems.sort((a, b) => {
          const nameA = splitShoppingItemDisplay(a.ingredient_text, a.name, a.amount, a.unit).displayName;
          const nameB = splitShoppingItemDisplay(b.ingredient_text, b.name, b.amount, b.unit).displayName;
          return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' });
        });

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
    // Aggiornamento ottimistico immediato a 60fps
    setItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
    await toggleShoppingItem(id);
  };

  const handleDelete = async (id: string) => {
    // Aggiornamento ottimistico immediato
    setItems(prev => prev.filter(item => item.id !== id));
    await deleteShoppingItem(id);
  };

  const handleClearCompleted = async () => {
    if (completedCount === 0) return;
    setItems(prev => prev.filter(item => !item.checked));
    await clearCheckedShoppingItems();
    showToast(t('shopping.removeCompleted'));
  };

  const handleClearAll = () => {
    if (items.length === 0) return;
    Alert.alert(
      t('shopping.clearConfirmTitle'),
      t('shopping.clearConfirmSub'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('shopping.clearAll'),
          style: 'destructive',
          onPress: async () => {
            setItems([]);
            await clearAllShoppingItems();
            setSelectedDeptFilter('ALL');
            showToast(t('shopping.clearedToast'));
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
      Alert.alert(t('shopping.emptyTitle'), t('shopping.emptySub'));
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
        showToast(t('shopping.syncNone'));
        return;
      }

      const map: Record<string, Recipe> = {};
      [...catalogRecipes, ...catalogVariants].forEach(r => { map[r.id] = r; });

      const count = await aggregateAndAddToShopping(weekPlans, map);
      await loadItems();
      showToast(t('shopping.syncSuccess'));
    } catch (e) {
      console.error('Error syncing week plan to shopping list:', e);
      showToast(t('common.error'));
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
            <View style={styles.titleTextContainer}>
              <Text style={styles.title} numberOfLines={1}>{t('shopping.title')}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {items.length === 0
                  ? t('shopping.emptySubtitle')
                  : t('shopping.subtitleDetails', {
                      completed: completedCount,
                      total: items.length,
                      departments: activeDepartmentsCount,
                      deptWord: activeDepartmentsCount === 1 ? t('shopping.department') : t('shopping.departments'),
                    })}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={handleSyncWeekPlan}
                activeOpacity={0.7}
                accessibilityLabel={t('shopping.syncWeekPlan')}
              >
                <Ionicons name="calendar-outline" size={17} color="#34523C" />
              </TouchableOpacity>

              {items.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={handleShare}
                    activeOpacity={0.7}
                    accessibilityLabel={t('recipeDetail.share')}
                  >
                    <Ionicons name="share-outline" size={17} color="#34523C" />
                  </TouchableOpacity>

                  {completedCount > 0 && (
                    <TouchableOpacity
                      style={[styles.headerActionBtn, styles.headerActionBtnCompleted]}
                      onPress={handleClearCompleted}
                      activeOpacity={0.7}
                      accessibilityLabel={t('shopping.removeCompleted')}
                    >
                      <Ionicons name="checkmark-done-outline" size={18} color="#2E663B" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.headerActionBtn, { borderColor: '#EBDAD5' }]}
                    onPress={handleClearAll}
                    activeOpacity={0.7}
                    accessibilityLabel={t('shopping.clearAll')}
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
                placeholder={t('shopping.addCustomPlaceholder')}
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
                <Text style={styles.detectedDeptLabel}>{t('shopping.detectedDept')}</Text>
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
                    {t('shoppingDepartments.' + detectedDept, { defaultValue: detectedDept })}
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
                  {t('shopping.all')} ({items.length})
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
                      {t('shoppingDepartments.' + sec.department, { defaultValue: sec.department })} ({sec.total})
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
                      <Text style={styles.sectionTitle}>{t('shoppingDepartments.' + section.department, { defaultValue: section.department })}</Text>
                      {section.isAllChecked && (
                        <View style={styles.completedBadge}>
                          <Ionicons name="checkmark" size={11} color="#FFF" />
                          <Text style={styles.completedBadgeText}>{t('shopping.completed')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.sectionSubtitle}>
                      {t('shopping.itemsTaken', { checked: section.checkedCount, total: section.total })}
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
          renderItem={({ item }) => {
            const { displayName, displayQuantity } = splitShoppingItemDisplay(
              item.ingredient_text,
              item.name,
              item.amount,
              item.unit
            );

            return (
              <View style={[styles.itemCard, item.checked && styles.itemCardChecked]}>
                <TouchableOpacity
                  style={styles.checkArea}
                  onPress={() => handleToggle(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                    {item.checked && <Ionicons name="checkmark" size={13} color="#FFF" />}
                  </View>
                  <View style={styles.itemRowContent}>
                    <Text
                      style={[styles.itemName, item.checked && styles.itemNameChecked]}
                      numberOfLines={2}
                    >
                      {displayName}
                    </Text>
                    {displayQuantity ? (
                      <Text style={[styles.itemQty, item.checked && styles.itemQtyChecked]}>
                        {displayQuantity}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={16} color="#CBD5D0" />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="basket-outline" size={44} color="#34523C" />
              </View>
              <Text style={styles.emptyTitle}>
                {selectedDeptFilter !== 'ALL'
                  ? t('shopping.emptyDeptTitle', { dept: t('shoppingDepartments.' + selectedDeptFilter, { defaultValue: selectedDeptFilter }) })
                  : t('shopping.emptyTitle')}
              </Text>
              <Text style={styles.emptySubtitle}>
                {selectedDeptFilter !== 'ALL'
                  ? t('shopping.emptyDeptSub')
                  : t('shopping.emptySub')}
              </Text>
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => router.push('/(tabs)')}
                activeOpacity={0.8}
              >
                <Ionicons name="restaurant-outline" size={18} color="#FFF" />
                <Text style={styles.exploreBtnText}>{t('shopping.browseRecipes')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exploreBtn, { backgroundColor: '#EAF0EB', marginTop: 10, shadowOpacity: 0 }]}
                onPress={handleSyncWeekPlan}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={18} color="#34523C" />
                <Text style={[styles.exploreBtnText, { color: '#34523C' }]}>
                  {t('shopping.syncWeekPlan')}
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
                <Text style={styles.modalTitle}>{t('shopping.chooseDept')}</Text>
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
                        {t('shoppingDepartments.' + dept, { defaultValue: dept })}
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
    flexShrink: 0,
  },
  titleTextContainer: {
    flex: 1,
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
    color: '#67786B',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E3DB',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  headerActionBtnCompleted: {
    backgroundColor: '#EAF5EE',
    borderColor: '#C8E2D0',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemCardChecked: {
    backgroundColor: '#F8FAF8',
    borderColor: '#E6EAE7',
  },
  checkArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#2D3830',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxChecked: {
    backgroundColor: '#34523C',
    borderColor: '#34523C',
  },
  itemRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 6,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C261F',
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#9EABA1',
    fontWeight: '500',
  },
  itemQty: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8A998D',
    marginLeft: 12,
  },
  itemQtyChecked: {
    textDecorationLine: 'line-through',
    color: '#B5C2B9',
  },
  deleteBtn: {
    padding: 4,
    marginLeft: 4,
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
