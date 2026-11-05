import React, { useMemo, useState } from 'react';
import { Alert, Modal, View, Text, TouchableOpacity, ActivityIndicator, FlatList, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Recipe } from '../types/recipe';
import { applyCatalogImport, deleteRecipes, exportRecipeBook, pickCatalogFile } from '../services/recipeBookService';
import { catalogRecipes, catalogVariants } from '../services/recipeCatalog';
import { useCatalogVersion } from '../hooks/useCatalog';
import { ExportFilter, ParsedCatalogFile, filterCatalog, withVariants } from '../services/catalogFormat';

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [filter, setFilter] = useState<ExportFilter>(DEFAULT_FILTER);
  const [includeVariants, setIncludeVariants] = useState(true);
  // Si memorizzano le deselezionate: per default sono tutte selezionate
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());

  // Dal catalogo condiviso: si aggiorna da solo a ogni modifica
  const catalogVersion = useCatalogVersion();
  const everything = useMemo(() => [...catalogRecipes, ...catalogVariants], [catalogVersion]);
  const listed = useMemo(() => filterCatalog(everything, filter), [everything, filter]);
  const selected = useMemo(() => listed.filter(r => !deselectedIds.has(r.id)), [listed, deselectedIds]);
  const toExport = useMemo(
    () => (includeVariants ? withVariants(selected, everything) : selected),
    [selected, everything, includeVariants]
  );

  const close = () => {
    setMessage('');
    onClose();
  };

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
    } catch (e) {
      console.warn('Lettura ricettario fallita', e);
      showStatus(t('recipeBook.invalidFile'), true);
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

  // Elimina le ricette indicate (con le varianti) dopo conferma
  const askDelete = (ids: string[]) => {
    Alert.alert(
      t('recipeBook.deleteTitle'),
      t('recipeBook.deleteMessage', { count: ids.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const count = await deleteRecipes(ids);
              setDeselectedIds(new Set());
              showStatus(t('recipeBook.deleted', { count }));
              onChanged();
            } catch (e) {
              console.warn('Eliminazione fallita', e);
              showStatus(t('common.error'), true);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Recipe }) => {
    const checked = !deselectedIds.has(item.id);
    return (
      <View style={styles.row}>
        <TouchableOpacity style={styles.rowMain} onPress={() => toggleRecipe(item.id)} activeOpacity={0.7}>
          <Ionicons
            name={checked ? 'checkbox' : 'square-outline'}
            size={22}
            color={checked ? '#34523C' : '#8A9A8D'}
          />
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.variant_of ? `${item.title} · ${t(`recipeBook.dietShort.${item.diet ?? 'omnivore'}`)}` : item.title}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => askDelete([item.id])} hitSlop={10} accessibilityLabel={t('common.delete')}>
          <Ionicons name="trash-outline" size={18} color="#D9534F" />
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('recipeBook.title')}</Text>
          <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color="#34523C" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.description}>{t('recipeBook.description')}</Text>

          {renderChips(t('recipeBook.filterScope'), scopeOptions, filter.scope, v => changeFilter('scope', v))}
          {renderChips(t('recipeBook.filterKind'), kindOptions, filter.kind, v => changeFilter('kind', v))}
          {renderChips(t('recipeBook.filterDiet'), dietOptions, filter.diet, v => changeFilter('diet', v))}
          {renderChips(t('recipeBook.filterOrigin'), originOptions, filter.origin, v => changeFilter('origin', v))}

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
              trackColor={{ false: '#D4DDD6', true: '#7FA186' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D4DDD6"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, (busy || toExport.length === 0) && styles.disabledBtn]}
            onPress={handleExport}
            disabled={busy || toExport.length === 0}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={18} color="#FFFFFF" style={styles.btnIcon} />
            <Text style={styles.primaryBtnText}>{t('recipeBook.exportSelected', { count: toExport.length })}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dangerBtn, (busy || selected.length === 0) && styles.disabledBtn]}
            onPress={() => askDelete(selected.map(r => r.id))}
            disabled={busy || selected.length === 0}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={18} color="#D9534F" style={styles.btnIcon} />
            <Text style={styles.dangerBtnText}>{t('recipeBook.deleteSelected', { count: selected.length })}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleImport} disabled={busy} activeOpacity={0.85}>
            <Ionicons name="folder-open-outline" size={18} color="#34523C" style={styles.btnIcon} />
            <Text style={styles.secondaryBtnText}>{t('recipeBook.import')}</Text>
          </TouchableOpacity>

          {busy ? <ActivityIndicator color="#34523C" style={styles.busy} /> : null}
          {message ? (
            <Text style={[styles.message, isError && styles.messageError]}>{message}</Text>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#1A2E1F' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  description: { fontSize: 14, color: '#5E6D60', lineHeight: 20, marginBottom: 10 },
  filterGroup: { marginBottom: 8 },
  filterLabel: { fontSize: 11, fontWeight: '700', color: '#5E6D60', marginBottom: 4, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4DDD6',
  },
  chipActive: { backgroundColor: '#34523C', borderColor: '#34523C' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#34523C' },
  chipTextActive: { color: '#FFFFFF' },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 6,
  },
  selectionCount: { fontSize: 13, color: '#5E6D60' },
  selectionToggle: { fontSize: 13, fontWeight: '700', color: '#34523C' },
  list: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3EAE4' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF3EF',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { flex: 1, fontSize: 14, color: '#1A2E1F' },
  empty: { padding: 16, fontSize: 13, color: '#5E6D60', textAlign: 'center' },
  variantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  variantsLabel: { fontSize: 13, color: '#1A2E1F', flex: 1, marginRight: 8 },
  btnIcon: { marginRight: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: '#34523C',
    borderRadius: 14,
    paddingVertical: 14,
  },
  disabledBtn: { opacity: 0.5 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4DDD6',
    borderRadius: 14,
    paddingVertical: 14,
  },
  secondaryBtnText: { color: '#34523C', fontSize: 15, fontWeight: '800' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E8B4B1',
    borderRadius: 14,
    paddingVertical: 12,
  },
  dangerBtnText: { color: '#D9534F', fontSize: 14, fontWeight: '800' },
  busy: { marginTop: 12 },
  message: { fontSize: 14, fontWeight: '600', color: '#34523C', marginTop: 12, lineHeight: 20 },
  messageError: { color: '#D9534F' },
});
