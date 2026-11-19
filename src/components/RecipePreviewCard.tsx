import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Recipe } from '../types/recipe';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { display, text, icon, space } from '../theme/tokens';
import { SheetModal } from './SheetModal';
import { Button } from './ui/Button';

// Quick preview above the recipe book: closing it leaves the export list and selections unchanged
export function RecipePreviewCard({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  return (
    <SheetModal visible={!!recipe} onClose={onClose}>
        {recipe ? (
          <View style={styles.card}>
            {recipe.image ? (
              <Image source={{ uri: recipe.image }} style={styles.image} contentFit="cover" />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Ionicons name="image-outline" size={display.md} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.body}>
              <Text style={styles.title}>{recipe.title}</Text>
              <View style={styles.metaRow}>
                <View style={styles.meta}>
                  <Ionicons name="time-outline" size={icon.xs} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{t('common.minutes', { count: recipe.times.total_minutes ?? 0 })}</Text>
                </View>
                <View style={styles.meta}>
                  <Ionicons name="people-outline" size={icon.xs} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{t('recipeBook.previewServings', { count: recipe.servings ?? 0 })}</Text>
                </View>
                <View style={styles.meta}>
                  <Ionicons name="list-outline" size={icon.xs} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{t('recipeBook.previewIngredients', { count: recipe.ingredients.length })}</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Button label={t('common.close')} onPress={onClose} size="M" variant="secondary" />
              </View>
            </View>
          </View>
        ) : null}
    </SheetModal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { width: '100%' },
  image: { width: '100%', height: 180, backgroundColor: colors.primarySoft },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.xxxl },
  title: { fontSize: text.heading, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl, marginVertical: space.lg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  metaText: { fontSize: text.caption, color: colors.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.lg, marginTop: space.sm },
});
