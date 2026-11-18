import React, { useCallback, useMemo, useState } from 'react';
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
import type { RecipeSummary, MealPlanEntry, RecipeSource } from '../../types/recipe';
import type { Ingredient, ReadyMeal } from '../../types/catalog';
import type { MealPlanDetailInput } from '../../db/database';
import { unitLabel } from '../../constants/simpleTags';
import { ingredientDisplayName } from '../../utils/ingredientNames';
import { RecipeServingsStep } from './RecipeServingsStep';

// Planned entry with data already resolved (recipe, ingredient, ready meal)
export interface DayMealItem {
  entry: MealPlanEntry;
  recipe: RecipeSummary | null;
  ingredient: Ingredient | null;
  ready: ReadyMeal | null;
}

// Recipes no longer in the catalog stay hidden; missing simple dishes show a placeholder
export function isVisiblePlannedItem({ entry, recipe }: DayMealItem): boolean {
  return recipe !== null || entry.kind === 'ingredient' || entry.kind === 'ready' || entry.kind === 'out' || !!entry.ingredient_id || !!entry.ready_meal_id;
}

// Entry name: recipe title, translated ingredient name, ready meal name or out-of-home label
export function plannedItemLabel(
  { entry, recipe, ingredient, ready }: DayMealItem,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (recipe) return recipe.title;
  if (ingredient) return ingredientDisplayName(ingredient, t);
  return ready?.name ?? (entry.kind === 'out' ? entry.label ?? null : null);
}

// Card of a planned entry: recipe (MealRow) or ingredient, ready meal or out of home (FoodRow)
// onDelete and onView receive id/recipe from the child: the parent passes stable functions and memo works
export const PlannedItemCard = React.memo(function PlannedItemCard({
  item,
  color,
  onView,
  onDelete,
  onUpdate,
}: {
  item: DayMealItem;
  color: string;
  onView?: (recipe: RecipeSummary) => void;
  onDelete: (entryId: string) => void;
  // Planner only: without this function the card is not editable (e.g. in the picker)
  onUpdate?: (entryId: string, input: MealPlanDetailInput) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { entry, recipe, ready } = item;
  const entryId = entry.id;

  const handleDelete = useCallback(() => onDelete(entryId), [onDelete, entryId]);
  const handleView = useCallback(() => {
    if (recipe && onView) onView(recipe);
  }, [onView, recipe]);

  // In-place edit, with the same step used when adding
  const [editing, setEditing] = useState(false);
  const [editServings, setEditServings] = useState(entry.servings);
  const [editSource, setEditSource] = useState<RecipeSource>(entry.recipe_source ?? 'prepare');
  const handleToggleEdit = useCallback(() => {
    setEditServings(entry.servings);
    setEditSource(entry.recipe_source ?? 'prepare');
    setEditing(open => !open);
  }, [entry.servings, entry.recipe_source]);
  const changeEditServings = useCallback((delta: number) => {
    setEditServings(current => Math.min(24, Math.max(1, current + delta)));
  }, []);
  const handleCancelEdit = useCallback(() => setEditing(false), []);
  const handleSaveEdit = useCallback(() => {
    if (!recipe || !onUpdate) return;
    onUpdate(entryId, { kind: 'recipe', recipeId: recipe.id, servings: editServings, recipeSource: editSource });
    setEditing(false);
  }, [recipe, onUpdate, entryId, editServings, editSource]);

  if (!recipe) {
    return (
      <FoodRow
        name={plannedItemLabel(item, t)}
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
        onDelete={handleDelete}
      />
    );
  }

  return (
    <MealRow
      recipe={recipe}
      servings={entry.servings}
      source={entry.recipe_source ?? 'prepare'}
      categoryLabel={
        <Text style={[styles.mealCategory, { color }]}>
          {t('categories.' + recipe.category, { defaultValue: recipe.category })}
        </Text>
      }
      placeholderIcon="restaurant-outline"
      placeholderColor={colors.textMuted}
      onView={onView ? handleView : undefined}
      onEdit={onUpdate ? handleToggleEdit : undefined}
      onDelete={handleDelete}
      editing={editing}
      editStep={editing ? (
        <RecipeServingsStep
          servings={editServings}
          onChangeServings={changeEditServings}
          source={editSource}
          onChangeSource={setEditSource}
          onCancel={handleCancelEdit}
          onConfirm={handleSaveEdit}
          confirmLabel={t('planner.saveEdit')}
        />
      ) : null}
    />
  );
});

// Row of a planned ingredient or ready meal
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

// Row of a planned recipe, with the prepared / already ready badge and, when editing, the step below
export function MealRow({
  recipe,
  servings,
  source,
  categoryLabel,
  placeholderIcon,
  placeholderColor,
  onView,
  onEdit,
  onDelete,
  editing,
  editStep,
}: {
  recipe: RecipeSummary;
  servings: number;
  source: RecipeSource;
  categoryLabel: React.ReactNode;
  placeholderIcon: React.ComponentProps<typeof Ionicons>['name'];
  placeholderColor: string;
  onView?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  editing: boolean;
  editStep: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const prepare = source === 'prepare';
  const imageSource = useMemo(() => ({ uri: recipe.image }), [recipe.image]);

  return (
    <View>
      <TouchableOpacity
        style={[styles.mealCard, editing && styles.mealCardEditing]}
        onPress={onEdit}
        disabled={!onEdit}
        activeOpacity={0.7}
      >
        {recipe.image ? (
          <Image
            source={imageSource}
            style={[styles.mealImage, styles.mealImagePlaceholder]}
            contentFit="cover"
            cachePolicy="disk"
            recyclingKey={recipe.id}
            transition={0}
          />
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
          <View style={[styles.sourceBadge, { backgroundColor: prepare ? colors.primarySoft : colors.surfaceMuted }]}>
            <Ionicons
              name={prepare ? 'flame-outline' : 'bag-check-outline'}
              size={11}
              color={prepare ? colors.primaryText : colors.textSecondary}
            />
            <Text style={[styles.sourceBadgeText, { color: prepare ? colors.primaryText : colors.textSecondary }]}>
              {t(`planner.recipeSource.${source}`)}
            </Text>
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
      </TouchableOpacity>
      {editStep}
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
  mealCardEditing: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
    // No shadow on the bottom edge: attached to the step below it must not leave a gray line
    shadowOpacity: 0,
    elevation: 0,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  sourceBadgeText: { fontSize: 10, fontWeight: '700' },
  mealActions: { flexDirection: 'row', gap: 6 },
  viewMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  deleteMealBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
});
