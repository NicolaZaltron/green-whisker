import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../types/recipe';
import { useFavoritesSafe } from '../context/FavoritesContext';
import { useTranslation } from 'react-i18next';

export interface PantryMatchInfo {
  percentage: number;
  missingCount: number;
  missing: string[];
}

interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
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
  isFavorite: isFavProp,
  onToggleFavorite,
  onFavoriteChange,
  pantryMatch,
  onAddMissingToShopping,
}) => {
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
            <Ionicons name="leaf-outline" size={36} color="#A3B2A6" />
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
            color={favorite ? '#D9534F' : '#4A6B53'}
          />
        </TouchableOpacity>

        {recipe.times.total_minutes > 0 && recipe.times.total_minutes <= 25 && (
          <View style={styles.fastPill}>
            <Ionicons name="flash" size={11} color="#FFF" />
            <Text style={styles.fastPillText}>Veloce</Text>
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
              color={pantryMatch.missingCount === 0 ? '#1B6334' : '#995200'}
              style={{ marginRight: 4 }}
            />
            <Text style={[
              styles.pantryBadgeText,
              pantryMatch.missingCount === 0 ? styles.pantryBadgeTextFull : styles.pantryBadgeTextPartial
            ]}>
              {pantryMatch.missingCount === 0
                ? '100% • Pronta subito!'
                : `Hai il ${pantryMatch.percentage}% (mancano ${pantryMatch.missingCount})`}
            </Text>
          </View>
        )}

        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>

        <View style={styles.footer}>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color="#6C786E" style={{ marginRight: 3 }} />
            <Text style={styles.metaText}>{recipe.times.total_minutes} min</Text>
          </View>

          <View style={styles.dot} />

          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={14} color="#6C786E" style={{ marginRight: 3 }} />
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
            <Ionicons name="cart-outline" size={13} color="#4A6B53" style={{ marginRight: 5 }} />
            <Text style={styles.addMissingText}>
              Aggiungi {pantryMatch.missingCount} {pantryMatch.missingCount === 1 ? 'mancante' : 'mancanti'} alla spesa
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EFEBE4',
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  imageWrapper: {
    width: '100%',
    height: 160,
    backgroundColor: '#EAE5DC',
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
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B53',
    textTransform: 'uppercase',
  },
  favButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
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
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    padding: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B332B',
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
    color: '#6C786E',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#B5C0B7',
    marginHorizontal: 8,
  },
  diffBadge: {
    marginLeft: 'auto',
    backgroundColor: '#F3F5F3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  diffText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#556658',
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
    backgroundColor: '#E8F5E9',
  },
  pantryBadgePartial: {
    backgroundColor: '#FFF4E5',
  },
  pantryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pantryBadgeTextFull: {
    color: '#1B6334',
  },
  pantryBadgeTextPartial: {
    color: '#995200',
  },
  addMissingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F5F1',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D8E4DA',
  },
  addMissingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34523C',
  },
});
