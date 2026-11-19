import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import type { RecipeSource } from '../../types/recipe';
import { Button } from '../ui/Button';
import { CircleButton } from '../ui/CircleButton';
import { radius, space, text } from '../../theme/tokens';
import { SegmentedControl } from '../ui/SegmentedControl';

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
      <SegmentedControl
        accessibilityLabel={t('mealPicker.recipeSourceQuestion')}
        options={RECIPE_SOURCES.map(option => ({ key: option, label: t(`mealPicker.recipeSource.${option}`) }))}
        value={source}
        onChange={key => onChangeSource(key as typeof source)}
      />
      <View style={styles.stepInputs}>
        <View style={styles.servingsStepper}>
          <Text style={styles.servingsLabel}>
            {t(source === 'prepare' ? 'mealPicker.servingsToPrepare' : 'mealPicker.servingsToEat')}
          </Text>
          <CircleButton
            icon="remove"
            size="S"
            variant="outline"
            onPress={() => onChangeServings(-1)}
            disabled={servings <= 1}
            accessibilityLabel={t('common.decrease')}
          />
          <Text style={styles.servingsValue}>{servings}</Text>
          <CircleButton
            icon="add"
            size="S"
            variant="outline"
            onPress={() => onChangeServings(1)}
            accessibilityLabel={t('common.increase')}
          />
        </View>
      </View>
      <View style={styles.stepButtons}>
        <Button size="M" variant="secondary" label={t('mealPicker.cancel')} onPress={onCancel} />
        <Button size="M" variant="primary" label={confirmLabel} onPress={onConfirm} />
      </View>
    </View>
  );
});

const makeStyles = (colors: Palette) => StyleSheet.create({
  recipeStep: {
    backgroundColor: colors.surface,
    marginBottom: space.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.borderStrong,
    gap: space.lg,
  },
  recipeSourceQuestion: { fontSize: text.caption, fontWeight: '700', color: colors.text },
  stepInputs: { flexDirection: 'row', gap: space.md },
  servingsStepper: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.lg },
  servingsLabel: { flex: 1, fontSize: text.body, fontWeight: '600', color: colors.text },
  servingsValue: { minWidth: 28, textAlign: 'center', fontSize: text.title, fontWeight: '700', color: colors.text },
  stepButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md },
});
