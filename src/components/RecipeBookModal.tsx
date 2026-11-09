import { SheetModal } from './SheetModal';
import React, { useMemo, useState } from 'react';
import { Alert, View, Text, TouchableOpacity, ActivityIndicator, FlatList, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Recipe } from '../types/recipe';
import { RecipePreviewCard } from './RecipePreviewCard';
import { applyCatalogImport, deleteRecipes, exportRecipeBook, pickCatalogFile } from '../services/recipeBookService';
import { catalogRecipes, catalogVariants } from '../services/recipeCatalog';
import { useCatalogVersion } from '../hooks/useCatalog';
import { ExportFilter, ParsedCatalogFile, filterCatalog, withVariants } from '../services/catalogFormat';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';

interface RecipeBookModalProps {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const DEFAULT_FILTER: ExportFilter = { scope: 'all', kind: 'both', diet: 'all', origin: 'all' };

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

export function RecipeBookModal({ visible, onClose, onChanged }: RecipeBookModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [filter, setFilter] = useState<ExportFilter>(DEFAULT_FILTER);
  const [includeVariants, setIncludeVariants] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [preview, setPreview] = useState<Recipe | null>(null);
  // Si memorizzano le deselezionate: per default sono tutte selezionate
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());

  // Dal catalogo condiviso: si aggiorna da solo a ogni modifica
  const catalogVersion = useCatalogVersion();
  // catalogVersion: il catalogo si aggiorna sul posto, la dipendenza forza il ricalcolo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const everything = useMemo(() => [...catalogRecipes, ...catalogVariants], [catalogVersion]);
  const listed = useMemo(() => filterCatalog(everything, filter), [everything, filter]);
  const selected = useMemo(() => listed.filter(r => !deselectedIds.has(r.id)), [listed, deselectedIds]);
  const toExport = useMemo(
    () => (includeVariants ? withVariants(selected, everything) : selected),
    [selected, everything, includeVariants]
  );

  const close = () => {
    setMessage('');
    setPreview(null);
    setShowFilters(false);
    onClose();
  };

  const activeFilterCount = (['scope', 'kind', 'diet', 'origin'] as const).filter(key => filter[key] !== DEFAULT_FILTER[key]).length;

  const showStatus = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  // Cambiare filtro cambia l'elenco: le selezioni precedenti non valgono più
  const changeFilter = <K extends keyof ExportFilter>(key: K, value: ExportFilter[K]) => {
    setFilter(prev => ({ ...prev, [key]: value }));
    setDeselectedIds(new Set());
  };

  const toggleRecipe = (id: string) => {
    setDeselectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const count = await exportRecipeBook(toExport, filter);
      showStatus(t('recipeBook.exported', { count }));
    } catch (e) {
      console.warn('Esportazione ricettario fallita', e);
      showStatus(t('common.error'), true);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (parsed: ParsedCatalogFile, mode: 'overwrite' | 'keep') => {
    setBusy(true);
    try {
      const result = await applyCatalogImport(parsed, mode);
      showStatus(t('recipeBook.imported', {
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        invalid: result.invalid,
      }));
      onChanged();
    } catch (e) {
      console.warn('Importazione ricettario fallita', e);
      showStatus(t('common.error'), true);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    let parsed: ParsedCatalogFile | null;
    try {
      parsed = await pickCatalogFile();
    } catch (e: any) {
      console.warn('Lettura ricettario fallita', e);
      showStatus(`${t('recipeBook.invalidFile')} (${e?.message ?? e})`, true);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!parsed) return;

    const existing = new Set(everything.map(r => r.id));
    const conflicts = parsed.recipes.filter(r => existing.has(r.id)).length;
    if (conflicts === 0) {
      await runImport(parsed, 'keep');
      return;
    }
    Alert.alert(
      t('recipeBook.conflictTitle'),
      t('recipeBook.conflictMessage', { count: conflicts }),
      [
        { text: t('recipeBook.overwriteAll'), onPress: () => runImport(parsed, 'overwrite') },
        { text: t('recipeBook.keepMine'), onPress: () => runImport(parsed, 'keep') },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  // Eliminazione: la conferma è nella finestra stessa (un Alert aperto da un modale non è affidabile)
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

  const runDelete = async (ids: string[]) => {
    setPendingDelete(null);
    setBusy(true);
    try {
      const count = await deleteRecipes(ids);
      setDeselectedIds(new Set());
      showStatus(t('recipeBook.deleted', { count }));
      onChanged();
    } catch (e: any) {
      console.warn('Eliminazione fallita', e);
      showStatus(`${t('common.error')}: ${e?.message ?? e}`, true);
    } finally {
      setBusy(false);
    }
  };

  const renderItem = ({ item }: { item: Recipe }) => {
    const checked = !deselectedIds.has(item.id);
    return (
      <View style={styles.row}>
        <TouchableOpacity style={styles.rowMain} onPress={() => toggleRecipe(item.id)} activeOpacity={0.7}>
          <Ionicons
            name={checked ? 'checkbox' : 'square-outline'}
            size={22}
            color={checked ? colors.primaryText : colors.textMuted}
          />
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.variant_of ? `${item.title} · ${t(`recipeBook.dietShort.${item.diet ?? 'omnivore'}`)}` : item.title}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPreview(item)} hitSlop={10} accessibilityLabel={t('recipeBook.preview')}>
          <Ionicons name="open-outline" size={18} color={colors.primaryText} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPendingDelete([item.id])} hitSlop={10} accessibilityLabel={t('common.delete')}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>
    );
  };

  const scopeOptions: FilterOption<ExportFilter['scope']>[] = [
    { value: 'all', label: t('recipeBook.scopeAll') },
    { value: 'personal', label: t('recipeBook.scopePersonal') },
  ];
  const kindOptions: FilterOption<ExportFilter['kind']>[] = [
    { value: 'both', label: t('recipeBook.optAll') },
    { value: 'originals', label: t('recipeBook.kindOriginals') },
    { value: 'variants', label: t('recipeBook.kindVariants') },
  ];
  const dietOptions: FilterOption<ExportFilter['diet']>[] = [
    { value: 'all', label: t('recipeBook.optAll') },
    { value: 'omnivore', label: t('recipeBook.dietShort.omnivore') },
    { value: 'vegetarian', label: t('recipeBook.dietShort.vegetarian') },
    { value: 'vegan', label: t('recipeBook.dietShort.vegan') },
  ];
  const originOptions: FilterOption<ExportFilter['origin']>[] = [
    { value: 'all', label: t('recipeBook.optAll') },
    { value: 'file', label: t('recipeBook.originFile') },
    { value: 'ai', label: t('recipeBook.originAi') },
    { value: 'manual', label: t('recipeBook.originManual') },
  ];

  const renderChips = <T extends string>(
    label: string,
    options: FilterOption<T>[],
    current: T,
    onSelect: (value: T) => void
  ) => (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map(option => {
          const active = option.value === current;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelect(option.value)}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <SheetModal visible={visible} onClose={close} fullScreen>
      <View style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('recipeBook.title')}</Text>
          <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color={colors.primaryText} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.description}>{t('recipeBook.description')}</Text>

          <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilters(true)} activeOpacity={0.8}>
            <Ionicons name="options-outline" size={16} color={colors.primaryText} />
            <Text style={styles.filterButtonText}>
              {t('recipeBook.filtersButton')}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>

          <View style={styles.selectionRow}>
            <Text style={styles.selectionCount}>
              {t('recipeBook.selectedCount', { selected: selected.length, total: listed.length })}
            </Text>
            <TouchableOpacity
              onPress={() => setDeselectedIds(deselectedIds.size === 0 ? new Set(listed.map(r => r.id)) : new Set())}
              hitSlop={8}
            >
              <Text style={styles.selectionToggle}>
                {deselectedIds.size === 0 ? t('recipeBook.deselectAll') : t('recipeBook.selectAll')}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            style={styles.list}
            data={listed}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            initialNumToRender={20}
            ListEmptyComponent={<Text style={styles.empty}>{t('recipeBook.noMatches')}</Text>}
          />

          <View style={styles.variantsRow}>
            <Text style={styles.variantsLabel}>{t('recipeBook.includeVariants')}</Text>
            <Switch
              value={includeVariants}
              onValueChange={setIncludeVariants}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor={colors.onPrimary}
              ios_backgroundColor={colors.borderStrong}
            />
          </View>

          {pendingDelete ? (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>{t('recipeBook.deleteMessage', { count: pendingDelete.length })}</Text>
              <View style={styles.confirmRow}>
                <TouchableOpacity style={styles.confirmCancel} onPress={() => setPendingDelete(null)} activeOpacity={0.85}>
                  <Text style={styles.confirmCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmDelete} onPress={() => runDelete(pendingDelete)} activeOpacity={0.85}>
                  <Text style={styles.confirmDeleteText}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, (busy || toExport.length === 0) && styles.disabledBtn]}
            onPress={handleExport}
            disabled={busy || toExport.length === 0}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={18} color={colors.onPrimary} style={styles.btnIcon} />
            <Text style={styles.primaryBtnText}>{t('recipeBook.exportSelected', { count: toExport.length })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dangerBtn, (busy || selected.length === 0) && styles.disabledBtn]}
            onPress={() => setPendingDelete(selected.map(r => r.id))}
            disabled={busy || selected.length === 0}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} style={styles.btnIcon} />
            <Text style={styles.dangerBtnText}>{t('recipeBook.deleteSelected', { count: selected.length })}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleImport} disabled={busy} activeOpacity={0.85}>
            <Ionicons name="folder-open-outline" size={18} color={colors.primaryText} style={styles.btnIcon} />
            <Text style={styles.secondaryBtnText}>{t('recipeBook.import')}</Text>
          </TouchableOpacity>

          {busy ? <ActivityIndicator color={colors.primaryText} style={styles.busy} /> : null}
          {message ? (
            <Text style={[styles.message, isError && styles.messageError]}>{message}</Text>
          ) : null}
        </View>

        <SheetModal visible={showFilters} onClose={() => setShowFilters(false)} autoHeight>
          <View style={styles.filterSheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('recipeBook.filtersTitle')}</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)} hitSlop={12} accessibilityLabel={t('common.close')}>
                <Ionicons name="close" size={24} color={colors.primaryText} />
              </TouchableOpacity>
            </View>
            {renderChips(t('recipeBook.filterScope'), scopeOptions, filter.scope, v => changeFilter('scope', v))}
            {renderChips(t('recipeBook.filterKind'), kindOptions, filter.kind, v => changeFilter('kind', v))}
            {renderChips(t('recipeBook.filterDiet'), dietOptions, filter.diet, v => changeFilter('diet', v))}
            {renderChips(t('recipeBook.filterOrigin'), originOptions, filter.origin, v => changeFilter('origin', v))}
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowFilters(false)} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </SheetModal>

        <RecipePreviewCard
          recipe={preview}
          onClose={() => setPreview(null)}
        />
      </View>
    </SheetModal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surfaceAlt },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  description: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 10 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    marginBottom: 8,
  },
  filterButtonText: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
  filterSheet: { padding: 20, paddingBottom: 28 },
  filterGroup: { marginBottom: 8 },
  filterLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 4, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.primaryText },
  chipTextActive: { color: colors.onPrimary },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 6,
  },
  selectionCount: { fontSize: 13, color: colors.textSecondary },
  selectionToggle: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
  list: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { flex: 1, fontSize: 14, color: colors.text },
  empty: { padding: 16, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  variantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  variantsLabel: { fontSize: 13, color: colors.text, flex: 1, marginRight: 8 },
  btnIcon: { marginRight: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  disabledBtn: { opacity: 0.5 },
  primaryBtnText: { color: colors.onPrimary, fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingVertical: 14,
  },
  secondaryBtnText: { color: colors.primaryText, fontSize: 15, fontWeight: '800' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 14,
    paddingVertical: 12,
  },
  confirmBox: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  confirmText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  confirmRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  confirmCancel: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  confirmCancelText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
  confirmDelete: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.danger },
  confirmDeleteText: { fontSize: 14, fontWeight: '800', color: colors.onPrimary },
  dangerBtnText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  busy: { marginTop: 12 },
  message: { fontSize: 14, fontWeight: '600', color: colors.primaryText, marginTop: 12, lineHeight: 20 },
  messageError: { color: colors.danger },
});
