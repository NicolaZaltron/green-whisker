import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { SheetModal } from './SheetModal';
import { normalizeIngredientName } from '../utils/catalogNameMatch';
import type { ImportChoice, KnownIngredient, UnresolvedIngredient } from '../utils/importResolution';
import { Pill } from './ui/Pill';
import { SearchBar } from './ui/SearchBar';
import { Button } from './ui/Button';
import { text, radius, space } from '../theme/tokens';

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
    <SheetModal visible={visible} onClose={onCancel}>
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
                    <Pill label={choice?.kind === 'existing' ? nameOf(choice.ingredientId) : t('recipeBook.unresolved.linkExisting')} size="M" selected={choice?.kind === 'existing'} onPress={() => { setOpenKey(open ? null : item.key); setQuery(''); }} />
                    <Pill label={t('recipeBook.unresolved.addNew')} size="M" selected={choice?.kind === 'new'} onPress={() => { choose(item.key, { kind: 'new' }); }} />
                  </View>
                  {open && (
                    <View style={styles.search}>
                      <SearchBar
                        size="M"
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('recipeBook.unresolved.searchPlaceholder')}
                        accessibilityLabel={t('recipeBook.unresolved.searchPlaceholder')}
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
            <Button label={t('mealPicker.cancel')} onPress={onCancel} size="M" variant="secondary" />
            <Button
              label={t('recipeBook.unresolved.confirm')}
              onPress={() => onConfirm(choices)}
              disabled={!allChosen}
              size="M"
              variant="primary"
            />
          </View>
        </View>
    </SheetModal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  box: { padding: 18, gap: space.lg },
  title: { fontSize: text.page, fontWeight: '700', color: colors.text },
  body: { fontSize: text.caption, color: colors.textSecondary, lineHeight: 18 },
  list: { flexGrow: 0 },
  row: { paddingVertical: space.lg, borderTopWidth: 1, borderColor: colors.border, gap: space.sm },
  name: { fontSize: text.body, fontWeight: '700', color: colors.text },
  used: { fontSize: text.label, color: colors.textMuted },
  choiceBar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  search: { gap: space.sm },
  match: { paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  matchText: { fontSize: text.caption, color: colors.text },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md },
});
