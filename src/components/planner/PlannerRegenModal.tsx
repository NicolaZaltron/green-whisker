import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Rendered inside Modal: RN unmounts Modal children when hidden, so the scope resets to 'week' on every open. */}
      <PlanDialogBody
        selectedDateLabel={selectedDateLabel}
        plannedCountDay={plannedCountDay}
        plannedCountWeek={plannedCountWeek}
        capacityDay={capacityDay}
        capacityWeek={capacityWeek}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Modal>
  );
};

type PlanDialogBodyProps = Omit<PlannerPlanModalProps, 'visible'>;

const PlanDialogBody: React.FC<PlanDialogBodyProps> = ({
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

  // Derived from props and scope: switching scope updates counts and actions immediately.
  const planned = scope === 'day' ? plannedCountDay : plannedCountWeek;
  const capacity = scope === 'day' ? capacityDay : capacityWeek;
  const isEmpty = planned === 0;
  const isFull = planned >= capacity;

  const scopeOptions: { value: PlannerRegenScope; label: string }[] = [
    { value: 'day', label: t('planner.scope.day') },
    { value: 'week', label: t('planner.scope.week') },
  ];

  return (
    <View style={styles.confirmOverlay}>
      <View style={styles.confirmBox}>
        <View style={styles.confirmIconWrap}>
          <MaterialCommunityIcons name="chef-hat" size={36} color={colors.primaryText} />
        </View>
        <Text style={styles.confirmTitle}>{t('planner.regenModal.title')}</Text>
        <Text style={styles.confirmSub}>
          {t('planner.regenModal.sub')}
        </Text>
        <View style={styles.scopeContainer}>
          <Text style={styles.scopeLabel}>{t('planner.scope.label')}</Text>
          <View style={styles.scopeRow}>
            {scopeOptions.map((option) => {
              const selected = scope === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.scopePill, selected && styles.scopePillSelected]}
                  onPress={() => setScope(option.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.scopePillText, selected && styles.scopePillTextSelected]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {scope === 'day' && selectedDateLabel ? (
            <Text style={styles.scopeDateLabel}>{selectedDateLabel}</Text>
          ) : null}
          <Text style={styles.scopeDateLabel}>{t('planner.planModal.counts', { planned, capacity })}</Text>
        </View>
        {isEmpty ? (
          <TouchableOpacity
            style={styles.confirmBtnPrimary}
            onPress={() => onConfirm(false, scope)}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnPrimaryText}>{t('planner.planModal.fromScratch')}</Text>
          </TouchableOpacity>
        ) : isFull ? (
          <TouchableOpacity
            style={styles.confirmBtnPrimary}
            onPress={() => onConfirm(true, scope)}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnPrimaryText}>{t('planner.planModal.regenerate')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.confirmBtnPrimary}
              onPress={() => onConfirm(false, scope)}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnPrimaryText}>{t('planner.planModal.complete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtnSecondary}
              onPress={() => onConfirm(true, scope)}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnSecondaryText}>{t('planner.planModal.regenerate')}</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={styles.confirmBtnCancel}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.confirmBtnCancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (colors: Palette) => StyleSheet.create({
  confirmOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmBox: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  confirmSub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  confirmBtnPrimary: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnPrimaryText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtnSecondary: {
    width: '100%',
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnSecondaryText: {
    color: colors.primaryText,
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtnCancel: {
    paddingVertical: 8,
  },
  confirmBtnCancelText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  scopeContainer: {
    width: '100%',
    marginBottom: 16,
  },
  scopeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scopePill: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  scopePillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scopePillText: {
    color: colors.primaryText,
    fontWeight: '600',
    fontSize: 13,
  },
  scopePillTextSelected: {
    color: colors.onPrimary,
  },
  scopeDateLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
  },
});
