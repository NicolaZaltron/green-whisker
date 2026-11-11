import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { SheetModal } from './SheetModal';
import { getMealPlans, getShoppingItems } from '../db/database';
import { listIngredients } from '../db/ingredientsDb';
import { listReadyMeals } from '../db/readyMealsDb';
import { listRecipeIngredients } from '../db/recipeIngredientsDb';
import { catalogRecipes } from '../services/recipeCatalog';
import { computeShoppingPreview, ShoppingPreviewRow } from '../services/shoppingPreview';
import { saveShoppingSelection } from '../services/shoppingPlanSave';
import type { MealPlanEntry, Recipe, ShoppingItem } from '../types/recipe';
import type { Ingredient, ReadyMeal } from '../types/catalog';
import { AppTextField } from './ui/AppTextField';

interface ShoppingPlanModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// Data di oggi in YYYY-MM-DD, con le parti della data locale (non UTC).
function getLocalToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Quantità di default: quanto manca in lista, altrimenti quanto serve.
function defaultAmountText(row: ShoppingPreviewRow): string {
  const value = row.missing ?? row.need;
  return value === null ? '' : String(value);
}

function parseAmount(text: string | undefined): number | null {
  if (text === undefined) return null;
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export default function ShoppingPlanModal({ visible, onClose, onSaved }: ShoppingPlanModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(false);
  const [hasPlannedMeals, setHasPlannedMeals] = useState(false);
  const [rows, setRows] = useState<ShoppingPreviewRow[]>([]);
  // Righe selezionate e quantità modificate dall'utente, indicizzate per row.key
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const today = getLocalToday();
        const [plans, shoppingItems, ingredientList, readyList] = await Promise.all([
          getMealPlans(),
          getShoppingItems(),
          listIngredients(),
          listReadyMeals(),
        ]);
        if (cancelled) return;

        const entries: MealPlanEntry[] = plans.filter(p => p.date >= today);
        const recipes: Record<string, Recipe> = {};
        catalogRecipes.forEach(r => { recipes[r.id] = r; });
        const ingredients: Record<string, Ingredient> = {};
        ingredientList.forEach(i => { ingredients[i.id] = i; });
        const readyMeals: Record<string, ReadyMeal> = {};
        readyList.forEach(m => { readyMeals[m.id] = m; });
        const recipeIds = Array.from(new Set(
          entries.filter(e => e.kind === 'recipe' && e.recipe_id).map(e => e.recipe_id as string)
        ));
        const recipeRows = await Promise.all(recipeIds.map(id => listRecipeIngredients(id)));
        if (cancelled) return;
        const recipeIngredients: Record<string, Array<{ ingredient_name: string; amount: number | null; unit: string }>> = {};
        recipeIds.forEach((id, idx) => { recipeIngredients[id] = recipeRows[idx]; });
        const shopping: ShoppingItem[] = shoppingItems;

        const computed = computeShoppingPreview({
          today,
          entries,
          recipes,
          ingredients,
          recipeIngredients,
          readyMeals,
          shoppingItems: shopping,
        });

        const initialSelected: Record<string, boolean> = {};
        computed.forEach(row => {
          // Preselezionate le righe che mancano davvero in lista
          initialSelected[row.key] = row.missing !== null;
        });

        setHasPlannedMeals(entries.length > 0);
        setRows(computed);
        setSelected(initialSelected);
        setAmounts({});
      } catch (e) {
        console.error('Error loading shopping plan:', e);
        if (!cancelled) setError(t('shoppingPlan.saveError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [visible, t]);

  const getAmountText = useCallback(
    (row: ShoppingPreviewRow) => (amounts[row.key] !== undefined ? amounts[row.key] : defaultAmountText(row)),
    [amounts]
  );

  // Una riga è selezionabile solo se ha una quantità (default o digitata)
  const isSelectable = useCallback(
    (row: ShoppingPreviewRow) => parseAmount(getAmountText(row)) !== null,
    [getAmountText]
  );

  const selectedRows = useMemo(
    () => rows.filter(row => selected[row.key] && isSelectable(row)),
    [rows, selected, isSelectable]
  );

  const handleSelectAll = () => {
    setSelected(prev => {
      const next = { ...prev };
      rows.forEach(row => {
        if (isSelectable(row)) next[row.key] = true;
      });
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelected(prev => {
      const next = { ...prev };
      rows.forEach(row => { next[row.key] = false; });
      return next;
    });
  };

  const toggleRow = (row: ShoppingPreviewRow) => {
    if (!isSelectable(row)) return;
    setSelected(prev => ({ ...prev, [row.key]: !prev[row.key] }));
  };

  const changeAmount = (row: ShoppingPreviewRow, text: string) => {
    setAmounts(prev => ({ ...prev, [row.key]: text }));
    // Digitare una quantità seleziona la riga
    setSelected(prev => ({ ...prev, [row.key]: true }));
  };

  const handleSave = async () => {
    if (selectedRows.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveShoppingSelection(
        selectedRows.map(row => ({
          name: row.name,
          unit: row.unit,
          amount: parseAmount(getAmountText(row)),
          sourceLabel: row.sources[0]?.label,
        }))
      );
      onSaved();
      onClose();
    } catch (e) {
      console.error('Error saving shopping plan:', e);
      setError(t('shoppingPlan.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const renderRow = ({ item: row }: { item: ShoppingPreviewRow }) => {
    const selectable = isSelectable(row);
    const isChecked = !!selected[row.key] && selectable;

    return (
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => toggleRow(row)}
          disabled={!selectable}
          activeOpacity={0.7}
          style={styles.checkbox}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isChecked, disabled: !selectable }}
        >
          <Ionicons
            name={isChecked ? 'checkbox' : 'square-outline'}
            size={24}
            color={selectable ? colors.primaryText : colors.textMuted}
          />
        </TouchableOpacity>

        <View style={styles.rowBody}>
          <Text style={styles.name}>{row.name}</Text>
          <Text style={styles.detail}>
            {row.need === null
              ? t('shoppingPlan.noQuantity')
              : t('shoppingPlan.need', { need: row.need, unit: row.unit })}
          </Text>
          <Text style={styles.detail}>
            {row.inList === null
              ? t('shoppingPlan.notInList')
              : t('shoppingPlan.inList', { inList: row.inList, unit: row.unit })}
          </Text>
          {!row.comparable && <Text style={styles.warning}>{t('shoppingPlan.unitMismatch')}</Text>}
          {row.sources.length > 0 && (
            <Text style={styles.sources}>{row.sources.map(s => s.label).join(', ')}</Text>
          )}
        </View>

        <View style={styles.amountBox}>
          <AppTextField
            style={styles.amountInput}
            value={getAmountText(row)}
            onChangeText={text => changeAmount(row, text)}
            keyboardType="decimal-pad"
            accessibilityLabel={row.name}
          />
          {row.unit !== '' && <Text style={styles.unit}>{row.unit}</Text>}
        </View>
      </View>
    );
  };

  return (
    <SheetModal visible={visible} onClose={onClose} fullScreen>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('shoppingPlan.title')}</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            activeOpacity={0.7}
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={24} color={colors.primaryText} />
          </TouchableOpacity>
        </View>

        {rows.length > 0 && (
          <View style={styles.selectRow}>
            <TouchableOpacity onPress={handleSelectAll} style={styles.selectBtn} activeOpacity={0.7}>
              <Text style={styles.selectBtnText}>{t('shoppingPlan.selectAll')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeselectAll} style={styles.selectBtn} activeOpacity={0.7}>
              <Text style={styles.selectBtnText}>{t('shoppingPlan.deselectAll')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : rows.length === 0 || !hasPlannedMeals ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>{t('shoppingPlan.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={row => row.key}
            renderItem={renderRow}
            contentContainerStyle={styles.listContent}
            initialNumToRender={20}
          />
        )}

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <View style={styles.footer}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.backBtnText}>{t('shoppingPlan.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, (selectedRows.length === 0 || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={selectedRows.length === 0 || saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>{t('shoppingPlan.save')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SheetModal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  selectRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  selectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
  },
  selectBtnText: {
    color: colors.primaryText,
    fontWeight: '600',
    fontSize: 13,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  checkbox: {
    paddingTop: 2,
  },
  rowBody: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  detail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  warning: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 2,
  },
  sources: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  amountBox: {
    alignItems: 'flex-end',
    minWidth: 84,
  },
  amountInput: {
    width: 80,
  },
  unit: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  error: {
    color: colors.danger,
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 15,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
