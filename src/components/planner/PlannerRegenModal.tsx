import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SegmentedControl } from '../ui/SegmentedControl';
import { space, text } from '../../theme/tokens';

export type PlannerRegenScope = 'day' | 'week';

export interface PlannerPlanModalProps {
  visible: boolean;
  selectedDateLabel?: string;
  plannedCountDay: number;
  plannedCountWeek: number;
  capacityDay: number;
  capacityWeek: number;
  onConfirm: (overwriteAll: boolean, scope: PlannerRegenScope) => void;
  onCancel: () => void;
}

/**
 * Single planning dialog for the selected day or the whole week.
 * Actions depend on how many meals are already planned for the chosen scope:
 * - none planned: plan from scratch
 * - some planned: complete the empty slots, or regenerate from scratch
 * - all planned: regenerate from scratch
 */
export const PlannerRegenModal: React.FC<PlannerPlanModalProps> = ({
  visible,
  selectedDateLabel,
  plannedCountDay,
  plannedCountWeek,
  capacityDay,
  capacityWeek,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [scope, setScope] = useState<PlannerRegenScope>('week');

  // The scope resets to 'week' every time the dialog opens
  const [prevVisible, setPrevVisible] = useState(visible);
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    if (visible) setScope('week');
  }

  // Derived from props and scope: switching scope updates counts and actions immediately.
  const planned = scope === 'day' ? plannedCountDay : plannedCountWeek;
  const capacity = scope === 'day' ? capacityDay : capacityWeek;
  const isEmpty = planned === 0;
  const isFull = planned >= capacity;

  const scopeOptions: { value: PlannerRegenScope; label: string }[] = [
    { value: 'day', label: t('planner.scope.day') },
    { value: 'week', label: t('planner.scope.week') },
  ];

  // Primary action and optional second one, depending on how much is already planned
  const confirmLabel = isEmpty
    ? t('planner.planModal.fromScratch')
    : isFull
      ? t('planner.planModal.regenerate')
      : t('planner.planModal.complete');
  const confirm = () => onConfirm(isEmpty ? false : isFull, scope);
  const extraAction = !isEmpty && !isFull
    ? { label: t('planner.planModal.regenerate'), onPress: () => onConfirm(true, scope), variant: 'secondary' as const }
    : undefined;

  return (
    <ConfirmDialog
      visible={visible}
      icon="restaurant-outline"
      title={t('planner.regenModal.title')}
      body={t('planner.regenModal.sub')}
      confirmLabel={confirmLabel}
      onConfirm={confirm}
      extraAction={extraAction}
      cancelLabel={t('common.cancel')}
      onCancel={onCancel}
    >
      <View style={styles.scopeContainer}>
        <Text style={styles.scopeLabel}>{t('planner.scope.label')}</Text>
        <SegmentedControl
          accessibilityLabel={t('planner.scope.label')}
          options={scopeOptions.map(option => ({ key: option.value, label: option.label }))}
          value={scope}
          onChange={key => setScope(key as typeof scope)}
        />
        {scope === 'day' && selectedDateLabel ? (
          <Text style={styles.scopeDateLabel}>{selectedDateLabel}</Text>
        ) : null}
        <Text style={styles.scopeDateLabel}>{t('planner.planModal.counts', { planned, capacity })}</Text>
      </View>
    </ConfirmDialog>
  );
};

const makeStyles = (colors: Palette) => StyleSheet.create({
  scopeContainer: {
    width: '100%',
    marginBottom: space.xxxl,
  },
  scopeLabel: {
    fontSize: text.caption,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.sm,
  },
  scopeDateLabel: {
    fontSize: text.caption,
    color: colors.textSecondary,
    marginTop: space.sm,
  },
});
