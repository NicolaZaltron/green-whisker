import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import type { Recipe, MealPlanEntry } from '../../types/recipe';
import type { Ingredient, ReadyMeal } from '../../types/catalog';
import { unitLabel } from '../../constants/simpleTags';

// Voce pianificata con i dati già risolti (ricetta, ingrediente, piatto pronto)
export interface DayMealItem {
  entry: MealPlanEntry;
  recipe: Recipe | null;
  ingredient: Ingredient | null;
  ready: ReadyMeal | null;
}

// Le ricette non più nel catalogo restano nascoste; i piatti semplici mancanti mostrano un segnaposto
export function isVisiblePlannedItem({ entry, recipe }: DayMealItem): boolean {
  return recipe !== null || entry.kind === 'ingredient' || entry.kind === 'ready' || entry.kind === 'out' || !!entry.ingredient_id || !!entry.ready_meal_id;
}

// Nome della voce: titolo ricetta, nome ingrediente, nome piatto pronto o etichetta fuori casa
export function plannedItemLabel({ entry, recipe, ingredient, ready }: DayMealItem): string | null {
  if (recipe) return recipe.title;
  return ingredient?.name ?? ready?.name ?? (entry.kind === 'out' ? entry.label ?? null : null);
}

// Scheda di una voce pianificata: ricetta (MealRow) oppure ingrediente, piatto pronto o fuori casa (FoodRow)
export function PlannedItemCard({
  item,
  color,
  onView,
  onDelete,
}: {
  item: DayMealItem;
  color: string;
  onView?: (recipe: Recipe) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { entry, recipe, ready } = item;

  if (!recipe) {
    return (
      <FoodRow
        name={plannedItemLabel(item)}
        meta={
          entry.kind === 'ready'
            ? `${entry.count ?? 1} ×`
            : entry.amount != null ? `${entry.amount} ${unitLabel(entry.unit ?? '', t, entry.amount ?? 1)}`.trim() : ''
        }
        category={
          ready
            ? t('readyMeals.categories.' + ready.category, { defaultValue: ready.category })
            : ''
        }
        categoryColor={color}
        onDelete={onDelete}
      />
    );
  }

  return (
    <MealRow
      recipe={recipe}
      servings={entry.servings}
      categoryLabel={
        <Text style={[styles.mealCategory, { color }]}>
          {t('categories.' + recipe.category, { defaultValue: recipe.category })}
        </Text>
      }
      placeholderIcon="restaurant-outline"
      placeholderColor={colors.textMuted}
      onView={onView ? () => onView(recipe) : undefined}
      onDelete={onDelete}
    />
  );
}

// Riga di un ingrediente o piatto pronto pianificato
export function FoodRow({
  name,
  meta,
  category,
  categoryColor,
  onDelete,
}: {
  name: string | null;
  meta: string;
  category: string;
  categoryColor: string;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.mealCard}>
      <View style={styles.mealInfo}>
        {category !== '' && <Text style={[styles.mealCategory, { color: categoryColor }]}>{category}</Text>}
        <Text style={styles.mealTitle} numberOfLines={2}>
          {name ?? t('simpleItems.missing')}
        </Text>
        {name !== null && meta !== '' && <Text style={styles.mealMetaText}>{meta}</Text>}
      </View>
      <View style={styles.mealActions}>
        <TouchableOpacity style={styles.deleteMealBtn} onPress={onDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={17} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Riga di una ricetta pianificata
export function MealRow({
  recipe,
  servings,
  categoryLabel,
  placeholderIcon,
  placeholderColor,
  onView,
  onDelete,
}: {
  recipe: Recipe;
  servings: number;
  categoryLabel: React.ReactNode;
  placeholderIcon: React.ComponentProps<typeof Ionicons>['name'];
  placeholderColor: string;
  onView?: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.mealCard}>
      {recipe.image ? (
        <Image source={{ uri: recipe.image }} style={styles.mealImage} contentFit="cover" cachePolicy="disk" />
      ) : (
        <View style={[styles.mealImage, styles.mealImagePlaceholder]}>
          <Ionicons name={placeholderIcon} size={24} color={placeholderColor} />
        </View>
      )}
      <View style={styles.mealInfo}>
        {categoryLabel}
        <Text style={styles.mealTitle} numberOfLines={2}>{recipe.title}</Text>
        <View style={styles.mealMeta}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} style={{ marginRight: 3 }} />
          <Text style={styles.mealMetaText}>{t('common.minutes', { count: recipe.times.total_minutes })}</Text>
          <Text style={styles.mealMetaDivider}>·</Text>
          <Ionicons name="people-outline" size={12} color={colors.textMuted} style={{ marginRight: 3 }} />
          <Text style={styles.mealMetaText}>{t('common.servings', { count: servings })}</Text>
        </View>
      </View>

      <View style={styles.mealActions}>
        {onView && (
          <TouchableOpacity style={styles.viewMealBtn} onPress={onView} activeOpacity={0.7}>
            <Ionicons name="book-outline" size={17} color={colors.primaryText} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.deleteMealBtn} onPress={onDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={17} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors: Palette) => StyleSheet.create({
  mealCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  mealImage: { width: 64, height: 64, borderRadius: 12, marginRight: 12 },
  mealImagePlaceholder: { backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  mealInfo: { flex: 1 },
  mealCategory: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  mealTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2, lineHeight: 19 },
  mealMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  mealMetaText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  mealMetaDivider: { fontSize: 11, color: colors.textMuted, marginHorizontal: 4 },
  mealActions: { flexDirection: 'row', gap: 6 },
  viewMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  deleteMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
});
