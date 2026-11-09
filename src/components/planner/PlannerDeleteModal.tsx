import React, { useMemo } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';

export interface PlannerDeleteModalProps {
  visible: boolean;
  onDeleteDay: () => void;
  onDeleteWeek: () => void;
  onExit: () => void;
}

/**
 * Dialog asking the user whether to delete the day plan or the whole week plan.
 */
export const PlannerDeleteModal: React.FC<PlannerDeleteModalProps> = ({
  visible,
  onDeleteDay,
  onDeleteWeek,
  onExit,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onExit}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmBox}>
          <View style={styles.confirmIconWrap}>
            <Ionicons name="trash-outline" size={36} color={colors.danger} />
          </View>
          <Text style={styles.confirmTitle}>{t('planner.deleteModal.title')}</Text>
          <Text style={styles.confirmSub}>{t('planner.deleteModal.sub')}</Text>
          <TouchableOpacity
            style={styles.confirmBtnDestructive}
            onPress={onDeleteDay}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnDestructiveText}>{t('planner.deleteModal.day')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmBtnDestructive}
            onPress={onDeleteWeek}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnDestructiveText}>{t('planner.deleteModal.week')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmBtnCancel} onPress={onExit} activeOpacity={0.7}>
            <Text style={styles.confirmBtnCancelText}>{t('planner.deleteModal.exit')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
    backgroundColor: colors.dangerSoft,
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
  confirmBtnDestructive: {
    width: '100%',
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnDestructiveText: {
    color: colors.onPrimary,
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
});
