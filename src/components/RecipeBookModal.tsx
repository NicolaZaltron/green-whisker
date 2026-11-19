import { SheetModal } from './SheetModal';
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { CircleButton } from './ui/CircleButton';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Button } from './ui/Button';
import { ModalHeader } from './ui/ModalHeader';
import { Spinner } from './ui/Spinner';
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
import { text, icon, cardRadius, space } from '../theme/tokens';
import { SegmentedControl } from './ui/SegmentedControl';
import { TextButton } from './ui/TextButton';
import { Toggle } from './ui/Toggle';

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
            size={icon.xl}
            color={checked ? colors.primaryText : colors.textMuted}
          />
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.variant_of ? `${item.title} · ${t(`recipeBook.dietShort.${item.diet ?? 'omnivore'}`)}` : item.title}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openPreview(item.id)} hitSlop={10} accessibilityLabel={t('recipeBook.preview')}>
          <Ionicons name="open-outline" size={icon.md} color={colors.primaryText} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPendingDelete([item.id])} hitSlop={10} accessibilityLabel={t('common.delete')}>
          <Ionicons name="trash-outline" size={icon.md} color={colors.danger} />
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
      <SegmentedControl
        accessibilityLabel={label}
        options={options.map(option => ({ key: String(option.value), label: option.label }))}
        value={String(current)}
        onChange={key => onSelect(options.find(option => String(option.value) === key)!.value)}
      />
    </View>
  );

  return (
    <SheetModal visible={visible} onClose={close} fullScreen>
      <View style={styles.safeArea}>
        <ModalHeader title={t('recipeBook.title')} onClose={close} closeLabel={t('common.close')} />

        <View style={styles.content}>
          <Text style={styles.description}>{t('recipeBook.description')}</Text>

          <View style={styles.filterButton}>
            <Button
              label={`${t('recipeBook.filtersButton')}${activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}`}
              onPress={() => setShowFilters(true)}
              size="M"
              variant="secondary"
              icon="options-outline"
            />
          </View>

          <View style={styles.selectionRow}>
            <Text style={styles.selectionCount}>
              {t('recipeBook.selectedCount', { selected: selected.length, total: listed.length })}
            </Text>
            <TextButton
              label={deselectedIds.size === 0 ? t('recipeBook.deselectAll') : t('recipeBook.selectAll')}
              onPress={() => setDeselectedIds(deselectedIds.size === 0 ? new Set(listed.map(r => r.id)) : new Set())}
            />
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
            <Toggle
              label={t('recipeBook.includeVariants')}
              value={includeVariants}
              onValueChange={setIncludeVariants}
            />
          </View>

          {pendingDelete ? (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>{t('recipeBook.deleteMessage', { count: pendingDelete.length })}</Text>
              <View style={styles.confirmRow}>
                <View style={styles.confirmBtn}>
                  <Button label={t('common.cancel')} onPress={() => setPendingDelete(null)} size="M" variant="secondary" />
                </View>
                <View style={styles.confirmBtn}>
                  <Button label={t('common.delete')} onPress={() => runDelete(pendingDelete)} size="M" variant="danger" />
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.actionBtn}>
            <Button
              label={t('recipeBook.deleteSelected', { count: selected.length })}
              icon="trash-outline"
              variant="danger"
              size="M"
              onPress={() => setPendingDelete(selected.map(r => r.id))}
              disabled={busy || selected.length === 0}
            />
          </View>

          <View style={styles.actionBtn}>
            <Button
              label={t('transfer.recipes.title')}
              icon="swap-vertical-outline"
              variant="secondary"
              size="L"
              onPress={() => setTransferOpen(true)}
              disabled={busy}
            />
          </View>

          {busy ? (
            <View style={styles.progressRow}>
              <Spinner />
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
              <CircleButton variant="plain" icon="close" onPress={() => setShowFilters(false)} accessibilityLabel={t('common.close')} />
            </View>
            {renderChips(t('recipeBook.filterScope'), scopeOptions, filter.scope, v => changeFilter('scope', v))}
            {renderChips(t('recipeBook.filterKind'), kindOptions, filter.kind, v => changeFilter('kind', v))}
            {renderChips(t('recipeBook.filterDiet'), dietOptions, filter.diet, v => changeFilter('diet', v))}
            {renderChips(t('recipeBook.filterOrigin'), originOptions, filter.origin, v => changeFilter('origin', v))}
            <View style={styles.doneBtn}>
              <Button label={t('common.done')} size="L" variant="primary" onPress={() => setShowFilters(false)} />
            </View>
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

        <ConfirmDialog
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
  title: { fontSize: text.page, fontWeight: '700', color: colors.text },
  content: { flex: 1, paddingHorizontal: space.huge, paddingTop: space.xs, paddingBottom: space.xl },
  description: { fontSize: text.body, color: colors.textSecondary, lineHeight: 20, marginBottom: space.lg },
  filterButton: { alignSelf: 'flex-start', marginBottom: space.md },
  filterSheet: { padding: space.huge, paddingBottom: space.xs },
  // Title row of the filter sheet: no extra margin, it sits inside the sheet padding
  filterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 0, marginBottom: space.xxxl },
  filterGroup: { marginBottom: space.md },
  filterLabel: { fontSize: text.label, fontWeight: '700', color: colors.textSecondary, marginBottom: space.xs, textTransform: 'uppercase' },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  selectionCount: { fontSize: text.caption, color: colors.textSecondary },
  list: { flex: 1, backgroundColor: colors.surface, borderRadius: cardRadius, borderWidth: 1, borderColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
    paddingHorizontal: space.xxl,
    paddingVertical: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xl },
  rowTitle: { flex: 1, fontSize: text.body, color: colors.text },
  empty: { padding: space.xxxl, fontSize: text.caption, color: colors.textSecondary, textAlign: 'center' },
  variantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
  },
  actionBtn: { marginTop: space.lg },
  doneBtn: { marginTop: space.xl },
  confirmBox: { marginTop: space.xl, padding: space.xl, borderRadius: cardRadius, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  confirmText: { fontSize: text.caption, color: colors.text, lineHeight: 18 },
  confirmRow: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  // Wrapper only: shares the row width between the two confirm buttons
  confirmBtn: { flex: 1 },
  busy: { marginTop: space.xl },
  progressRow: { marginTop: space.xl, flexDirection: 'row', alignItems: 'center', gap: space.lg },
  progressText: { fontSize: text.caption, fontWeight: '600' },
  message: { fontSize: text.body, fontWeight: '600', color: colors.primaryText, marginTop: space.xl, lineHeight: 20 },
  messageError: { color: colors.danger },
});
