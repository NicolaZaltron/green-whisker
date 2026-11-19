import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon as iconSize, radius, size as sizes, space, text } from '../../theme/tokens';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  size?: 'M' | 'L' | 'XL';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  /** Optional Ionicons icon before the label. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel?: string;
  testID?: string;
}

// Text button. Height comes from size.field (M 40, L and XL 52), the same scale as the text fields.
// XL is the wide action button: same height as L, minimum width from size.buttonMinWidth.
export function Button({
  label,
  onPress,
  size = 'M',
  variant = 'primary',
  disabled = false,
  icon,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isLarge = size !== 'M';
  const minWidth = size === 'M' ? undefined : sizes.buttonMinWidth[size];
  const textColor = {
    primary: colors.onPrimary,
    secondary: colors.primaryText,
    danger: colors.onPrimary,
    ghost: colors.textSecondary,
  }[variant];

  return (
    <TouchableOpacity
      style={[styles.base, { minHeight: isLarge ? sizes.field.L : sizes.field.M, minWidth }, styles[variant], disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <View style={styles.row}>
        {icon ? <Ionicons name={icon} size={isLarge ? iconSize.lg : iconSize.md} color={textColor} /> : null}
        <Text style={[styles.text, isLarge && styles.textL, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      borderRadius: radius.full,
      paddingHorizontal: space.huge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    text: { fontSize: text.body, fontWeight: '700' },
    textL: { fontSize: text.title },
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.primarySoft },
    danger: { backgroundColor: colors.danger },
    ghost: { backgroundColor: 'transparent' },
    disabled: { opacity: 0.5 },
  });
