import React, { useMemo } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';

export interface ConfirmModalProps {
  visible: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  // Without cancel the modal is just a message with one button
  cancelLabel?: string;
  onCancel?: () => void;
  // Destructive action: red icon and button, like the planner's delete confirmation
  destructive?: boolean;
}

/**
 * Confirmation dialog in the style of PlannerDeleteModal: icon in a circle, title, text and full-width buttons.
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  icon,
  title,
  body,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  destructive = true,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tone = destructive ? colors.danger : colors.primaryText;
  const toneSoft = destructive ? colors.dangerSoft : colors.primarySoft;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel ?? onConfirm}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={[styles.iconWrap, { backgroundColor: toneSoft }]}>
            <Ionicons name={icon} size={36} color={tone} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: tone }]}
            onPress={onConfirm}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </TouchableOpacity>
          {cancelLabel && onCancel && (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  confirmBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
