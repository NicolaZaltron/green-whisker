import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon, radius, size as sizes, space, text } from '../../theme/tokens';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type CircleSize = keyof typeof sizes.circle;

export interface CircleButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  size?: CircleSize;
  /** Optional short text under the icon (L and XL sizes) */
  label?: string;
  /**
   * filled: solid primary, outline: border only, neutral: soft surface,
   * plain: icon only (no background, border or shadow), same look as the ingredients close X
   */
  variant?: 'filled' | 'outline' | 'neutral' | 'plain';
  disabled?: boolean;
  testID?: string;
}

// L keeps the 24pt icon of M (46% of 52pt); XL keeps the former L icon (36)
const ICON_SIZE: Record<CircleSize, number> = { S: icon.md, M: icon.xl, L: icon.xl, XL: 36 };
const LABELED_ICON_SIZE = icon.xl;
// Plain: icon.xl with space.xs padding around it (same footprint as the ingredients close X)
const PLAIN_ICON_SIZE = icon.xl;
const PLAIN_PADDING = space.xs;
const PLAIN_FOOTPRINT = PLAIN_ICON_SIZE + PLAIN_PADDING * 2;

// Round icon button: only the three sizes of the theme, touch area of at least size.touchMin via hitSlop
export function CircleButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
  size = 'M',
  variant = 'neutral',
  disabled = false,
  testID,
}: CircleButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPlain = variant === 'plain';
  const footprint = isPlain ? PLAIN_FOOTPRINT : sizes.circle[size];
  const slop = Math.max(0, Math.ceil((sizes.touchMin - footprint) / 2));
  const iconSize = label ? LABELED_ICON_SIZE : isPlain ? PLAIN_ICON_SIZE : ICON_SIZE[size];
  const iconColor =
    variant === 'filled'
      ? colors.onPrimary
      : variant === 'outline' || isPlain
        ? colors.primaryText
        : colors.text;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        isPlain ? undefined : { width: footprint, height: footprint },
        styles[variant],
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <Ionicons name={icon} size={iconSize} color={iconColor} />
      {label ? <Text style={[styles.label, { color: iconColor }]} numberOfLines={1}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filled: { backgroundColor: colors.primary },
    outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
    neutral: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
    plain: { padding: PLAIN_PADDING },
    disabled: { opacity: 0.5 },
    label: { fontSize: text.label, fontWeight: '700', marginTop: space.xs / 2 },
  });
