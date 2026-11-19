import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { space, text } from '../../theme/tokens';
import { Button } from './Button';
import { CenterDialog } from './CenterDialog';
import type { IconName } from './CircleButton';
import { IconBadge } from './IconBadge';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** Without cancelLabel the dialog is a message with one button. */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** destructive: red confirm button and icon. */
  variant?: 'normal' | 'destructive';
  /** Optional Ionicons icon in a circle above the title. */
  icon?: IconName;
  /** Optional content between the text and the actions. */
  children?: React.ReactNode;
  /** Optional second action under the confirm one (same variant unless set). */
  extraAction?: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' };
}

// Confirmation: title, text, actions. Built on CenterDialog (tap outside or back cancels)
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'normal',
  icon,
  children,
  extraAction,
}: ConfirmDialogProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const destructive = variant === 'destructive';
  const confirmVariant = destructive ? 'danger' : 'primary';

  return (
    <CenterDialog visible={visible} onClose={onCancel}>
      <View style={styles.content}>
        {icon ? (
          <View style={styles.icon}>
            <IconBadge icon={icon} tone={destructive ? 'danger' : 'primary'} />
          </View>
        ) : null}
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {children}
        <View style={styles.actions}>
          <Button label={confirmLabel} onPress={onConfirm} size="L" variant={confirmVariant} />
          {extraAction ? (
            <Button
              label={extraAction.label}
              onPress={extraAction.onPress}
              size="L"
              variant={extraAction.variant ?? confirmVariant}
            />
          ) : null}
          {cancelLabel ? <Button label={cancelLabel} onPress={onCancel} size="M" variant="ghost" /> : null}
        </View>
      </View>
    </CenterDialog>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    content: { padding: space.huge + space.xs, gap: space.lg },
    icon: { alignItems: 'center' },
    title: { fontSize: text.page, fontWeight: '700', color: colors.text, textAlign: 'center' },
    body: { fontSize: text.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    actions: { gap: space.md, marginTop: space.md },
  });
