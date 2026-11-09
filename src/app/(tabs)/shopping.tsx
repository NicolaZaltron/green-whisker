import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { TabSectionList } from '../../components/TabScrollViews';
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
import { splitShoppingItemDisplay } from '../../utils/servingsScaler';
import {
  SHOPPING_DEPARTMENTS,
  ShoppingDepartment,
  DEPARTMENT_ICONS,
  departmentColors,
} from '../../constants/shoppingDepartments';
import { classifyShoppingDepartment } from '../../utils/shoppingClassifier';
import {
  shareNative,
  copyRecipeToClipboard,
  formatShoppingListShareText,
} from '../../utils/shareHelper';
import { useTheme } from '../../context/ThemeContext';
import { SheetModal } from '../../components/SheetModal';
import type { Palette } from '../../theme/palette';

interface DepartmentSection {
  department: ShoppingDepartment;
  data: ShoppingItem[];
  total: number;
  checkedCount: number;
  isAllChecked: boolean;
}


export default function ShoppingScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const detectedColors = departmentColors(detectedDept, isDark);

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
    showToast(t('shopping.addedToDept', { dept: chosenDept }));
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

      await aggregateAndAddToShopping(weekPlans, map);
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
              <Ionicons name="cart" size={22} color={colors.primaryText} />
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
                <Ionicons name="calendar-outline" size={17} color={colors.primaryText} />
              </TouchableOpacity>

              {items.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={handleShare}
                    activeOpacity={0.7}
                    accessibilityLabel={t('recipeDetail.share')}
                  >
                    <Ionicons name="share-outline" size={17} color={colors.primaryText} />
                  </TouchableOpacity>

                  {completedCount > 0 && (
                    <TouchableOpacity
                      style={[styles.headerActionBtn, styles.headerActionBtnCompleted]}
                      onPress={handleClearCompleted}
                      activeOpacity={0.7}
                      accessibilityLabel={t('shopping.removeCompleted')}
                    >
                      <Ionicons name="checkmark-done-outline" size={18} color={colors.primaryText} />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={handleClearAll}
                    style={[styles.headerActionBtn, { borderColor: colors.border }]}
                    activeOpacity={0.7}
                    accessibilityLabel={t('shopping.clearAll')}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
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
                placeholderTextColor={colors.textMuted}
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
                <Ionicons name="add" size={22} color={colors.onPrimary} />
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
                      backgroundColor: detectedColors.bg,
                      borderColor: detectedColors.border,
                    },
                  ]}
                  onPress={() => setShowDeptPickerModal(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={(DEPARTMENT_ICONS[detectedDept] as any) || 'basket-outline'}
                    size={13}
                    color={detectedColors.text}
                  />
                  <Text
                    style={[
                      styles.detectedDeptText,
                      { color: detectedColors.text },
                    ]}
                  >
                    {t('shoppingDepartments.' + detectedDept, { defaultValue: detectedDept })}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
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
                const deptColors = departmentColors(sec.department, isDark);
                const iconName = (DEPARTMENT_ICONS[sec.department] as any) || 'basket-outline';

                return (
                  <TouchableOpacity
                    key={sec.department}
                    style={[
                      styles.filterPill,
                      isActive && {
                        backgroundColor: deptColors.bg,
                        borderColor: deptColors.border,
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
                      color={isActive ? deptColors.text : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && { color: deptColors.text, fontWeight: '700' },
                      ]}
                    >
                      {t('shoppingDepartments.' + sec.department, { defaultValue: sec.department })} ({sec.total})
                    </Text>
                    {sec.isAllChecked && (
                      <Ionicons name="checkmark-circle" size={13} color={colors.primaryText} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* SectionList divided by Departments */}
        <TabSectionList
          sections={displayedSections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderSectionHeader={({ section }) => {
            const deptColors = departmentColors(section.department, isDark);
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
                  <View style={[styles.sectionIconCircle, { backgroundColor: deptColors.bg }]}>
                    <Ionicons name={iconName} size={17} color={deptColors.text} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.sectionTitleRow}>
                      <Text style={styles.sectionTitle}>{t('shoppingDepartments.' + section.department, { defaultValue: section.department })}</Text>
                      {section.isAllChecked && (
                        <View style={styles.completedBadge}>
                          <Ionicons name="checkmark" size={11} color={colors.onPrimary} />
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
                      color={colors.textMuted}
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
                    {item.checked && <Ionicons name="checkmark" size={13} color={colors.onPrimary} />}
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
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="basket-outline" size={44} color={colors.primaryText} />
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
                <Ionicons name="restaurant-outline" size={18} color={colors.onPrimary} />
                <Text style={styles.exploreBtnText}>{t('shopping.browseRecipes')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exploreBtn, { backgroundColor: colors.primarySoft, marginTop: 10, shadowOpacity: 0 }]}
                onPress={requestSync}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.primaryText} />
                <Text style={[styles.exploreBtnText, { color: colors.primaryText }]}>
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
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {SHOPPING_DEPARTMENTS.map(dept => {
                  const deptColors = departmentColors(dept, isDark);
                  const iconName = (DEPARTMENT_ICONS[dept] as any) || 'basket-outline';
                  const isSelected = detectedDept === dept;

                  return (
                    <TouchableOpacity
                      key={dept}
                      style={[
                        styles.deptOptionRow,
                        isSelected && { backgroundColor: deptColors.bg, borderColor: deptColors.border },
                      ]}
                      onPress={() => {
                        setManualDeptOverride(dept);
                        setShowDeptPickerModal(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.deptOptionIcon, { backgroundColor: deptColors.bg }]}>
                        <Ionicons name={iconName} size={18} color={deptColors.text} />
                      </View>
                      <Text
                        style={[
                          styles.deptOptionText,
                          isSelected && { color: deptColors.text, fontWeight: '700' },
                        ]}
                      >
                        {t('shoppingDepartments.' + dept, { defaultValue: dept })}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={18} color={deptColors.text} />
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
            <Ionicons name="information-circle" size={18} color={colors.background} />
            <Text style={styles.toastText}>{feedbackToast}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
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
    backgroundColor: colors.primarySoft,
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
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  headerActionBtnCompleted: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
  },
  inputContainer: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
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
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: colors.borderStrong,
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
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.onPrimary,
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
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeaderAllChecked: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
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
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 1,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  completedBadgeText: {
    color: colors.onPrimary,
    fontSize: 9,
    fontWeight: '700',
  },
  collapseBtn: {
    padding: 4,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemCardChecked: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
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
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    color: colors.text,
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
    fontWeight: '500',
  },
  itemQty: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
    marginLeft: 12,
  },
  itemQtyChecked: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
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
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  exploreBtnText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    shadowColor: colors.shadow,
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
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
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
    color: colors.text,
  },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.text,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    gap: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 999,
  },
  toastText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmSheet: { padding: 20, paddingBottom: 28 },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 },
  confirmBody: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginBottom: 20 },
  confirmRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  confirmCancelBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.surfaceAlt },
  confirmCancelText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  confirmOkBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.primary },
  confirmOkBtnDanger: { backgroundColor: colors.danger },
  confirmOkText: { fontSize: 14, fontWeight: '700', color: colors.onPrimary },
});
