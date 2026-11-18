import { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { normalizeIngredientName } from '../utils/catalogNameMatch';
import type { ImportChoice, KnownIngredient, UnresolvedIngredient } from '../utils/importResolution';

const MAX_MATCHES = 8;
const MAX_TITLES = 3;

interface UnresolvedIngredientsModalProps {
  visible: boolean;
  items: UnresolvedIngredient[];
  known: KnownIngredient[];
  onConfirm: (choices: Map<string, ImportChoice>) => void;
  onCancel: () => void;
}

// Shown before an import when some ingredient names of the file are unknown: each one must be
// linked to an existing ingredient or added as a new one, otherwise the import does not start
export function UnresolvedIngredientsModal({ visible, items, known, onConfirm, onCancel }: UnresolvedIngredientsModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [choices, setChoices] = useState<Map<string, ImportChoice>>(new Map());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // A new list of unknown names starts with no choices (render-time reset, as in RecipeModal)
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setChoices(new Map());
    setOpenKey(null);
    setQuery('');
  }

  const matches = useMemo(() => {
    if (!openKey) return [];
    const q = normalizeIngredientName(query);
    return known.filter(k => !q || normalizeIngredientName(k.name).includes(q)).slice(0, MAX_MATCHES);
  }, [known, openKey, query]);

  const choose = (key: string, choice: ImportChoice) => {
    setChoices(prev => new Map(prev).set(key, choice));
    setOpenKey(null);
    setQuery('');
  };

  const allChosen = items.every(item => choices.has(item.key));
  const nameOf = (id: string) => known.find(k => k.id === id)?.name ?? id;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{t('recipeBook.unresolved.title')}</Text>
          <Text style={styles.body}>{t('recipeBook.unresolved.body', { count: items.length })}</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {items.map(item => {
              const choice = choices.get(item.key);
              const titles = item.recipeTitles.slice(0, MAX_TITLES).join(', ');
              const more = item.recipeTitles.length > MAX_TITLES ? ` +${item.recipeTitles.length - MAX_TITLES}` : '';
              const open = openKey === item.key;
              return (
                <View key={item.key} style={styles.row}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.used}>{t('recipeBook.unresolved.usedIn', { count: item.recipeTitles.length, titles: `${titles}${more}` })}</Text>
                  <View style={styles.choiceBar}>
                    <TouchableOpacity
                      style={[styles.chip, choice?.kind === 'existing' && styles.chipActive]}
                      onPress={() => { setOpenKey(open ? null : item.key); setQuery(''); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, choice?.kind === 'existing' && styles.chipTextActive]}>
                        {choice?.kind === 'existing' ? nameOf(choice.ingredientId) : t('recipeBook.unresolved.linkExisting')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, choice?.kind === 'new' && styles.chipActive]}
                      onPress={() => { choose(item.key, { kind: 'new' }); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, choice?.kind === 'new' && styles.chipTextActive]}>
                        {t('recipeBook.unresolved.addNew')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {open && (
                    <View style={styles.search}>
                      <TextInput
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('recipeBook.unresolved.searchPlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                      />
                      {matches.map(match => (
                        <TouchableOpacity
                          key={match.id}
                          style={styles.match}
                          onPress={() => choose(item.key, { kind: 'existing', ingredientId: match.id })}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.matchText}>{match.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.buttonSecondaryText}>{t('mealPicker.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary, !allChosen && styles.buttonDisabled]}
              onPress={() => onConfirm(choices)}
              disabled={!allChosen}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonPrimaryText}>{t('recipeBook.unresolved.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', padding: 20 },
  box: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, maxHeight: '85%', gap: 10 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  list: { flexGrow: 0 },
  row: { paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border, gap: 6 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  used: { fontSize: 11, color: colors.textMuted },
  choiceBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.onPrimary, fontWeight: '700' },
  search: { gap: 6 },
  searchInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 14, color: colors.text, backgroundColor: colors.surfaceAlt,
  },
  match: { paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, backgroundColor: colors.surfaceMuted },
  matchText: { fontSize: 13, color: colors.text },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  buttonSecondaryText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonPrimaryText: { fontSize: 13, fontWeight: '700', color: colors.onPrimary },
  buttonDisabled: { opacity: 0.4 },
});
