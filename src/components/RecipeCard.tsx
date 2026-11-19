import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { RecipeSummary } from '../types/recipe';
import { VariantDiet } from '../services/catalogFormat';
import { useFavoritesSafe } from '../context/FavoritesContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { Pill } from './ui/Pill';
import { FavoriteButton } from './ui/FavoriteButton';
import { capitalize } from '../utils/text';
import { text, icon, cardRadius, radius, elevation, space } from '../theme/tokens';


export interface PantryMatchInfo {
  percentage: number;
  missingCount: number;
  missing: string[];
}

interface RecipeCardProps {
  recipe: RecipeSummary;
  onPress: () => void;
  // Vegetarian/vegan versions available for this recipe
  variantDiets?: VariantDiet[];
  isFavorite?: boolean;
  onToggleFavorite?: (recipeId: string) => void;
  onFavoriteChange?: (isFav: boolean) => void;
  pantryMatch?: PantryMatchInfo;
  onAddMissingToShopping?: (missing: string[], recipeTitle: string) => void;
}

// Pure memoized component to prevent unnecessary list re-renders
export const RecipeCard = React.memo<RecipeCardProps>(({
  recipe,
  onPress,
  variantDiets,
  isFavorite: isFavProp,
  onToggleFavorite,
  onFavoriteChange,
  pantryMatch,
  onAddMissingToShopping,
}) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const imageSource = useMemo(() => ({ uri: recipe.image }), [recipe.image]);
  const { t } = useTranslation();
  // Synchronous O(1) favorite status lookup without mount query cascades
  const favContext = useFavoritesSafe();
  const favorite = isFavProp !== undefined ? isFavProp : favContext?.isFavorite(recipe.id) ?? false;

  const handleToggleFavorite = async (e: GestureResponderEvent) => {
    e?.stopPropagation?.();
    if (onToggleFavorite) {
      onToggleFavorite(recipe.id);
    } else if (favContext) {
      await favContext.toggleFavorite(recipe.id);
    }
    if (onFavoriteChange) {
      onFavoriteChange(!favorite);
    }
  };

  const hasImage = !!recipe.image;
  const inlineStyle = styles.inline;

  const categoryBadge = (
    <View style={hasImage ? styles.categoryPill : [styles.categoryPill, inlineStyle]}>
      <Pill
        size="S"
        variant="primary"
        label={capitalize(t('categories.' + (recipe.subcategory || recipe.category), { defaultValue: recipe.subcategory || recipe.category }))}
      />
    </View>
  );

  const favoriteButton = (
    <View style={hasImage ? styles.favPosition : inlineStyle}>
      <FavoriteButton
        isFavorite={favorite}
        onPress={handleToggleFavorite}
        accessibilityLabel={t('recipeDetail.favorites')}
      />
    </View>
  );

  const variantBadge = variantDiets && variantDiets.length > 0 ? (
    <View
      style={hasImage ? styles.variantButton : [styles.variantButton, inlineStyle]}
      accessibilityLabel={t('recipeCard.hasVariants')}
    >
      <Ionicons name="layers-outline" size={icon.md} color={colors.primaryText} />
    </View>
  ) : null;

  const fastBadge = recipe.times.total_minutes > 0 && recipe.times.total_minutes <= 25 ? (
    <View style={hasImage ? styles.fastPill : [styles.fastPill, inlineStyle]}>
      <Pill size="S" variant="primary" icon="flash" label={capitalize(t('recipeCard.fast'))} />
    </View>
  ) : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      {hasImage ? (
        <View style={styles.imageWrapper}>
          <Image
            source={imageSource}
            style={[styles.image, { backgroundColor: colors.surfaceMuted }]}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
            recyclingKey={recipe.id}
          />
          {categoryBadge}
          {favoriteButton}
          {variantBadge}
          {fastBadge}
        </View>
      ) : (
        // No image: no picture area, the badges stay on one compact row above the title
        <View style={styles.compactTop}>
          <View style={styles.compactGroup}>
            {categoryBadge}
            {fastBadge}
          </View>
          <View style={styles.compactGroup}>
            {variantBadge}
            {favoriteButton}
          </View>
        </View>
      )}

      <View style={styles.content}>
        {pantryMatch && (
          <View style={[
            styles.pantryBadge,
            pantryMatch.missingCount === 0 ? styles.pantryBadgeFull : styles.pantryBadgePartial
          ]}>
            <Ionicons
              name={pantryMatch.missingCount === 0 ? 'checkmark-circle' : 'basket-outline'}
              size={icon.xs}
              color={pantryMatch.missingCount === 0 ? colors.primaryText : colors.warningText}
              style={{ marginRight: space.xs }}
            />
            <Text style={[
              styles.pantryBadgeText,
              pantryMatch.missingCount === 0 ? styles.pantryBadgeTextFull : styles.pantryBadgeTextPartial
            ]}>
              {pantryMatch.missingCount === 0
                ? t('recipeCard.pantryReady')
                : t('recipeCard.pantryPartial', { percentage: pantryMatch.percentage, missingCount: pantryMatch.missingCount })}
            </Text>
          </View>
        )}

        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>

        <View style={styles.footer}>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={icon.xs} color={colors.textSecondary} style={{ marginRight: 3 }} />
            <Text style={styles.metaText}>{t('common.minutes', { count: recipe.times.total_minutes })}</Text>
          </View>

          <View style={styles.dot} />

          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={icon.xs} color={colors.textSecondary} style={{ marginRight: 3 }} />
            <Text style={styles.metaText}>{recipe.servings}</Text>
          </View>

          <View style={styles.diffBadge}>
            <Pill size="S" variant="primary" label={capitalize(t(`explore.advanced.difficultyLevel.${recipe.difficulty}`, { defaultValue: recipe.difficulty }))} />
          </View>
        </View>

        {pantryMatch && pantryMatch.missingCount > 0 && onAddMissingToShopping && (
          <TouchableOpacity
            style={styles.addMissingBtn}
            onPress={(e: any) => {
              e?.stopPropagation?.();
              onAddMissingToShopping(pantryMatch.missing, recipe.title);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={icon.xs} color={colors.primaryText} style={{ marginRight: 5 }} />
            <Text style={styles.addMissingText}>
              {pantryMatch.missingCount === 1
                ? t('recipeCard.addMissingSingle', { number: pantryMatch.missingCount })
                : t('recipeCard.addMissingPlural', { number: pantryMatch.missingCount })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

const makeStyles = (colors: Palette, isDark: boolean) => StyleSheet.create({
  // Badges placed in the flow (no image): they replace the absolute positions of the picture area
  inline: { position: 'relative', top: 0, left: 0, right: 0, bottom: 0 },
  compactTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
  },
  compactGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: cardRadius,
    marginBottom: space.xxxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation(2, colors),
  },
  imageWrapper: {
    width: '100%',
    height: 160,
    backgroundColor: colors.surfaceMuted,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  categoryPill: { position: 'absolute', top: 12, left: 12 },
  variantButton: {
    position: 'absolute',
    top: 52,
    right: 10,
    backgroundColor: colors.surface,
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation(2, colors),
  },
  favPosition: { position: 'absolute', top: 10, right: 10 },
  fastPill: { position: 'absolute', bottom: 12, left: 12 },
  content: {
    padding: space.xxl,
  },
  title: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
    marginBottom: space.lg,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: text.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.textMuted,
    marginHorizontal: space.md,
  },
  diffBadge: { marginLeft: 'auto' },
  pantryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    marginBottom: space.md,
  },
  pantryBadgeFull: {
    backgroundColor: colors.primarySoft,
  },
  pantryBadgePartial: {
    backgroundColor: colors.warningSoft,
  },
  pantryBadgeText: {
    fontSize: text.label,
    fontWeight: '700',
  },
  pantryBadgeTextFull: {
    color: colors.primaryText,
  },
  pantryBadgeTextPartial: {
    color: colors.warningText,
  },
  addMissingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  addMissingText: {
    fontSize: text.label,
    fontWeight: '600',
    color: colors.primaryText,
  },
});

RecipeCard.displayName = 'RecipeCard';
