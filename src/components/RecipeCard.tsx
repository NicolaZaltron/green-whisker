import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../types/recipe';
import { isFavorite, toggleFavorite } from '../db/database';

interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
  onFavoriteChange?: (isFav: boolean) => void;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onPress, onFavoriteChange }) => {
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    let isMounted = true;
    isFavorite(recipe.id).then(fav => {
      if (isMounted) setFavorite(fav);
    });
    return () => {
      isMounted = false;
    };
  }, [recipe.id]);

  const handleToggleFavorite = async (e: any) => {
    e?.stopPropagation?.();
    const newFav = await toggleFavorite(recipe.id);
    setFavorite(newFav);
    if (onFavoriteChange) {
      onFavoriteChange(newFav);
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.imageWrapper}>
        {recipe.immagine ? (
          <Image
            source={{ uri: recipe.immagine }}
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
          <Text style={styles.categoryPillText}>{recipe.categoria}</Text>
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

        {recipe.tempi.tempo_totale_minuti > 0 && recipe.tempi.tempo_totale_minuti <= 25 && (
          <View style={styles.fastPill}>
            <Ionicons name="flash" size={11} color="#FFF" />
            <Text style={styles.fastPillText}>Veloce</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {recipe.titolo}
        </Text>

        <View style={styles.footer}>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color="#6C786E" style={{ marginRight: 3 }} />
            <Text style={styles.metaText}>{recipe.tempi.tempo_totale_minuti} min</Text>
          </View>

          <View style={styles.dot} />

          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={14} color="#6C786E" style={{ marginRight: 3 }} />
            <Text style={styles.metaText}>{recipe.porzioni}</Text>
          </View>

          <View style={styles.diffBadge}>
            <Text style={styles.diffText}>{recipe.difficolta}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

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
    height: 180,
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
});
