import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../types/recipe';
import { VariantDiet } from '../services/catalogFormat';
import { useFavoritesSafe } from '../context/FavoritesContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';

export interface PantryMatchInfo {
  percentage: number;
  missingCount: number;
  missing: string[];
}

interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
  // Versioni vegetariane/vegane disponibili per questa ricetta
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

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.imageWrapper}>
        {recipe.image ? (
          <Image
            source={{ uri: recipe.image }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="leaf-outline" size={36} color={colors.textMuted} />
          </View>
        )}

        <View style={styles.categoryPill}>
          <Text style={styles.categoryPillText}>
            {t('categories.' + (recipe.subcategory || recipe.category), { defaultValue: recipe.subcategory || recipe.category })}
          </Text>
        </View>

        {/* Pulsante Preferiti Rapido */}
        <TouchableOpacity
          style={styles.favButton}
          onPress={handleToggleFavorite}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={favorite ? 'heart' : 'heart-outline'}
            size={18}
            color={favorite ? colors.danger : colors.primaryText}
          />
        </TouchableOpacity>

        {variantDiets && variantDiets.length > 0 && (
          <View style={styles.variantButton} accessibilityLabel={t('recipeCard.hasVariants')}>
            <Ionicons name="layers-outline" size={18} color={colors.primaryText} />
          </View>
        )}

        {recipe.times.total_minutes > 0 && recipe.times.total_minutes <= 25 && (
          <View style={styles.fastPill}>
            <Ionicons name="flash" size={11} color={colors.onPrimary} />
            <Text style={styles.fastPillText}>{t('recipeCard.fast')}</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {pantryMatch && (
          <View style={[
            styles.pantryBadge,
            pantryMatch.missingCount === 0 ? styles.pantryBadgeFull : styles.pantryBadgePartial
          ]}>
            <Ionicons
              name={pantryMatch.missingCount === 0 ? 'checkmark-circle' : 'basket-outline'}
              size={13}
              color={pantryMatch.missingCount === 0 ? colors.primaryText : isDark ? '#F2B66D' : '#995200'}
              style={{ marginRight: 4 }}
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
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} style={{ marginRight: 3 }} />
            <Text style={styles.metaText}>{t('common.minutes', { count: recipe.times.total_minutes })}</Text>
          </View>

          <View style={styles.dot} />

          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={14} color={colors.textSecondary} style={{ marginRight: 3 }} />
            <Text style={styles.metaText}>{recipe.servings}</Text>
          </View>

          <View style={styles.diffBadge}>
            <Text style={styles.diffText}>{recipe.difficulty}</Text>
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
            <Ionicons name="cart-outline" size={13} color={colors.primaryText} style={{ marginRight: 5 }} />
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
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryText,
    textTransform: 'uppercase',
  },
  variantButton: {
    position: 'absolute',
    top: 52,
    right: 10,
    backgroundColor: colors.surface,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  favButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.surface,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  fastPill: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: '#D97757',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  fastPillText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    padding: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
    marginBottom: 10,
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
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
    marginHorizontal: 8,
  },
  diffBadge: {
    marginLeft: 'auto',
    backgroundColor: isDark ? '#27302A' : '#F3F5F3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  diffText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pantryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  pantryBadgeFull: {
    backgroundColor: colors.primarySoft,
  },
  pantryBadgePartial: {
    backgroundColor: isDark ? '#3A2E1C' : '#FFF4E5',
  },
  pantryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pantryBadgeTextFull: {
    color: colors.primaryText,
  },
  pantryBadgeTextPartial: {
    color: isDark ? '#F2B66D' : '#995200',
  },
  addMissingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  addMissingText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primaryText,
  },
});

RecipeCard.displayName = 'RecipeCard';
