import React, { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import type { RecipeSource } from '../../types/recipe';

const RECIPE_SOURCES: RecipeSource[] = ['prepare', 'ready'];

interface RecipeServingsStepProps {
  servings: number;
  onChangeServings: (delta: number) => void;
  source: RecipeSource;
  onChangeSource: (source: RecipeSource) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}

// Recipe servings step: prepare / already ready choice, number of servings, cancel and confirm.
// Used both to add a recipe to the meal and to edit an already planned entry
export const RecipeServingsStep = React.memo(function RecipeServingsStep({
  servings,
  onChangeServings,
  source,
  onChangeSource,
  onCancel,
  onConfirm,
  confirmLabel,
}: RecipeServingsStepProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.recipeStep}>
      <Text style={styles.recipeSourceQuestion}>{t('mealPicker.recipeSourceQuestion')}</Text>
      <View style={styles.recipeSourceBar}>
        {RECIPE_SOURCES.map(option => {
          const active = source === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => onChangeSource(option)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {t(`mealPicker.recipeSource.${option}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.stepInputs}>
        <View style={styles.servingsStepper}>
          <Text style={styles.servingsLabel}>
            {t(source === 'prepare' ? 'mealPicker.servingsToPrepare' : 'mealPicker.servingsToEat')}
          </Text>
          <TouchableOpacity
            style={[styles.servingsBtn, servings <= 1 && styles.servingsBtnDisabled]}
            onPress={() => onChangeServings(-1)}
            disabled={servings <= 1}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={16} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={styles.servingsValue}>{servings}</Text>
          <TouchableOpacity
            style={styles.servingsBtn}
            onPress={() => onChangeServings(1)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={16} color={colors.primaryText} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.stepButtons}>
        <TouchableOpacity
          style={[styles.stepButton, styles.stepButtonSecondary]}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.stepButtonSecondaryText}>{t('mealPicker.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.stepButton, styles.stepButtonPrimary]}
          onPress={onConfirm}
          activeOpacity={0.7}
        >
          <Text style={styles.stepButtonPrimaryText}>{confirmLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const makeStyles = (colors: Palette) => StyleSheet.create({
  recipeStep: {
    backgroundColor: colors.surface,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.borderStrong,
    gap: 10,
  },
  recipeSourceQuestion: { fontSize: 13, fontWeight: '700', color: colors.text },
  recipeSourceBar: { flexDirection: 'row', gap: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  filterChipTextActive: { color: colors.onPrimary, fontWeight: '700' },
  stepInputs: { flexDirection: 'row', gap: 8 },
  servingsStepper: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  servingsLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  servingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsBtnDisabled: { opacity: 0.4 },
  servingsValue: { minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text },
  stepButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  stepButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonSecondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepButtonSecondaryText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  stepButtonPrimary: { backgroundColor: colors.primary },
  stepButtonPrimaryText: { fontSize: 13, fontWeight: '700', color: colors.onPrimary },
});
