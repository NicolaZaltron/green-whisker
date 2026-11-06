import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Recipe } from '../types/recipe';

// Anteprima rapida sopra il ricettario: chiudendola la lista e le selezioni dell'export restano invariate
export function RecipePreviewCard({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={!!recipe} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {recipe ? (
          <View style={styles.card}>
            {recipe.image ? (
              <Image source={{ uri: recipe.image }} style={styles.image} contentFit="cover" />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Ionicons name="image-outline" size={40} color="#A3B2A6" />
              </View>
            )}
            <View style={styles.body}>
              <Text style={styles.title}>{recipe.title}</Text>
              <View style={styles.metaRow}>
                <View style={styles.meta}>
                  <Ionicons name="time-outline" size={14} color="#5E6D60" />
                  <Text style={styles.metaText}>{t('common.minutes', { count: recipe.times.total_minutes ?? 0 })}</Text>
                </View>
                <View style={styles.meta}>
                  <Ionicons name="people-outline" size={14} color="#5E6D60" />
                  <Text style={styles.metaText}>{t('recipeBook.previewServings', { count: recipe.servings ?? 0 })}</Text>
                </View>
                <View style={styles.meta}>
                  <Ionicons name="list-outline" size={14} color="#5E6D60" />
                  <Text style={styles.metaText}>{t('recipeBook.previewIngredients', { count: recipe.ingredients.length })}</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.85}>
                  <Text style={styles.secondaryBtnText}>{t('common.close')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden' },
  image: { width: '100%', height: 180, backgroundColor: '#EAF0EB' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A2E1F' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: '#5E6D60' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  secondaryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#EAF0EB' },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: '#34523C' },
});
