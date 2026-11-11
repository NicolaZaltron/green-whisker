import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

interface IngredientsModalProps {
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

type Tab = 'ingredients' | 'ready';

interface IngredientForm {
  name: string;
  // null finché l'utente non sceglie: il salvataggio risponde con invalid_type
  type: IngredientType | null;
  tags: IngredientTag[];
  edibleAlone: boolean;
  // Porzione: quantità che una persona mangia come spuntino o pasto semplice (solo se edibleAlone)
  amount: string;
  unit: string;
  // Quantità da comprare nella lista della spesa
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

// Testo di un campo numerico: vuoto o non valido = null (non impostato)
function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter(current => current !== item) : [...list, item];
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

export default function IngredientsModal({ visible, onClose, onChanged }: IngredientsModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Elenchi: caricati quando la scheda si apre
  const [tab, setTab] = useState<Tab>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [readyMeals, setReadyMeals] = useState<ReadyMeal[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<IngredientType | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ReadyMealCategory | null>(null);

  // Editor: null = elenco, 'new' = nuovo elemento, altrimenti elemento esistente
  const [ingEditing, setIngEditing] = useState<Ingredient | 'new' | null>(null);
  const [ingForm, setIngForm] = useState<IngredientForm>(ingredientToForm(null));
  const [readyEditing, setReadyEditing] = useState<ReadyMeal | 'new' | null>(null);
  const [readyForm, setReadyForm] = useState<ReadyForm>(readyToForm(null));

  const [pendingDelete, setPendingDelete] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Menu a tendina aperto nell'editor: solo uno alla volta
  const [unitMenu, setUnitMenu] = useState<'default' | 'purchase' | null>(null);

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

  const filteredIngredients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ingredients.filter(
      item =>
        (typeFilter === null || item.type === typeFilter) &&
        (q === '' || item.name.toLowerCase().includes(q)),
    );
  }, [ingredients, query, typeFilter]);

  const filteredReady = useMemo(() => {
    const q = query.trim().toLowerCase();
    return readyMeals.filter(
      item =>
        (categoryFilter === null || item.category === categoryFilter) &&
        (q === '' || item.name.toLowerCase().includes(q)),
    );
  }, [readyMeals, query, categoryFilter]);

  const resetEditors = () => {
    setUnitMenu(null);
    setIngEditing(null);
    setReadyEditing(null);
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

  // Indietro di sistema e X: dentro un editor tornano alla lista, altrimenti chiudono la modale
  const handleDismiss = () => {
    if (ingEditing !== null || readyEditing !== null) {
      backToList();
      return;
    }
    handleClose();
  };

  const openIngredient = (target: Ingredient | 'new') => {
    setError('');
    setUnitMenu(null);
    setPendingDelete(false);
    setIngForm(ingredientToForm(target === 'new' ? null : target));
    setIngEditing(target);
  };

  const openReady = (target: ReadyMeal | 'new') => {
    setError('');
    setPendingDelete(false);
    setReadyForm(readyToForm(target === 'new' ? null : target));
    setReadyEditing(target);
  };

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
        // Il form non modifica i valori nutrizionali: si conservano quelli esistenti
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

  const renderChip = (key: string, label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  // Menu a tendina per unità (stesso schema della lista della spesa); il valore salvato resta anche se fuori lista
  const renderUnitDropdown = (menu: 'default' | 'purchase', value: string, onSelect: (unit: string) => void) => {
    const open = unitMenu === menu;
    return (
      <>
        <TouchableOpacity
          style={[styles.input, styles.unitSelect]}
          onPress={() => setUnitMenu(open ? null : menu)}
          activeOpacity={0.7}
          accessibilityLabel={menu === 'default' ? t('ingredients.defaultUsageUnit') : t('ingredients.defaultPurchaseUnit')}
        >
          <Text style={styles.unitSelectText} numberOfLines={1}>
            {unitLabel(value, t) || t('shopping.unitNone')}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
        </TouchableOpacity>
        {open && (
          <ScrollView style={styles.unitMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {['', ...SHOPPING_UNITS].map(unit => {
              const active = value === unit;
              return (
                <TouchableOpacity
                  key={unit || 'none'}
                  style={[styles.unitOption, active && styles.unitOptionActive]}
                  onPress={() => {
                    onSelect(unit);
                    setUnitMenu(null);
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
      </>
    );
  };

  const searchField = (
    <View style={styles.searchFieldRow}>
      <AppTextField
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
      <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn} accessibilityLabel={t('common.close')}>
        <Ionicons name="close" size={24} color={colors.primaryText} />
      </TouchableOpacity>
    </View>
  );

  const tabRow = (
    <View style={styles.tabRow}>
      {(['ingredients', 'ready'] as const).map(key => {
        const active = tab === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => switchTab(key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {key === 'ingredients' ? t('ingredients.tabIngredients') : t('ingredients.tabReady')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderConfirm = (title: string, body: string, onConfirm: () => void) => (
    <View style={styles.confirmOverlay}>
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>{title}</Text>
        <Text style={styles.confirmBody}>{body}</Text>
        <View style={styles.footerRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPendingDelete(false)} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerBtn} onPress={onConfirm} activeOpacity={0.85}>
            <Text style={styles.dangerBtnText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const editorFooter = (isNew: boolean, onSave: () => void) => (
    <View style={styles.footer}>
      {error !== '' && <Text style={styles.errorText}>{error}</Text>}
      <View style={styles.footerRow}>
        {!isNew && (
          <TouchableOpacity style={styles.dangerBtn} onPress={() => setPendingDelete(true)} activeOpacity={0.85}>
            <Text style={styles.dangerBtnText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryBtn} onPress={backToList} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, styles.footerBtn, saving && styles.disabled]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Editor ingrediente
  if (ingEditing !== null) {
    return (
      <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
        {header}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}>
          <Text style={styles.label}>{t('ingredients.name')}</Text>
          <AppTextField
            style={styles.fieldSpacing}
            value={ingForm.name}
            onChangeText={name => patchIng({ name })}
            autoCorrect={false}
          />

          <Text style={styles.label}>{t('ingredients.typeLabel')}</Text>
          <View style={styles.chipWrap}>
            {INGREDIENT_TYPES.map(type =>
              renderChip(type, t(`ingredients.type.${type}`), ingForm.type === type, () => patchIng({ type })),
            )}
          </View>

          <Text style={styles.label}>{t('ingredients.tags')}</Text>
          <View style={styles.chipWrap}>
            {INGREDIENT_TAGS.map(tag =>
              renderChip(tag, formatTagLabel(tag, t), ingForm.tags.includes(tag), () =>
                patchIng({ tags: toggleItem(ingForm.tags, tag) }),
              ),
            )}
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('ingredients.edibleAlone')}</Text>
            <Switch
              value={ingForm.edibleAlone}
              onValueChange={edibleAlone => {
                patchIng({ edibleAlone });
                if (!edibleAlone) setUnitMenu(null);
              }}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>

          {ingForm.edibleAlone && (
            <>
              <Text style={styles.label}>{t('ingredients.portionLabel')}</Text>
              <AppTextField
                style={styles.fieldSpacing}
                value={ingForm.amount}
                onChangeText={amount => patchIng({ amount })}
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>{t('ingredients.defaultUsageUnit')}</Text>
              {renderUnitDropdown('default', ingForm.unit, unit => patchIng({ unit }))}
            </>
          )}

          <Text style={styles.label}>{t('ingredients.purchaseLabel')}</Text>
          <AppTextField
            style={styles.fieldSpacing}
            value={ingForm.purchaseAmount}
            onChangeText={purchaseAmount => patchIng({ purchaseAmount })}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>{t('ingredients.defaultPurchaseUnit')}</Text>
          {renderUnitDropdown('purchase', ingForm.purchaseUnit, unit => patchIng({ purchaseUnit: unit }))}

          <Text style={styles.label}>{t('ingredients.density')}</Text>
          <AppTextField
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

  // Editor piatto pronto
  if (readyEditing !== null) {
    return (
      <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
        {header}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}>
          <Text style={styles.label}>{t('ingredients.name')}</Text>
          <AppTextField
            style={styles.fieldSpacing}
            value={readyForm.name}
            onChangeText={name => patchReady({ name })}
            autoCorrect={false}
          />

          <Text style={styles.label}>{t('ingredients.categoryLabel')}</Text>
          <View style={styles.chipWrap}>
            {READY_MEAL_CATEGORIES.map(category =>
              renderChip(category, t(`ingredients.category.${category}`), readyForm.category === category, () =>
                patchReady({ category }),
              ),
            )}
          </View>

          <Text style={styles.label}>{t('ingredients.tags')}</Text>
          <View style={styles.chipWrap}>
            {INGREDIENT_TAGS.map(tag =>
              renderChip(tag, formatTagLabel(tag, t), readyForm.tags.includes(tag), () =>
                patchReady({ tags: toggleItem(readyForm.tags, tag) }),
              ),
            )}
          </View>

          <Text style={styles.label}>{t('ingredients.slots')}</Text>
          <View style={styles.chipWrap}>
            {ALL_SIMPLE_SLOTS.map(slot =>
              renderChip(slot, t(`planner.slots.${slot}`), readyForm.slots.includes(slot), () =>
                patchReady({ slots: toggleItem(readyForm.slots, slot) }),
              ),
            )}
          </View>

          <Text style={styles.label}>{t('ingredients.defaultCount')}</Text>
          <AppTextField
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

  // Elenco ingredienti
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
          ListHeaderComponent={
            <View>
              {searchField}
              <ScrollView key="ingredient-filters" horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                {renderChip('all', t('ingredients.all'), typeFilter === null, () => setTypeFilter(null))}
                {INGREDIENT_TYPES.map(type =>
                  renderChip(type, t(`ingredients.type.${type}`), typeFilter === type, () => setTypeFilter(type)),
                )}
              </ScrollView>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openIngredient(item)} activeOpacity={0.7}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {[t(`ingredients.type.${item.type}`), ...item.tags.map(tag => formatTagLabel(tag, t))].join(' · ')}
                </Text>
                {item.edible_alone && <Text style={styles.rowMeta}>{t('ingredients.edibleAlone')}</Text>}
              </View>
            </TouchableOpacity>
          )}
        />
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => openIngredient('new')} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>{t('ingredients.newIngredient')}</Text>
          </TouchableOpacity>
        </View>
      </SheetModal>
    );
  }

  // Elenco piatti pronti
  return (
    <SheetModal visible={visible} onClose={handleDismiss} fullScreen>
      {header}
      {tabRow}
      <FlatList
        data={filteredReady}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {searchField}
            <ScrollView key="ready-filters" horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {renderChip('all', t('ingredients.all'), categoryFilter === null, () => setCategoryFilter(null))}
              {READY_MEAL_CATEGORIES.map(category =>
                renderChip(category, t(`ingredients.category.${category}`), categoryFilter === category, () =>
                  setCategoryFilter(category),
                ),
              )}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openReady(item)} activeOpacity={0.7}>
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
        )}
      />
      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => openReady('new')} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>{t('ingredients.newReady')}</Text>
        </TouchableOpacity>
      </View>
    </SheetModal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
  closeBtn: { padding: 4 },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
  tabTextActive: { color: colors.onPrimary },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  searchFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchFieldInput: {
    flex: 1,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginBottom: 4,
  },
  fieldSpacing: { marginBottom: 4 },
  filterRow: { marginTop: 8, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.primaryText },
  chipTextActive: { color: colors.onPrimary },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 4,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  unitSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  unitSelectText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  unitMenu: { maxHeight: 240, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  unitOption: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  unitOptionActive: { backgroundColor: colors.primarySoft },
  unitOptionText: { fontSize: 14, color: colors.text },
  unitOptionTextActive: { fontWeight: '700', color: colors.primaryText },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerBtn: { flex: 1 },
  primaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryText },
  dangerBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
  },
  dangerBtnText: { fontSize: 15, fontWeight: '700', color: colors.danger },
  disabled: { opacity: 0.6 },
  errorText: { fontSize: 13, fontWeight: '600', color: colors.danger, marginBottom: 8 },
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 },
  confirmBody: { fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
});
