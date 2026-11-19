import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { SheetModal } from './SheetModal';
import { Spinner } from './ui/Spinner';
import { Checkbox } from './ui/Checkbox';
import { CircleButton } from './ui/CircleButton';
import { TextButton } from './ui/TextButton';
import { getRecipeDetail, getShoppingItems, getShoppingPlanEntries } from '../db/database';
import { listIngredients } from '../db/ingredientsDb';
import { listReadyMeals } from '../db/readyMealsDb';
import { listRecipeIngredients } from '../db/recipeIngredientsDb';
import { catalogRecipes } from '../services/recipeCatalog';
import { computeShoppingPreview, ShoppingPreviewRow } from '../services/shoppingPreview';
import { saveShoppingSelection } from '../services/shoppingPlanSave';
import type { MealPlanEntry, RecipeSummary, ShoppingItem } from '../types/recipe';
import type { Ingredient, ReadyMeal } from '../types/catalog';
import { AppTextField } from './ui/AppTextField';
import { InlineNotice } from './ui/InlineNotice';
import { Button } from './ui/Button';
import { space, text } from '../theme/tokens';

interface ShoppingPlanModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// Today's date in YYYY-MM-DD, using local date parts (not UTC).
function getLocalToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Default quantity: what is missing in the list, otherwise what is needed.
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
  const [noIngredientsFound, setNoIngredientsFound] = useState(false);
  const [rows, setRows] = useState<ShoppingPreviewRow[]>([]);
  // Rows selected and quantities edited by the user, indexed by row.key
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
          getShoppingPlanEntries(today),
          getShoppingItems(),
          listIngredients(),
          listReadyMeals(),
        ]);
        if (cancelled) return;

        const entries: MealPlanEntry[] = plans;
        const recipes: Record<string, RecipeSummary> = {};
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
        // Recipes without links in the database (created or imported before the links existed): the card's ingredients are used
        const withoutLinks = recipeIds.filter((_, idx) => recipeRows[idx].length === 0);
        const details = new Map(await Promise.all(withoutLinks.map(async id => [id, await getRecipeDetail(id)] as const)));
        if (cancelled) return;
        const recipeIngredients: Record<string, { ingredient_name: string; amount: number | null; unit: string }[]> = {};
        recipeIds.forEach((id, idx) => {
          const linked = recipeRows[idx];
          recipeIngredients[id] = linked.length > 0
            ? linked
            : (details.get(id)?.detailed_ingredients ?? []).map(item => ({
                ingredient_name: item.ingredient,
                amount: item.amount ?? null,
                unit: item.unit ?? '',
              }));
        });
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
          // Rows that are actually missing in the list are preselected
          initialSelected[row.key] = row.missing !== null;
        });

        setHasPlannedMeals(entries.length > 0);
        setNoIngredientsFound(entries.length > 0 && computed.length === 0);
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

  // A row is selectable only if it has a quantity (default or typed)
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
    // Typing a quantity selects the row
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
        <View style={styles.checkbox}>
          <Checkbox
            checked={isChecked}
            onToggle={() => toggleRow(row)}
            disabled={!selectable}
            accessibilityLabel={row.name}
          />
        </View>

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
            size="M"
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
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{t('shoppingPlan.title')}</Text>
            <Text style={styles.subtitle}>{t('shoppingPlan.subtitle')}</Text>
          </View>
          <CircleButton
            icon="close"
            variant="plain"
            onPress={onClose}
            accessibilityLabel={t('common.close')}
          />
        </View>

        {rows.length > 0 && (
          <View style={styles.selectRow}>
            <TextButton label={t('shoppingPlan.selectAll')} onPress={handleSelectAll} />
            <TextButton label={t('shoppingPlan.deselectAll')} onPress={handleDeselectAll} />
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <Spinner />
          </View>
        ) : rows.length === 0 || !hasPlannedMeals ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {noIngredientsFound ? t('shoppingPlan.noIngredients') : t('shoppingPlan.empty')}
            </Text>
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

        {error !== null && (
          <View style={styles.error}>
            <InlineNotice tone="danger" text={error} />
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.footerBtn}>
            <Button label={t('shoppingPlan.back')} onPress={onClose} size="L" variant="secondary" />
          </View>
          <View style={styles.footerBtn}>
            <Button
              label={t('shoppingPlan.save')}
              onPress={handleSave}
              size="L"
              disabled={selectedRows.length === 0 || saving}
            />
          </View>
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
    paddingHorizontal: space.xxxl,
    paddingVertical: space.xl,
  },
  titleBlock: {
    flex: 1,
    paddingRight: space.xl,
  },
  title: {
    fontSize: text.page,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: text.caption,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: 2,
  },
  selectRow: {
    flexDirection: 'row',
    gap: space.lg,
    paddingHorizontal: space.xxxl,
    paddingBottom: space.md,
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
    fontSize: text.title,
  },
  listContent: {
    paddingHorizontal: space.xxxl,
    paddingBottom: space.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: space.lg,
  },
  checkbox: {
    paddingTop: 2,
  },
  rowBody: {
    flex: 1,
  },
  name: {
    fontSize: text.title,
    fontWeight: '600',
    color: colors.text,
  },
  detail: {
    fontSize: text.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  warning: {
    fontSize: text.caption,
    color: colors.danger,
    marginTop: 2,
  },
  sources: {
    fontSize: text.caption,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  amountBox: {
    alignItems: 'flex-end',
    minWidth: 84,
  },
  amountInput: {
    width: 80,
  },
  unit: {
    fontSize: text.caption,
    color: colors.textSecondary,
    marginTop: space.xs,
  },
  error: {
    paddingHorizontal: space.xxxl,
    paddingBottom: space.md,
  },
  // Buttons stacked full width: two side by side would not fit the L minimum width on phones
  footer: {
    gap: space.lg,
    paddingHorizontal: space.xxxl,
    paddingVertical: space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerBtn: { width: '100%' },
});
