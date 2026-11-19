import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SheetModal } from './SheetModal';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import {
  INGREDIENT_TAGS,
  INGREDIENT_TYPES,
  NUTRIENTS,
  READY_MEAL_CATEGORIES,
  type Ingredient,
  type IngredientTag,
  type IngredientType,
  type Nutrient,
  type ReadyMeal,
  type ReadyMealCategory,
} from '../types/catalog';
import type { SimpleSlot } from '../types/recipe';
import { formatTagLabel, unitLabel } from '../constants/simpleTags';
import { SHOPPING_UNITS } from '../constants/shoppingUnits';
import { ALL_SIMPLE_SLOTS } from '../utils/simpleSlots';
import { deleteIngredient, listIngredients, saveIngredient } from '../db/ingredientsDb';
import { deleteReadyMeal, listReadyMeals, saveReadyMeal } from '../db/readyMealsDb';
import { AppTextField } from './ui/AppTextField';
import { CircleButton } from './ui/CircleButton';
import { Select } from './ui/Select';
import { OutOfHomeList } from './OutOfHomeList';
import { TransferModal, type TransferKind } from './TransferModal';
import { exportIngredientsFile, importIngredientsFile } from '../services/ingredientTransfer';
import { exportReadyMealsFile, importReadyMealsFile } from '../services/readyMealTransfer';
import {
  addOutOfHomeOption,
  deleteOutOfHomeOption,
  exportOutOfHomeFile,
  importOutOfHomeFile,
  listOutOfHomeEntries,
  renameOutOfHomeOption,
  type OutOfHomeEntry,
} from '../services/outOfHomeService';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';
import { InlineNotice } from './ui/InlineNotice';
import { Toggle } from './ui/Toggle';
import { cardRadius, space, text } from '../theme/tokens';

interface IngredientsModalProps {
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

type Tab = 'ingredients' | 'ready' | 'outOfHome';

interface IngredientForm {
  name: string;
  // null until the user chooses: saving responds with invalid_type
  type: IngredientType | null;
  tags: IngredientTag[];
  edibleAlone: boolean;
  // Portion: amount one person eats as a snack or simple meal (only if edibleAlone)
  amount: string;
  unit: string;
  // Quantity to buy in the shopping list
  purchaseAmount: string;
  purchaseUnit: string;
  density: string;
  nutrients: Record<Nutrient, string>;
}

interface ReadyForm {
  name: string;
  category: ReadyMealCategory;
  tags: IngredientTag[];
  slots: SimpleSlot[];
  count: string;
}

// Text of a numeric field: empty or invalid = null (not set)
function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function nutrientTexts(source: Partial<Record<Nutrient, number>>): Record<Nutrient, string> {
  return NUTRIENTS.reduce((acc, key) => {
    const value = source[key];
    acc[key] = value === undefined ? '' : String(value);
    return acc;
  }, {} as Record<Nutrient, string>);
}

function ingredientToForm(item: Ingredient | null): IngredientForm {
  if (!item) {
    return {
      name: '', type: null, tags: [], edibleAlone: false, amount: '', unit: '', purchaseAmount: '', purchaseUnit: '',
      density: '', nutrients: nutrientTexts({}),
    };
  }
  return {
    name: item.name,
    type: item.type,
    tags: item.tags,
    edibleAlone: item.edible_alone,
    amount: item.default_amount === null ? '' : String(item.default_amount),
    unit: item.default_unit,
    purchaseAmount: item.purchase_amount === null ? '' : String(item.purchase_amount),
    purchaseUnit: item.purchase_unit,
    density: item.density_g_per_ml === null ? '' : String(item.density_g_per_ml),
    nutrients: nutrientTexts(item.nutrients),
  };
}

function readyToForm(item: ReadyMeal | null): ReadyForm {
  if (!item) return { name: '', category: 'pronto', tags: [], slots: [], count: '1' };
  return {
    name: item.name,
    category: item.category,
    tags: item.tags as IngredientTag[],
    slots: item.slots as SimpleSlot[],
    count: String(item.default_count),
  };
}

// Rows of the ingredients and ready meals list: memoized, so search does not re-render all rows
const IngredientListRow = memo(function IngredientListRow({ item, onOpen }: { item: Ingredient; onOpen: (target: Ingredient) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.row} onPress={() => onOpen(item)} activeOpacity={0.7}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowMeta}>
          {[t(`ingredients.type.${item.type}`), ...item.tags.map(tag => formatTagLabel(tag, t))].join(' · ')}
        </Text>
        {item.edible_alone && <Text style={styles.rowMeta}>{t('ingredients.edibleAlone')}</Text>}
      </View>
    </TouchableOpacity>
  );
});

const ReadyListRow = memo(function ReadyListRow({ item, onOpen }: { item: ReadyMeal; onOpen: (target: ReadyMeal) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.row} onPress={() => onOpen(item)} activeOpacity={0.7}>
      <View style={styles.rowMain}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowMeta}>
          {[t(`ingredients.category.${item.category}`), ...item.tags.map(tag => formatTagLabel(tag, t))].join(' · ')}
        </Text>
        <Text style={styles.rowMeta}>
          {item.slots.map(slot => t(`planner.slots.${slot}`)).join(' · ')}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default function IngredientsModal({ visible, onClose, onChanged }: IngredientsModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Lists: loaded when the tab opens
  const [tab, setTab] = useState<Tab>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [readyMeals, setReadyMeals] = useState<ReadyMeal[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<IngredientType | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ReadyMealCategory | null>(null);
  const [readyTagFilter, setReadyTagFilter] = useState<string | null>(null);

  // Editor: null = list, 'new' = new item, otherwise existing item
  const [ingEditing, setIngEditing] = useState<Ingredient | 'new' | null>(null);
  const [ingForm, setIngForm] = useState<IngredientForm>(ingredientToForm(null));
  const [readyEditing, setReadyEditing] = useState<ReadyMeal | 'new' | null>(null);
  const [readyForm, setReadyForm] = useState<ReadyForm>(readyToForm(null));

  const [pendingDelete, setPendingDelete] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Tab "Fuori casa": its add field, and the import/export dialog shared by the three tabs
  const [outEntries, setOutEntries] = useState<OutOfHomeEntry[]>([]);
  const [outEditing, setOutEditing] = useState<OutOfHomeEntry | 'new' | null>(null);
  const [outName, setOutName] = useState('');
  const [outError, setOutError] = useState('');
  const [outReload, setOutReload] = useState(0);
  const [outConfirmDelete, setOutConfirmDelete] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const transferKind: TransferKind = tab === 'ingredients' ? 'ingredients' : tab === 'ready' ? 'readyMeals' : 'outOfHome';

  // Opens the editor page of an option ('new' for a new one)
  const openOutOfHome = (target: OutOfHomeEntry | 'new') => {
    setOutEditing(target);
    setOutName(target === 'new' ? '' : target.label);
    setOutError('');
  };

  const saveOutOfHome = async () => {
    try {
      if (outEditing === 'new') await addOutOfHomeOption(outName);
      else if (outEditing) await renameOutOfHomeOption(outEditing.id, outName);
      setOutEditing(null);
      setOutError('');
      setOutReload(k => k + 1);
    } catch (e: any) {
      const key = String(e?.message ?? '');
      setOutError(key.startsWith('outOfHome.') ? t(key) : t('transfer.failed'));
    }
  };

  const deleteOutOfHome = async () => {
    if (!outEditing || outEditing === 'new') return;
    setOutConfirmDelete(false);
    try {
      await deleteOutOfHomeOption(outEditing.id);
      setOutEditing(null);
      setOutReload(k => k + 1);
    } catch {
      setOutError(t('transfer.failed'));
    }
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    Promise.all([listIngredients(), listReadyMeals()])
      .then(([ings, meals]) => {
        if (cancelled) return;
        setIngredients(ings);
        setReadyMeals(meals);
      })
      .catch(e => console.warn('Caricamento ingredienti fallito', e));
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const reload = async () => {
    const [ings, meals] = await Promise.all([listIngredients(), listReadyMeals()]);
    setIngredients(ings);
    setReadyMeals(meals);
  };

  // The dialog works on the tab that is open: its export and import
  const transferModal = (
    <TransferModal
      visible={transferOpen}
      kind={transferKind}
      onClose={() => setTransferOpen(false)}
      onExport={async () => {
        if (tab === 'ingredients') return t('transfer.exported', { count: await exportIngredientsFile() });
        if (tab === 'ready') return t('transfer.exported', { count: await exportReadyMealsFile() });
        return t('transfer.exported', { count: await exportOutOfHomeFile() });
      }}
      onImport={async () => {
        if (tab === 'outOfHome') {
          const result = await importOutOfHomeFile();
          if (!result) return null;
          setOutReload(k => k + 1);
          return t('transfer.imported', { count: result.imported });
        }
        const result = tab === 'ingredients' ? await importIngredientsFile() : await importReadyMealsFile();
        if (!result) return null;
        await reload();
        onChanged?.();
        return result.invalid > 0
          ? t('transfer.importedWithErrors', { count: result.imported, invalid: result.invalid })
          : t('transfer.imported', { count: result.imported });
      }}
    />
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    listOutOfHomeEntries()
      .then(list => { if (!cancelled) setOutEntries(list); })
      .catch(e => console.warn('Lettura voci fuori casa fallita', e));
    return () => {
      cancelled = true;
    };
  }, [visible, outReload]);

  // Search on the out-of-home options, same field as the other tabs
  const visibleOutEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? outEntries.filter(entry => entry.label.toLowerCase().includes(q)) : outEntries;
  }, [outEntries, query]);

  const filteredIngredients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ingredients.filter(
      item =>
        (typeFilter === null || item.type === typeFilter) &&
        (q === '' || item.name.toLowerCase().includes(q)),
    );
  }, [ingredients, query, typeFilter]);

  // Ready meal tags: those of INGREDIENT_TAGS in their order, then those specific to ready meals
  const readyTags = useMemo(() => {
    const present = new Set(readyMeals.flatMap(meal => meal.tags));
    const known = INGREDIENT_TAGS.filter(tag => present.has(tag));
    const extra = [...present].filter(tag => !(INGREDIENT_TAGS as readonly string[]).includes(tag)).sort();
    return [...known, ...extra];
  }, [readyMeals]);

  const filteredReady = useMemo(() => {
    const q = query.trim().toLowerCase();
    return readyMeals.filter(
      item =>
        (categoryFilter === null || item.category === categoryFilter) &&
        (readyTagFilter === null || (item.tags as string[]).includes(readyTagFilter)) &&
        (q === '' || item.name.toLowerCase().includes(q)),
    );
  }, [readyMeals, query, categoryFilter, readyTagFilter]);

  const resetEditors = () => {
    setIngEditing(null);
    setReadyEditing(null);
    setOutEditing(null);
    setOutConfirmDelete(false);
    setPendingDelete(false);
    setError('');
  };

  const handleClose = () => {
    resetEditors();
    onClose();
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setQuery('');
    setTypeFilter(null);
    setCategoryFilter(null);
    setError('');
  };

  const backToList = () => {
    resetEditors();
  };

  // System back and X: inside an editor they return to the list, otherwise they close the modal
  const handleDismiss = () => {
    if (ingEditing !== null || readyEditing !== null || outEditing !== null) {
      backToList();
      return;
    }
    handleClose();
  };

  const openIngredient = useCallback((target: Ingredient | 'new') => {
    setError('');
    setPendingDelete(false);
    setIngForm(ingredientToForm(target === 'new' ? null : target));
    setIngEditing(target);
  }, []);

  const openReady = useCallback((target: ReadyMeal | 'new') => {
    setError('');
    setPendingDelete(false);
    setReadyForm(readyToForm(target === 'new' ? null : target));
    setReadyEditing(target);
  }, []);

  const patchIng = (patch: Partial<IngredientForm>) => setIngForm(f => ({ ...f, ...patch }));
  const changeNutrient = (key: Nutrient, text: string) =>
    setIngForm(f => ({ ...f, nutrients: { ...f.nutrients, [key]: text } }));
  const patchReady = (patch: Partial<ReadyForm>) => setReadyForm(f => ({ ...f, ...patch }));

  const handleSaveIngredient = async () => {
    if (ingEditing === null) return;
    setError('');
    setSaving(true);
    try {
      const nutrients: Partial<Record<Nutrient, number>> = {};
      for (const key of NUTRIENTS) {
        const value = parseNumber(ingForm.nutrients[key]);
        if (value !== null) nutrients[key] = value;
      }
      await saveIngredient({
        id: ingEditing === 'new' ? undefined : ingEditing.id,
        name: ingForm.name,
        type: ingForm.type as IngredientType,
        tags: ingForm.tags,
        edible_alone: ingForm.edibleAlone,
        default_amount: parseNumber(ingForm.amount),
        default_unit: ingForm.unit.trim(),
        purchase_amount: parseNumber(ingForm.purchaseAmount),
        purchase_unit: ingForm.purchaseUnit.trim(),
        density_g_per_ml: parseNumber(ingForm.density),
        nutrients,
        aliases: [],
      });
      await reload();
      setIngEditing(null);
      onChanged?.();
    } catch (e: any) {
      if (e?.message === 'name_required') {
        setError(t('ingredients.nameRequired'));
      } else if (e?.message === 'invalid_type') {
        setError(t('ingredients.typeRequired'));
      } else {
        console.warn('Salvataggio ingrediente fallito', e);
        setError(t('common.error'));
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteIngredient = async () => {
    if (ingEditing === null || ingEditing === 'new') return;
    try {
      await deleteIngredient(ingEditing.id);
      setPendingDelete(false);
      await reload();
      setIngEditing(null);
      onChanged?.();
    } catch (e) {
      console.warn('Eliminazione ingrediente fallita', e);
      setPendingDelete(false);
      setError(t('common.error'));
    }
  };

  const handleSaveReady = async () => {
    if (readyEditing === null) return;
    if (readyForm.slots.length === 0) {
      setError(t('ingredients.slotRequired'));
      return;
    }
    setError('');
    setSaving(true);
    try {
      const count = parseNumber(readyForm.count);
      await saveReadyMeal({
        id: readyEditing === 'new' ? undefined : readyEditing.id,
        name: readyForm.name,
        category: readyForm.category,
        tags: readyForm.tags,
        slots: ALL_SIMPLE_SLOTS.filter(s => readyForm.slots.includes(s)),
        default_count: count === null ? 1 : Math.max(1, Math.round(count)),
        // The form does not edit nutritional values: the existing ones are kept
        nutrients: readyEditing === 'new' ? {} : readyEditing.nutrients,
      });
      await reload();
      setReadyEditing(null);
      onChanged?.();
    } catch (e: any) {
      if (e?.message === 'name_required') {
        setError(t('ingredients.nameRequired'));
      } else {
        console.warn('Salvataggio pronto fallito', e);
        setError(t('common.error'));
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteReady = async () => {
    if (readyEditing === null || readyEditing === 'new') return;
    try {
      await deleteReadyMeal(readyEditing.id);
      setPendingDelete(false);
      await reload();
      setReadyEditing(null);
      onChanged?.();
    } catch (e) {
      console.warn('Eliminazione pronto fallita', e);
      setPendingDelete(false);
      setError(t('common.error'));
    }
  };

  // Unit dropdown (shared Select); the saved value stays even if out of list
  const renderUnitDropdown = (label: string, value: string, onSelect: (unit: string) => void) => (
    <View style={styles.fieldSpacing}>
      <Select
        value={value}
        options={['', ...SHOPPING_UNITS].map(unit => ({ value: unit, label: unitLabel(unit, t) || t('shopping.unitNone') }))}
        onChange={onSelect}
        accessibilityLabel={label}
        size="M"
      />
    </View>
  );

  const searchField = (
    <View style={styles.searchFieldRow}>
      <AppTextField
        variant="search"
        size="M"
        style={styles.searchFieldInput}
        value={query}
        onChangeText={setQuery}
        placeholder={t('ingredients.search')}
        autoCorrect={false}
      />
    </View>
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{t('ingredients.title')}</Text>
      <CircleButton variant="plain" icon="close" onPress={handleDismiss} accessibilityLabel={t('common.close')} />
    </View>
  );

  const tabRow = (
    <View style={styles.tabRow}>
      <SegmentedControl
        accessibilityLabel={t('ingredients.title')}
        options={[
          { key: 'ingredients', label: t('ingredients.tabIngredients') },
          { key: 'ready', label: t('ingredients.tabReady') },
          { key: 'outOfHome', label: t('ingredients.tabOutOfHome') },
        ]}
        value={tab}
        onChange={key => switchTab(key as Tab)}
      />
    </View>
  );

  const renderConfirm = (title: string, body: string, onConfirm: () => void) => (
    <ConfirmDialog
      visible
      variant="destructive"
      title={title}
      body={body}
      confirmLabel={t('common.delete')}
      cancelLabel={t('common.cancel')}
      onConfirm={onConfirm}
      onCancel={() => setPendingDelete(false)}
    />
  );

  const editorFooter = (isNew: boolean, onSave: () => void) => (
    <View style={styles.footer}>
      {error !== '' && <InlineNotice tone="danger" text={error} />}
      <View style={styles.footerRow}>
        {!isNew && (
          <Button label={t('common.delete')} onPress={() => setPendingDelete(true)} size="M" variant="danger" />
        )}
        <Button label={t('common.cancel')} onPress={backToList} size="M" variant="secondary" />
        <View style={styles.footerBtn}><Button label={t('common.save')} onPress={onSave} size="M" variant="primary" disabled={saving} /></View>
      </View>
    </View>
  );

  // Ingredient editor
  if (ingEditing !== null) {
    return (
      <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
        {header}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}>
          <Text style={styles.label}>{t('ingredients.name')}</Text>
          <AppTextField
            size="M"
            style={styles.fieldSpacing}
            value={ingForm.name}
            onChangeText={name => patchIng({ name })}
            autoCorrect={false}
          />

          <Text style={styles.label}>{t('ingredients.typeLabel')}</Text>
          <View style={styles.chipWrap}>
            <SegmentedControl
              accessibilityLabel={t('ingredients.typeLabel')}
              options={INGREDIENT_TYPES.map(type => ({ key: type, label: t(`ingredients.type.${type}`) }))}
              value={ingForm.type ?? ''}
              onChange={type => patchIng({ type: type as typeof ingForm.type })}
            />
          </View>

          <Text style={styles.label}>{t('ingredients.tags')}</Text>
          <View style={styles.chipWrap}>
            <SegmentedControl
              multiple
              accessibilityLabel={t('ingredients.tags')}
              options={INGREDIENT_TAGS.map(tag => ({ key: tag, label: formatTagLabel(tag, t) }))}
              values={ingForm.tags}
              onChange={tags => patchIng({ tags: tags as typeof ingForm.tags })}
            />
          </View>

          <View style={styles.toggleRow}>
            <Toggle
              label={t('ingredients.edibleAlone')}
              value={ingForm.edibleAlone}
              onValueChange={edibleAlone => {
                patchIng({ edibleAlone });
              }}
            />
          </View>

          {ingForm.edibleAlone && (
            <>
              <Text style={styles.label}>{t('ingredients.portionLabel')}</Text>
              <AppTextField
                size="M"
                style={styles.fieldSpacing}
                value={ingForm.amount}
                onChangeText={amount => patchIng({ amount })}
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>{t('ingredients.defaultUsageUnit')}</Text>
              {renderUnitDropdown(t('ingredients.defaultUsageUnit'), ingForm.unit, unit => patchIng({ unit }))}
            </>
          )}

          <Text style={styles.label}>{t('ingredients.purchaseLabel')}</Text>
          <AppTextField
            size="M"
            style={styles.fieldSpacing}
            value={ingForm.purchaseAmount}
            onChangeText={purchaseAmount => patchIng({ purchaseAmount })}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>{t('ingredients.defaultPurchaseUnit')}</Text>
          {renderUnitDropdown(t('ingredients.defaultPurchaseUnit'), ingForm.purchaseUnit, unit => patchIng({ purchaseUnit: unit }))}

          <Text style={styles.label}>{t('ingredients.density')}</Text>
          <AppTextField
            size="M"
            style={styles.fieldSpacing}
            value={ingForm.density}
            onChangeText={density => patchIng({ density })}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>{t('ingredients.nutrients')}</Text>
          {NUTRIENTS.map(key => (
            <View key={key}>
              <Text style={styles.label}>{t(`ingredients.nutrient.${key}`)}</Text>
              <AppTextField
                size="M"
                style={styles.fieldSpacing}
                value={ingForm.nutrients[key]}
                onChangeText={text => changeNutrient(key, text)}
                keyboardType="decimal-pad"
              />
            </View>
          ))}
        </ScrollView>
        {editorFooter(ingEditing === 'new', handleSaveIngredient)}
        {pendingDelete && renderConfirm(t('ingredients.deleteTitle'), t('ingredients.deleteBody'), confirmDeleteIngredient)}
      </SheetModal>
    );
  }

  // Ready meal editor
  if (readyEditing !== null) {
    return (
      <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
        {header}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}>
          <Text style={styles.label}>{t('ingredients.name')}</Text>
          <AppTextField
            size="M"
            style={styles.fieldSpacing}
            value={readyForm.name}
            onChangeText={name => patchReady({ name })}
            autoCorrect={false}
          />

          <Text style={styles.label}>{t('ingredients.categoryLabel')}</Text>
          <View style={styles.chipWrap}>
            <SegmentedControl
              accessibilityLabel={t('ingredients.categoryLabel')}
              options={READY_MEAL_CATEGORIES.map(category => ({ key: category, label: t(`ingredients.category.${category}`) }))}
              value={readyForm.category}
              onChange={category => patchReady({ category: category as typeof readyForm.category })}
            />
          </View>

          <Text style={styles.label}>{t('ingredients.tags')}</Text>
          <View style={styles.chipWrap}>
            <SegmentedControl
              multiple
              accessibilityLabel={t('ingredients.tags')}
              options={INGREDIENT_TAGS.map(tag => ({ key: tag, label: formatTagLabel(tag, t) }))}
              values={readyForm.tags}
              onChange={tags => patchReady({ tags: tags as typeof readyForm.tags })}
            />
          </View>

          <Text style={styles.label}>{t('ingredients.slots')}</Text>
          <View style={styles.chipWrap}>
            <SegmentedControl
              multiple
              accessibilityLabel={t('ingredients.slots')}
              options={ALL_SIMPLE_SLOTS.map(slot => ({ key: slot, label: t(`planner.slots.${slot}`) }))}
              values={readyForm.slots}
              onChange={slots => patchReady({ slots: slots as typeof readyForm.slots })}
            />
          </View>

          <Text style={styles.label}>{t('ingredients.defaultCount')}</Text>
          <AppTextField
            size="M"
            style={styles.fieldSpacing}
            value={readyForm.count}
            onChangeText={count => patchReady({ count })}
            keyboardType="number-pad"
          />
        </ScrollView>
        {editorFooter(readyEditing === 'new', handleSaveReady)}
        {pendingDelete &&
          renderConfirm(t('ingredients.deleteReadyTitle'), t('ingredients.deleteReadyBody'), confirmDeleteReady)}
      </SheetModal>
    );
  }

  // Ingredients list
  if (tab === 'ingredients') {
    return (
      <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
        {header}
        {tabRow}
        <FlatList
          data={filteredIngredients}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          // The search and the filters stay on top: only the list scrolls
          stickyHeaderIndices={[0]}
          ListHeaderComponent={
            <View style={styles.stickyHeader}>
              {searchField}
              <View key="ingredient-filters" style={styles.filterRow}>
                <SegmentedControl
                  accessibilityLabel={t('ingredients.typeLabel')}
                  options={[{ key: 'all', label: t('ingredients.all') }, ...INGREDIENT_TYPES.map(type => ({ key: type, label: t(`ingredients.type.${type}`) }))]}
                  pinnedKey="all"
                  value={typeFilter ?? 'all'}
                  onChange={key => setTypeFilter(key === 'all' ? null : (key as IngredientType))}
                />
              </View>
            </View>
          }
          renderItem={({ item }) => <IngredientListRow item={item} onOpen={openIngredient} />}
        />
        <View style={styles.footer}>
          <Button label={t('ingredients.newIngredient')} onPress={() => openIngredient('new')} size="M" variant="primary" />
          <Button label={t('ingredients.transfer')} onPress={() => setTransferOpen(true)} size="M" variant="secondary" />
        </View>
        {transferModal}
      </SheetModal>
    );
  }

  // Out-of-home option editor: same structure as the ingredient and ready meal editors
  if (outEditing !== null) {
    const isNew = outEditing === 'new';
    return (
      <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
        {header}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}>
          <Text style={styles.label}>{t('ingredients.name')}</Text>
          <AppTextField size="M" style={styles.fieldSpacing} value={outName} onChangeText={setOutName} autoCorrect={false} />
        </ScrollView>
        <View style={styles.footer}>
          {outError !== '' && <InlineNotice tone="danger" text={outError} />}
          <View style={styles.footerRow}>
            {!isNew && (
              <Button label={t('common.delete')} onPress={() => setOutConfirmDelete(true)} size="M" variant="danger" />
            )}
            <Button label={t('common.cancel')} onPress={resetEditors} size="M" variant="secondary" />
            <View style={styles.footerBtn}><Button label={t('common.save')} onPress={saveOutOfHome} size="M" variant="primary" /></View>
          </View>
        </View>
        <ConfirmDialog
          visible={outConfirmDelete}
          icon="trash-outline"
          title={t('outOfHome.deleteTitle')}
          body={t('outOfHome.deleteBody', { label: outName })}
          confirmLabel={t('outOfHome.deleteConfirm')}
          cancelLabel={t('outOfHome.cancel')}
          onCancel={() => setOutConfirmDelete(false)}
          onConfirm={deleteOutOfHome}
          variant="destructive"
        />
      </SheetModal>
    );
  }

  // Out-of-home options list
  if (tab === 'outOfHome') {
    return (
      <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
        {header}
        {tabRow}
        <View style={[styles.stickyHeader, { paddingHorizontal: space.xxxl }]}>{searchField}</View>
        <View style={styles.outList}>
          <OutOfHomeList entries={visibleOutEntries} onOpen={openOutOfHome} />
        </View>
        <View style={styles.footer}>
          <Button label={t('ingredients.newOutOfHome')} onPress={() => openOutOfHome('new')} size="M" variant="primary" />
          <Button label={t('ingredients.transfer')} onPress={() => setTransferOpen(true)} size="M" variant="secondary" />
        </View>
        {transferModal}
      </SheetModal>
    );
  }

  // Ready meals list
  return (
    <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
      {header}
      {tabRow}
      <FlatList
        data={filteredReady}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View style={styles.stickyHeader}>
            {searchField}
            <View key="ready-filters" style={styles.filterRow}>
              <SegmentedControl
                accessibilityLabel={t('ingredients.categoryLabel')}
                options={[{ key: 'all', label: t('ingredients.all') }, ...READY_MEAL_CATEGORIES.map(category => ({ key: category, label: t(`ingredients.category.${category}`) }))]}
                value={categoryFilter ?? 'all'}
                onChange={key => setCategoryFilter(key === 'all' ? null : (key as ReadyMealCategory))}
              />
              {readyTags.length > 0 && (
                <View style={styles.filterGap}>
                  <SegmentedControl
                    accessibilityLabel={t('ingredients.tags')}
                    options={[
                      { key: 'all', label: t('explore.allCategories') },
                      ...readyTags.map(tag => ({ key: tag, label: formatTagLabel(tag, t) })),
                    ]}
                    pinnedKey="all"
                    value={readyTagFilter ?? 'all'}
                    onChange={key => setReadyTagFilter(key === 'all' || readyTagFilter === key ? null : key)}
                  />
                </View>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => <ReadyListRow item={item} onOpen={openReady} />}
      />
      <View style={styles.footer}>
        <Button label={t('ingredients.newReady')} onPress={() => openReady('new')} size="M" variant="primary" />
        <Button label={t('ingredients.transfer')} onPress={() => setTransferOpen(true)} size="M" variant="secondary" />
      </View>
      {transferModal}
    </SheetModal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  outList: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xxxl,
    paddingVertical: space.xl,
  },
  title: { flex: 1, fontSize: text.page, fontWeight: '700', color: colors.text },
  tabRow: { paddingHorizontal: space.xxxl, paddingBottom: space.xs },
  listContent: { paddingHorizontal: space.xxxl, paddingBottom: space.xxxl },
  label: { fontSize: text.caption, fontWeight: '700', color: colors.textSecondary, marginTop: space.xl, marginBottom: space.sm },
  searchFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  searchFieldInput: {
    flex: 1,
  },
  fieldSpacing: { marginBottom: space.xs },
  filterRow: { marginTop: space.md, marginBottom: space.md },
  filterGap: { marginTop: space.md },
  // Opaque, so the list scrolls under it without showing through
  stickyHeader: { backgroundColor: colors.background, paddingTop: space.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.xs },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    paddingVertical: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xl,
    paddingHorizontal: space.xl,
    marginBottom: space.md,
    borderRadius: cardRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: text.title, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: text.caption, color: colors.textSecondary, marginTop: 2 },
  footer: {
    paddingHorizontal: space.xxxl,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  footerBtn: { flex: 1 },
});
