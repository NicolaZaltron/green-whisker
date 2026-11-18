import { SheetModal } from './SheetModal';
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, Switch, StyleSheet } from 'react-native';
import { ConfirmModal } from './ui/ConfirmModal';
import { TransferModal } from './TransferModal';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Recipe, RecipeSummary } from '../types/recipe';
import { getFullCatalogRecipes, getRecipeDetail } from '../db/database';
import { RecipePreviewCard } from './RecipePreviewCard';
import { applyCatalogImport, deleteRecipes, exportRecipeBook, findUnresolvedImportIngredients, pickCatalogFile } from '../services/recipeBookService';
import { knownIngredients } from '../db/recipeIngredientsDb';
import type { ImportChoice, KnownIngredient, UnresolvedIngredient } from '../utils/importResolution';
import { UnresolvedIngredientsModal } from './UnresolvedIngredientsModal';
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
  // The preview shows the whole recipe: its body is loaded when it opens
  const openPreview = (id: string) => {
    getRecipeDetail(id).then(full => setPreview(full));
  };
  // Deselected ones are stored: by default all are selected
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());

  // From the shared catalog: updates by itself on every change
  const catalogVersion = useCatalogVersion();
  // catalogVersion: the catalog is updated in place, the dependency forces recomputation
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

  // Changing the filter changes the list: previous selections no longer apply
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
      // The export needs the whole recipes: the bodies are loaded only now
      const full = new Map((await getFullCatalogRecipes()).map(r => [r.id, r]));
      const payload = toExport.flatMap(r => {
        const recipe = full.get(r.id);
        return recipe ? [recipe] : [];
      });
      const count = await exportRecipeBook(payload, filter);
      showStatus(t('recipeBook.exported', { count }));
    } catch (e) {
      console.warn('Esportazione ricettario fallita', e);
      showStatus(t('common.error'), true);
    } finally {
      setBusy(false);
    }
  };

  // An import that has unknown ingredient names waits for the user's choices in the modal
  const [pendingImport, setPendingImport] = useState<{
    parsed: ParsedCatalogFile;
    mode: 'overwrite' | 'keep';
    items: UnresolvedIngredient[];
    known: KnownIngredient[];
  } | null>(null);

  const finishImport = async (parsed: ParsedCatalogFile, mode: 'overwrite' | 'keep', choices?: Map<string, ImportChoice>) => {
    setBusy(true);
    setProgress({ phase: 'writing', done: 0, total: parsed.recipes.length });
    try {
      // Updated every 10 recipes and at the end: each update re-renders the whole book
      const result = await applyCatalogImport(parsed, mode, choices, (done, total) => {
        if (done === total || done % 10 === 0) setProgress({ phase: 'writing', done, total });
      });
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
      setProgress(null);
    }
  };

  const runImport = async (parsed: ParsedCatalogFile, mode: 'overwrite' | 'keep') => {
    setBusy(true);
    setProgress({ phase: 'checking', done: 0, total: parsed.recipes.length });
    let items: UnresolvedIngredient[];
    try {
      items = await findUnresolvedImportIngredients(parsed);
    } catch (e) {
      console.warn('Controllo ingredienti del ricettario fallito', e);
      showStatus(t('common.error'), true);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (items.length === 0) {
      await finishImport(parsed, mode);
      return;
    }
    setPendingImport({ parsed, mode, items, known: await knownIngredients() });
  };

  // Import progress shown next to the spinner: the recipes checked, then the recipes written so far
  const [progress, setProgress] = useState<{ phase: 'checking' | 'writing'; done: number; total: number } | null>(null);

  // Import and export of the book: one dialog shared with the other data (see TransferModal)
  const [transferOpen, setTransferOpen] = useState(false);

  // Import with recipes already in the book: the user chooses overwrite or keep
  const [conflict, setConflict] = useState<{ parsed: ParsedCatalogFile; count: number } | null>(null);

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
    console.log('[import] file', { recipes: parsed.recipes.length, invalid: parsed.invalid, invalidReasons: parsed.invalidReasons, duplicates: parsed.duplicates, conflicts });
    if (conflicts === 0) {
      await runImport(parsed, 'keep');
      return;
    }
    // In-window choice: Alert with several buttons does not work on web
    setConflict({ parsed, count: conflicts });
  };

  // Deletion: confirmation is in the window itself (an Alert opened from a modal is unreliable)
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

  const renderItem = ({ item }: { item: RecipeSummary }) => {
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
        <TouchableOpacity onPress={() => openPreview(item.id)} hitSlop={10} accessibilityLabel={t('recipeBook.preview')}>
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
    { value: 'bundled', label: t('recipeBook.originBundled') },
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
            style={[styles.dangerBtn, (busy || selected.length === 0) && styles.disabledBtn]}
            onPress={() => setPendingDelete(selected.map(r => r.id))}
            disabled={busy || selected.length === 0}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} style={styles.btnIcon} />
            <Text style={styles.dangerBtnText}>{t('recipeBook.deleteSelected', { count: selected.length })}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setTransferOpen(true)} disabled={busy} activeOpacity={0.85}>
            <Ionicons name="swap-vertical-outline" size={18} color={colors.primaryText} style={styles.btnIcon} />
            <Text style={styles.secondaryBtnText}>{t('transfer.recipes.title')}</Text>
          </TouchableOpacity>

          {busy ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color={colors.primaryText} />
              {progress ? (
                <Text style={styles.progressText}>
                  {progress.phase === 'checking'
                    ? t('recipeBook.checking', { total: progress.total })
                    : t('recipeBook.progress', { done: progress.done, total: progress.total })}
                </Text>
              ) : null}
            </View>
          ) : null}
          {message ? (
            <Text style={[styles.message, isError && styles.messageError]}>{message}</Text>
          ) : null}
        </View>

        <SheetModal visible={showFilters} onClose={() => setShowFilters(false)}>
          <View style={styles.filterSheet}>
            <View style={styles.filterHeader}>
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

        <TransferModal
          visible={transferOpen}
          kind="recipes"
          exportCount={toExport.length}
          onClose={() => setTransferOpen(false)}
          onExport={async () => {
            await handleExport();
            return null;
          }}
          onImport={async () => {
            setTransferOpen(false);
            await handleImport();
            return null;
          }}
        />

        <ConfirmModal
          visible={conflict !== null}
          icon="copy-outline"
          title={t('recipeBook.conflictTitle')}
          body={t('recipeBook.conflictMessage', { count: conflict?.count ?? 0 })}
          confirmLabel={t('recipeBook.overwriteAll')}
          cancelLabel={t('recipeBook.keepMine')}
          onConfirm={() => {
            const pending = conflict;
            setConflict(null);
            if (pending) void runImport(pending.parsed, 'overwrite');
          }}
          onCancel={() => {
            const pending = conflict;
            setConflict(null);
            if (pending) void runImport(pending.parsed, 'keep');
          }}
        />

        <UnresolvedIngredientsModal
          visible={pendingImport !== null}
          items={pendingImport?.items ?? []}
          known={pendingImport?.known ?? []}
          onConfirm={choices => {
            const pending = pendingImport;
            setPendingImport(null);
            if (pending) finishImport(pending.parsed, pending.mode, choices);
          }}
          onCancel={() => setPendingImport(null)}
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
  filterSheet: { padding: 20, paddingBottom: 4 },
  // Title row of the filter sheet: no extra margin, it sits inside the sheet padding
  filterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 0, marginBottom: 16 },
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
  progressRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressText: { fontSize: 13, fontWeight: '600' },
  message: { fontSize: 14, fontWeight: '600', color: colors.primaryText, marginTop: 12, lineHeight: 20 },
  messageError: { color: colors.danger },
});
