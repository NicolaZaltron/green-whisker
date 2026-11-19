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
import { cardRadius, elevation, radius, space, text, icon } from '../../theme/tokens';
import { CircleButton } from '../ui/CircleButton';
import { Card } from '../ui/Card';

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
    <Card elevation={1} padding="xl" style={styles.foodCard}>
      <View style={styles.mealInfo}>
        {category !== '' && <Text style={[styles.mealCategory, { color: categoryColor }]}>{category}</Text>}
        <Text style={styles.mealTitle} numberOfLines={2}>
          {name ?? t('simpleItems.missing')}
        </Text>
        {name !== null && meta !== '' && <Text style={styles.mealMetaText}>{meta}</Text>}
      </View>
      <View style={styles.mealActions}>
        <CircleButton icon="trash-outline" size="S" onPress={onDelete} accessibilityLabel={t('common.delete')} />
      </View>
    </Card>
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
            <Ionicons name={placeholderIcon} size={icon.xl} color={placeholderColor} />
          </View>
        )}
        <View style={styles.mealInfo}>
          {categoryLabel}
          <Text style={styles.mealTitle} numberOfLines={2}>{recipe.title}</Text>
          <View style={styles.mealMeta}>
            <Ionicons name="time-outline" size={icon.xs} color={colors.textMuted} style={{ marginRight: 3 }} />
            <Text style={styles.mealMetaText}>{t('common.minutes', { count: recipe.times.total_minutes })}</Text>
            <Text style={styles.mealMetaDivider}>·</Text>
            <Ionicons name="people-outline" size={icon.xs} color={colors.textMuted} style={{ marginRight: 3 }} />
            <Text style={styles.mealMetaText}>{t('common.servings', { count: servings })}</Text>
          </View>
          <View style={[styles.sourceBadge, { backgroundColor: prepare ? colors.primarySoft : colors.surfaceMuted }]}>
            <Ionicons
              name={prepare ? 'flame-outline' : 'bag-check-outline'}
              size={icon.xs}
              color={prepare ? colors.primaryText : colors.textSecondary}
            />
            <Text style={[styles.sourceBadgeText, { color: prepare ? colors.primaryText : colors.textSecondary }]}>
              {t(`planner.recipeSource.${source}`)}
            </Text>
          </View>
        </View>
  
        <View style={styles.mealActions}>
          {onView && (
            <CircleButton icon="book-outline" size="S" onPress={onView} accessibilityLabel={t('common.view')} />
          )}
          <CircleButton icon="trash-outline" size="S" onPress={onDelete} accessibilityLabel={t('common.delete')} />
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
    backgroundColor: colors.surface, borderRadius: cardRadius, padding: space.xl,
    borderWidth: 1, borderColor: colors.border,
    ...elevation(1, colors),
  },
  foodCard: { flexDirection: 'row', alignItems: 'center' },
  mealImage: { width: 64, height: 64, borderRadius: radius.md, marginRight: space.xl },
  mealImagePlaceholder: { backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  mealInfo: { flex: 1 },
  mealCategory: { fontSize: text.label, fontWeight: '700', textTransform: 'uppercase' },
  mealTitle: { fontSize: text.body, fontWeight: '700', color: colors.text, marginTop: 2, lineHeight: 19 },
  mealMeta: { flexDirection: 'row', alignItems: 'center', marginTop: space.xs },
  mealMetaText: { fontSize: text.label, color: colors.textMuted, fontWeight: '500' },
  mealMetaDivider: { fontSize: text.label, color: colors.textMuted, marginHorizontal: space.xs },
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
    gap: space.xs,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  sourceBadgeText: { fontSize: text.label, fontWeight: '700' },
  mealActions: { flexDirection: 'row', gap: space.sm },
});
