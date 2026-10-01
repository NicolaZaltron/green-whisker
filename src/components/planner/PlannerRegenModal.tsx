import React from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export interface PlannerRegenModalProps {
  visible: boolean;
  onConfirm: (overwriteAll: boolean) => void;
  onCancel: () => void;
}

/**
 * Dialog prompting user to either fill empty slots or regenerate the full meal plan.
 */
export const PlannerRegenModal: React.FC<PlannerRegenModalProps> = ({
  visible,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmBox}>
          <View style={styles.confirmIconWrap}>
            <Ionicons name="refresh-circle" size={36} color="#4A6B53" />
          </View>
          <Text style={styles.confirmTitle}>{t('planner.regenModal.title')}</Text>
          <Text style={styles.confirmSub}>
            {t('planner.regenModal.sub')}
          </Text>
          <TouchableOpacity
            style={styles.confirmBtnPrimary}
            onPress={() => onConfirm(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnPrimaryText}>{t('planner.regenModal.completeEmpty')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmBtnSecondary}
            onPress={() => onConfirm(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnSecondaryText}>{t('planner.regenModal.restartFresh')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmBtnCancel}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.confirmBtnCancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmBox: {
    backgroundColor: '#FBF9F5',
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
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#243328',
    marginBottom: 8,
  },
  confirmSub: {
    fontSize: 13,
    color: '#718073',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  confirmBtnPrimary: {
    width: '100%',
    backgroundColor: '#4A6B53',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnPrimaryText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtnSecondary: {
    width: '100%',
    backgroundColor: '#EAF0EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnSecondaryText: {
    color: '#4A6B53',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtnCancel: {
    paddingVertical: 8,
  },
  confirmBtnCancelText: {
    color: '#7E8B80',
    fontSize: 13,
  },
});
