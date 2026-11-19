import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { TabSectionList } from '../../components/TabScrollViews';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useFocusEffect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ShoppingItem } from '../../types/recipe';
import {
  getShoppingItems,
  toggleShoppingItem,
  deleteShoppingItem,
  clearCheckedShoppingItems,
  clearAllShoppingItems,
  addShoppingItems,
  consolidateShoppingList,
  updateShoppingItemQuantity,
} from '../../db/database';
import { listIngredients, getIngredientsCacheVersion } from '../../db/ingredientsDb';
import { listReadyMeals } from '../../db/readyMealsDb';
import { splitShoppingItemDisplay } from '../../utils/servingsScaler';
import { scheduleIdle } from '../../utils/idle';
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
import { CenterDialog } from '../../components/ui/CenterDialog';
import { AppTextField } from '../../components/ui/AppTextField';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CircleButton } from '../../components/ui/CircleButton';
import { Checkbox } from '../../components/ui/Checkbox';
import { EmptyState } from '../../components/ui/EmptyState';
import { Toast } from '../../components/ui/Toast';
import { SHOPPING_UNITS, toSelectableUnit } from '../../constants/shoppingUnits';
import { unitLabel } from '../../constants/simpleTags';
import ShoppingPlanModal from '../../components/ShoppingPlanModal';
import type { Palette } from '../../theme/palette';
import { Pill } from '../../components/ui/Pill';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { radius, space, text, icon } from '../../theme/tokens';

interface DepartmentSection {
  department: ShoppingDepartment;
  data: ShoppingItem[];
  total: number;
  checkedCount: number;
  isAllChecked: boolean;
}

interface CatalogSuggestion {
  name: string;
  kind: 'ingredient' | 'ready';
  // Department the item would end up in: same classification used by addItemByName
  department: ShoppingDepartment;
  unit: string;
  defaultAmount: number;
}

// Quantity modal: adding a suggestion or editing an item already in the list
type QuantityTarget =
  | { mode: 'add'; name: string; unit: string }
  | { mode: 'edit'; item: ShoppingItem };

// Free text quantity: empty or non-numeric means no quantity
const parseQuantityText = (text: string): number | null => {
  const parsed = parseFloat(text.replace(',', '.'));
  return text.trim() === '' || Number.isNaN(parsed) || parsed < 0 ? null : parsed;
};

// Quick quantities shown as pills in the quantity prompt
const QUICK_QUANTITIES: readonly { amount: number; unit: string }[] = [
  { amount: 500, unit: 'g' },
  { amount: 1, unit: 'kg' },
  { amount: 2, unit: 'kg' },
  { amount: 1, unit: 'l' },
  { amount: 1, unit: 'pezzo' },
  { amount: 1, unit: 'confezione' },
  { amount: 1, unit: 'rotolo' },
  { amount: 1, unit: 'vasetto' },
];

// Maximum number of suggestions shown below the text bar
const MAX_SUGGESTIONS = 8;

// Compares the visible content of the lists (id, state, quantity, text, department)
const sameShoppingList = (a: ShoppingItem[], b: ShoppingItem[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.checked !== y.checked ||
      x.amount !== y.amount ||
      x.unit !== y.unit ||
      x.ingredient_text !== y.ingredient_text ||
      x.category !== y.category
    ) {
      return false;
    }
  }
  return true;
};


// Memoized shopping row: with unchanged props it does not re-render when another row changes
const ShoppingItemRow = memo(function ShoppingItemRow({
  item,
  displayName,
  displayQuantity,
  onToggle,
  onEditQuantity,
  onDelete,
}: {
  item: ShoppingItem;
  displayName: string;
  displayQuantity: string;
  onToggle: (id: string) => void;
  onEditQuantity: (item: ShoppingItem) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Quantity with the unit pluralized according to the item quantity; without a unit the computed text stays
  const itemQuantity = item.amount != null && item.unit
    ? `${Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1).replace('.0', '')} ${unitLabel(item.unit, t, item.amount)}`
    : displayQuantity;

  return (
    <Card elevation={1} style={[styles.itemCard, item.checked && styles.itemCardChecked]}>
      <TouchableOpacity
        style={styles.checkArea}
        onPress={() => onToggle(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.checkboxWrap}>
          <Checkbox checked={item.checked} onToggle={() => onToggle(item.id)} accessibilityLabel={displayName} />
        </View>
        <View style={styles.itemRowContent}>
          <Text
            style={[styles.itemName, item.checked && styles.itemNameChecked]}
            numberOfLines={2}
          >
            {displayName}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.qtyEditBtn}
        onPress={() => onEditQuantity(item)}
        activeOpacity={0.7}
        accessibilityLabel={t('shopping.quantityEditTitle')}
      >
        <Text style={[styles.qtyEditText, item.checked && styles.itemQtyChecked]}>
          {itemQuantity || t('shopping.quantityEmpty')}
        </Text>
      </TouchableOpacity>

      <View style={styles.deleteWrap}>
        <CircleButton
          size="S"
          icon="close"
          onPress={() => onDelete(item.id)}
          accessibilityLabel={t('common.delete')}
        />
      </View>
    </Card>
  );
});

export default function ShoppingScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogSuggestion[]>([]);
  const [quantityTarget, setQuantityTarget] = useState<QuantityTarget | null>(null);
  const [qtyAmountText, setQtyAmountText] = useState('');
  const [qtyUnitText, setQtyUnitText] = useState('');
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<ShoppingDepartment | 'ALL'>('ALL');
  const [manualDeptOverride, setManualDeptOverride] = useState<ShoppingDepartment | null>(null);
  const [showDeptPickerModal, setShowDeptPickerModal] = useState(false);
  // Action awaiting confirmation in the descriptive modal
  const [pendingAction, setPendingAction] = useState<'clearCompleted' | 'clearAll' | null>(null);
  // Modal to choose what to add to the list from the planner
  const [showPlanModal, setShowPlanModal] = useState(false);
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

  const loadItems = useCallback(async (shouldConsolidate = false) => {
    if (shouldConsolidate) {
      await consolidateShoppingList();
    }
    const list = await getShoppingItems();
    // Updates only if the content changed: otherwise the previous reference stays
    setItems(prev => (sameShoppingList(prev, list) ? prev : list));
  }, []);


  // Key of the already loaded catalog: ingredients cache version and ready meal names
  const catalogKeyRef = useRef<{ version: number; readyKey: string } | null>(null);

  // Ingredients and ready meals, without duplicates: ingredients take precedence
  const loadCatalog = async () => {
    const version = getIngredientsCacheVersion();
    const readyMeals = await listReadyMeals();
    const readyKey = readyMeals.map(meal => meal.name).join('\n');
    const loaded = catalogKeyRef.current;
    if (loaded && loaded.version === version && loaded.readyKey === readyKey) return;

    const ingredients = await listIngredients();
    const byName = new Map<string, CatalogSuggestion>();
    for (const ingredient of ingredients) {
      byName.set(ingredient.name, {
        name: ingredient.name,
        kind: 'ingredient',
        department: classifyShoppingDepartment(ingredient.name),
        // Suggestion for the shopping list: quantity and unit to buy, falling back to the portion
        unit: toSelectableUnit(ingredient.purchase_unit || ingredient.default_unit),
        defaultAmount: ingredient.purchase_amount ?? 1,
      });
    }
    for (const meal of readyMeals) {
      if (!byName.has(meal.name)) byName.set(meal.name, {
        name: meal.name,
        kind: 'ready',
        department: classifyShoppingDepartment(meal.name),
        unit: 'confezione',
        defaultAmount: 1,
      });
    }
    setCatalog([...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'it')));
    catalogKeyRef.current = { version, readyKey };
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadItems(true);
    setRefreshing(false);
    showToast(t('shopping.updatedToast'));
  };

  // Reconsolidates only on first open; on returns to the screen it just reads the list
  const consolidatedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (consolidatedRef.current) {
        loadItems();
        return;
      }
      consolidatedRef.current = true;
      // Consolidation starts in idle, after the tab transition (InteractionManager is removed in RN 0.88).
      // No cancel: consolidation is not lost if the screen is left right away
      scheduleIdle(() => {
        loadItems(true);
      });
    }, [loadItems])
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

  // Department detected in real time for manual input
  const detectedDept: ShoppingDepartment = useMemo(() => {
    if (manualDeptOverride) return manualDeptOverride;
    if (!newItemText.trim()) return 'CAT_SHOPPING_VARIE';
    return classifyShoppingDepartment(newItemText.trim());
  }, [newItemText, manualDeptOverride]);

  const completedCount = useMemo(() => items.filter(i => i.checked).length, [items]);
  const detectedColors = departmentColors(detectedDept, isDark);

  // Displayed name and quantity computed once per list (not on every render or comparison)
  const displayById = useMemo(() => {
    const map = new Map<string, { displayName: string; displayQuantity: string }>();
    for (const item of items) {
      map.set(item.id, splitShoppingItemDisplay(item.ingredient_text, item.name, item.amount, item.unit));
    }
    return map;
  }, [items]);

  // Grouping by the 15 departments: per-department lists computed (and sorted) only when items change;
  // collapsing or expanding a department does not recompute or reorder anything (see groupedSections)
  const itemsByDept = useMemo(() => {
    const map = new Map<ShoppingDepartment, ShoppingItem[]>();
    for (const item of items) {
      const dept = (
        SHOPPING_DEPARTMENTS.includes(item.category as any)
          ? item.category
          : classifyShoppingDepartment(item.name || item.ingredient_text)
      ) as ShoppingDepartment;
      const entry = item.category === dept ? item : { ...item, category: dept };
      const list = map.get(dept);
      if (list) list.push(entry);
      else map.set(dept, [entry]);
    }
    for (const deptItems of map.values()) {
      // Alphabetical sorting within each category
      deptItems.sort((a, b) => {
        const nameA = displayById.get(a.id)?.displayName ?? a.name;
        const nameB = displayById.get(b.id)?.displayName ?? b.name;
        return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' });
      });
    }
    return map;
  }, [items, displayById]);

  const groupedSections: DepartmentSection[] = useMemo(() => {
    const sections: DepartmentSection[] = [];
    for (const dept of SHOPPING_DEPARTMENTS) {
      const deptItems = itemsByDept.get(dept);
      if (deptItems && deptItems.length > 0) {
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
  }, [itemsByDept, collapsedDepts]);

  // Sections filtered by the selected pill
  const displayedSections = useMemo(() => {
    if (selectedDeptFilter === 'ALL') {
      return groupedSections;
    }
    return groupedSections.filter(s => s.department === selectedDeptFilter);
  }, [groupedSections, selectedDeptFilter]);

  // Active department statistics
  const activeDepartmentsCount = groupedSections.length;

  const handleToggle = useCallback(async (id: string) => {
    // Immediate optimistic update at 60fps
    setItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
    await toggleShoppingItem(id);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    // Immediate optimistic update
    setItems(prev => prev.filter(item => item.id !== id));
    await deleteShoppingItem(id);
  }, []);

  const performClearCompleted = async () => {
    setItems(prev => prev.filter(item => !item.checked));
    await clearCheckedShoppingItems();
    showToast(t('shopping.removeCompleted'));
  };

  const performClearAll = async () => {
    setItems([]);
    await clearAllShoppingItems();
    setSelectedDeptFilter('ALL');
    showToast(t('shopping.clearedToast'));
  };

  const addItemByName = async (rawName: string, amount: number | null = null, unit = '') => {
    const trimmed = rawName.trim();
    if (!trimmed) return;

    const chosenDept = manualDeptOverride || classifyShoppingDepartment(trimmed);
    const ingredientText = (amount === null ? trimmed : `${amount} ${unit} ${trimmed}`).replace(/\s+/g, ' ').trim();

    await addShoppingItems([
      {
        ingredientText,
        name: trimmed,
        amount,
        unit,
        category: chosenDept,
      },
    ]);

    setNewItemText('');
    setManualDeptOverride(null);
    loadItems();
    showToast(t('shopping.addedToDept', { dept: chosenDept }));
  };

  // A typed name opens the quantity prompt (default 1, no unit)
  const handleAddManual = () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    setQtyAmountText('1');
    setQtyUnitText('');
    setUnitMenuOpen(false);
    setQuantityTarget({ mode: 'add', name: trimmed, unit: '' });
  };

  // A suggestion opens the quantity prompt (default 1)
  const openQuantityAdd = (entry: CatalogSuggestion) => {
    setQtyAmountText(String(entry.defaultAmount));
    setQtyUnitText(toSelectableUnit(entry.unit));
    setUnitMenuOpen(false);
    setQuantityTarget({ mode: 'add', name: entry.name, unit: entry.unit });
  };

  const openQuantityEdit = useCallback((item: ShoppingItem) => {
    setQtyAmountText(item.amount != null ? String(item.amount) : '');
    setQtyUnitText(item.unit ?? '');
    setUnitMenuOpen(false);
    setQuantityTarget({ mode: 'edit', item });
  }, []);

  const confirmQuantity = async () => {
    if (!quantityTarget) return;
    const amount = parseQuantityText(qtyAmountText);
    const unit = qtyUnitText.trim();
    setQuantityTarget(null);
    setUnitMenuOpen(false);
    if (quantityTarget.mode === 'add') {
      await addItemByName(quantityTarget.name, amount, unit);
      return;
    }
    await updateShoppingItemQuantity(quantityTarget.item.id, quantityTarget.item.name, amount, unit);
    loadItems();
  };

  // A pill immediately adds the product with the chosen quantity and unit
  const addWithQuickQuantity = async (name: string, amount: number, unit: string) => {
    setQuantityTarget(null);
    setUnitMenuOpen(false);
    await addItemByName(name, amount, unit);
  };

  // Suggestions filtered on the typed characters: first those starting with the query, then those containing it
  const suggestions = useMemo(() => {
    const query = newItemText.trim().toLowerCase();
    if (!query) return [];
    const startsWith: CatalogSuggestion[] = [];
    const contains: CatalogSuggestion[] = [];
    for (const entry of catalog) {
      const name = entry.name.toLowerCase();
      if (name.startsWith(query)) startsWith.push(entry);
      else if (name.includes(query)) contains.push(entry);
    }
    return [...startsWith, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [newItemText, catalog]);

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
    const shared = await shareNative(t('shopping.shareTitle'), shareText);
    if (!shared) {
      await copyRecipeToClipboard(shareText);
      showToast(t('shopping.copiedToast'));
    }
  };

  // Destructive or bulk actions first open in a descriptive modal
  const requestClearCompleted = () => {
    if (completedCount > 0) setPendingAction('clearCompleted');
  };
  const requestClearAll = () => {
    if (items.length > 0) setPendingAction('clearAll');
  };

  const confirmPendingAction = async () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'clearCompleted') await performClearCompleted();
    if (action === 'clearAll') await performClearAll();
  };

  // List row: stable callbacks and precomputed texts, so a tap does not re-render all rows
  const renderShoppingItem = useCallback(({ item }: { item: ShoppingItem }) => {
    const { displayName, displayQuantity } = displayById.get(item.id) ?? { displayName: item.name, displayQuantity: '' };
    return (
      <ShoppingItemRow
        item={item}
        displayName={displayName}
        displayQuantity={displayQuantity}
        onToggle={handleToggle}
        onEditQuantity={openQuantityEdit}
        onDelete={handleDelete}
      />
    );
  }, [displayById, handleToggle, openQuantityEdit, handleDelete]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>
        {/* Header */}
        <View style={styles.header}>
          <ScreenHeader
            title={t('shopping.title')}
            subtitle={items.length === 0
              ? t('shopping.emptySubtitle')
              : t('shopping.subtitleDetails', {
                  completed: completedCount,
                  total: items.length,
                  departments: activeDepartmentsCount,
                  deptWord: activeDepartmentsCount === 1 ? t('shopping.department') : t('shopping.departments'),
                })}
            actions={
              <>
                <CircleButton size="M" variant="plain"
                  icon="calendar-outline"
                  onPress={() => setShowPlanModal(true)}
                  accessibilityLabel={t('shopping.syncWeekPlan')}
                />

                {items.length > 0 && (
                  <>
                    <CircleButton size="M" variant="plain"
                      icon="share-social"
                      onPress={handleShare}
                      accessibilityLabel={t('recipeDetail.share')}
                    />

                    {completedCount > 0 && (
                      <CircleButton size="M" variant="plain"
                        icon="checkmark-done"
                        onPress={requestClearCompleted}
                        accessibilityLabel={t('shopping.removeCompleted')}
                      />
                    )}

                    <CircleButton size="M" variant="plain"
                      icon="trash"
                      onPress={requestClearAll}
                      accessibilityLabel={t('shopping.clearAll')}
                    />
                  </>
                )}
              </>
            }
          />

          {/* Quick manual item adder */}
          <Card elevation={1} padding="lg" style={styles.inputContainer}>
            <View style={styles.inputRow}>
              <AppTextField
                variant="search"
                size="M"
                style={styles.flexField}
                placeholder={t('shopping.addCustomPlaceholder')}
                value={newItemText}
                onChangeText={text => {
                  setNewItemText(text);
                  // Resets the manual override if the text is cleared
                  if (!text.trim()) setManualDeptOverride(null);
                }}
                onFocus={loadCatalog}
                onSubmitEditing={handleAddManual}
                returnKeyType="done"
              />
              <CircleButton
                icon="add"
                variant="filled"
                onPress={handleAddManual}
                disabled={!newItemText.trim()}
                accessibilityLabel={t('common.add')}
              />
            </View>

            {/* Suggestions from ingredients and ready meals, while typing */}
            {suggestions.length > 0 && (
              <View style={styles.suggestionsList}>
                {suggestions.map(entry => (
                  <TouchableOpacity
                    key={`${entry.kind}:${entry.name}`}
                    style={styles.suggestionRow}
                    onPress={() => openQuantityAdd(entry)}
                    activeOpacity={0.7}
                    accessibilityLabel={entry.name}
                  >
                    <Ionicons
                      name={(DEPARTMENT_ICONS[entry.department] as any) || 'basket-outline'}
                      size={icon.sm}
                      color={colors.textMuted}
                    />
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {entry.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

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
                    size={icon.xs}
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
                  <Ionicons name="chevron-down" size={icon.xs} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
          </Card>

          {/* Filter Pills (Active Departments) */}
          {groupedSections.length > 1 && (
            <View style={styles.filterPillsContainer}>
              <SegmentedControl
                accessibilityLabel={t('shopping.departmentFilter')}
                options={[
                  { key: 'ALL', label: `${t('shopping.all')} (${items.length})` },
                  ...groupedSections.map(sec => ({
                    key: sec.department,
                    icon: (DEPARTMENT_ICONS[sec.department] as any) || 'basket-outline',
                    label: `${t('shoppingDepartments.' + sec.department, { defaultValue: sec.department })} (${sec.total})`,
                  })),
                ]}
                pinnedKey="ALL"
                value={selectedDeptFilter}
                onChange={key => setSelectedDeptFilter(prev => (key !== 'ALL' && prev === key ? 'ALL' : (key as ShoppingDepartment | 'ALL')))}
              />
            </View>
          )}
        </View>

        {/* SectionList divided by Departments */}
        <TabSectionList
          sections={displayedSections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
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
                    <Ionicons name={iconName} size={icon.md} color={deptColors.text} />
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
                      size={icon.md}
                      color={colors.textMuted}
                    />
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
          renderItem={renderShoppingItem}
          ListEmptyComponent={
            <EmptyState
              icon="basket-outline"
              title={
                selectedDeptFilter !== 'ALL'
                  ? t('shopping.emptyDeptTitle', { dept: t('shoppingDepartments.' + selectedDeptFilter, { defaultValue: selectedDeptFilter }) })
                  : t('shopping.emptyTitle')
              }
              subtitle={selectedDeptFilter !== 'ALL' ? t('shopping.emptyDeptSub') : t('shopping.emptySub')}
              actions={[
                { label: t('shopping.browseRecipes'), onPress: () => router.push('/(tabs)'), icon: 'restaurant-outline', size: 'XL' },
                { label: t('shopping.syncWeekPlan'), onPress: () => setShowPlanModal(true), icon: 'calendar-outline', variant: 'secondary', size: 'XL' },
              ]}
            />
          }
        />

        {/* Modal for manual department selection */}
        <SheetModal visible={showDeptPickerModal} onClose={() => setShowDeptPickerModal(false)}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('shopping.chooseDept')}</Text>
                <CircleButton
                  variant="plain"
                  icon="close"
                  onPress={() => setShowDeptPickerModal(false)}
                  accessibilityLabel={t('common.close')}
                />
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
                        <Ionicons name={iconName} size={icon.md} color={deptColors.text} />
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
                        <Ionicons name="checkmark" size={icon.md} color={deptColors.text} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
        </SheetModal>

        {/* Floating Toast Notification */}
        {feedbackToast && <Toast message={feedbackToast} />}
      </View>
      <CenterDialog visible={pendingAction !== null} onClose={() => setPendingAction(null)}>
        <View style={styles.confirmSheet}>
          <Text style={styles.confirmTitle}>
            {pendingAction === 'clearCompleted' && t('shopping.confirm.completedTitle')}
            {pendingAction === 'clearAll' && t('shopping.confirm.clearTitle')}
          </Text>
          <Text style={styles.confirmBody}>
            {pendingAction === 'clearCompleted' && t('shopping.confirm.completedBody', { count: completedCount })}
            {pendingAction === 'clearAll' && t('shopping.confirm.clearBody', { count: items.length })}
          </Text>
          <View style={styles.confirmRow}>
            <Button variant="secondary" label={t('common.cancel')} onPress={() => setPendingAction(null)} />
            <Button
              variant={pendingAction === 'clearAll' ? 'danger' : 'primary'}
              label={t('shopping.confirm.confirmButton')}
              onPress={confirmPendingAction}
            />
          </View>
        </View>
      </CenterDialog>
      <CenterDialog visible={quantityTarget !== null} onClose={() => setQuantityTarget(null)}>
        <View style={styles.confirmSheet}>
          <Text style={styles.qtyProductName}>
            {quantityTarget?.mode === 'add' ? quantityTarget.name : quantityTarget?.mode === 'edit' ? quantityTarget.item.name : ''}
          </Text>
          <Text style={styles.confirmBody}>
            {quantityTarget?.mode === 'add' ? t('shopping.quantityChoosePrompt') : t('shopping.quantityEditTitle')}
          </Text>
          {quantityTarget?.mode === 'add' && (
            <View style={styles.quickPillsRow}>
              {QUICK_QUANTITIES.map(quick => {
                const quickUnit = unitLabel(quick.unit, t, quick.amount);
                return (
                  <Pill
                    key={`${quick.amount}-${quick.unit}`}
                    label={`${quick.amount} ${quickUnit}`}
                    size="M"
                    onPress={() => addWithQuickQuantity(quantityTarget.name, quick.amount, quick.unit)}
                  />
                );
              })}
            </View>
          )}
          <View style={styles.qtyInputRow}>
            <AppTextField
              style={styles.qtyAmountInput}
              value={qtyAmountText}
              onChangeText={setQtyAmountText}
              keyboardType="decimal-pad"
              placeholder="1"
            />
            <TouchableOpacity
              style={[styles.input, styles.qtyUnitInput, styles.qtyUnitSelect]}
              onPress={() => setUnitMenuOpen(open => !open)}
              activeOpacity={0.7}
              accessibilityLabel={t('shopping.quantityUnit')}
            >
              <Text style={styles.qtyUnitText} numberOfLines={1}>
                {unitLabel(qtyUnitText, t) || t('shopping.unitNone')}
              </Text>
              <Ionicons name={unitMenuOpen ? 'chevron-up' : 'chevron-down'} size={icon.xs} color={colors.textMuted} />
            </TouchableOpacity>
            <Button
              label={quantityTarget?.mode === 'add' ? t('common.add') : t('shopping.quantitySave')}
              onPress={confirmQuantity}
            />
          </View>
          {unitMenuOpen && (
            <ScrollView style={styles.unitMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {['', ...SHOPPING_UNITS].map(unit => {
                const active = qtyUnitText === unit;
                return (
                  <TouchableOpacity
                    key={unit || 'none'}
                    style={[styles.unitOption, active && styles.unitOptionActive]}
                    onPress={() => {
                      setQtyUnitText(unit);
                      setUnitMenuOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.unitOptionText, active && styles.unitOptionTextActive]}>
                      {unitLabel(unit, t) || t('shopping.unitNone')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          <View style={styles.confirmRow}>
            <Button variant="secondary" label={t('common.cancel')} onPress={() => setQuantityTarget(null)} />
          </View>
        </View>
      </CenterDialog>
      <ShoppingPlanModal
        visible={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        onSaved={loadItems}
      />
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
    paddingBottom: space.md,
  },
  inputContainer: {
    marginBottom: space.md,
    // Aligned with the ScreenHeader title text
    marginHorizontal: space.xxxl,
  },
  inputRow: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  flexField: { flex: 1 },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.xl,
    height: 42,
    fontSize: text.body,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  suggestionsList: {
    marginTop: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    minHeight: 38,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionText: {
    flex: 1,
    fontSize: text.body,
    color: colors.text,
  },
  detectedDeptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    paddingHorizontal: space.xs,
  },
  detectedDeptLabel: {
    fontSize: text.label,
    fontWeight: '600',
    color: colors.textMuted,
  },
  detectedDeptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  detectedDeptText: {
    fontSize: text.caption,
    fontWeight: '600',
  },
  filterPillsContainer: {
    paddingHorizontal: space.xxxl,
    paddingVertical: space.sm,
  },
  listContent: {
    paddingHorizontal: space.xxxl,
    paddingBottom: 36,
    paddingTop: space.xs,
  },
  sectionHeaderWrapper: {
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: space.xl,
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
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  sectionTitle: {
    fontSize: text.body,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: text.label,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 1,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  completedBadgeText: {
    color: colors.onPrimary,
    fontSize: text.label,
    fontWeight: '700',
  },
  collapseBtn: {
    padding: space.xs,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xxxl,
    marginBottom: space.md,
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
  checkboxWrap: { marginRight: space.xxl },
  deleteWrap: { marginLeft: space.xs },
  itemRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: space.sm,
  },
  itemName: {
    fontSize: text.title,
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
  itemQtyChecked: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  qtyEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginLeft: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  qtyEditText: {
    fontSize: text.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  qtyProductName: { fontSize: text.page, fontWeight: '800', color: colors.text, marginBottom: space.md },
  quickPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.huge },
  qtyInputRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.huge },
  // Fixed height: no vertical padding from the base button, otherwise the text drops relative to the center
  qtyAmountInput: { width: 96 },
  qtyUnitInput: { flex: 1, height: 44 },
  qtyUnitSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
  qtyUnitText: { fontSize: text.body, color: colors.text, flexShrink: 1 },
  unitMenu: { maxHeight: 240, marginTop: -12, marginBottom: space.xxxl, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  unitOption: { paddingHorizontal: space.xxl, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  unitOptionActive: { backgroundColor: colors.primarySoft },
  unitOptionText: { fontSize: text.body, color: colors.text },
  unitOptionTextActive: { fontWeight: '700', color: colors.primaryText },
  // Same width and height for both empty-state buttons
  modalCard: { padding: 18 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xxl,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: text.page,
    fontWeight: '700',
    color: colors.text,
  },
  deptOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    borderRadius: radius.sm,
    marginBottom: space.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  deptOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.lg,
  },
  deptOptionText: {
    flex: 1,
    fontSize: text.body,
    fontWeight: '600',
    color: colors.text,
  },
  confirmSheet: { padding: space.huge, paddingBottom: 28 },
  confirmTitle: { fontSize: text.page, fontWeight: '700', color: colors.text, marginBottom: space.md },
  confirmBody: { fontSize: text.body, lineHeight: 20, color: colors.textSecondary, marginBottom: space.huge },
  confirmRow: { flexDirection: 'row', gap: space.lg, justifyContent: 'flex-end' },
});
