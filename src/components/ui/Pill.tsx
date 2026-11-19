import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon as iconSize, radius, size as sizes, space, text } from '../../theme/tokens';

export interface PillProps {
  label: string;
  size?: 'S' | 'M';
  variant?: 'neutral' | 'primary' | 'accent';
  /** Optional leading icon */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** With onPress the pill becomes a button (chip) */
  onPress?: () => void;
  /** Selected state of a pressable pill (chip) */
  selected?: boolean;
  /** Stretch to share the row width (flex: 1) */
  fill?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

// Small rounded tag (chip, badge). Pressable when onPress is set.
export function Pill({
  label,
  size = 'S',
  variant = 'neutral',
  icon,
  onPress,
  selected = false,
  fill = false,
  disabled = false,
  accessibilityLabel,
  testID,
}: PillProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const textColor = selected
    ? colors.onPrimary
    : { neutral: colors.textSecondary, primary: colors.primaryText, accent: colors.accent }[variant];
  const style = [
    styles.base,
    { height: sizes.pill[size] },
    styles[variant],
    onPress && !selected && styles.chip,
    selected && styles.selected,
    fill && styles.fill,
    disabled && styles.disabled,
  ];
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={size === 'M' ? iconSize.sm : iconSize.xs} color={textColor} /> : null}
      <Text style={[styles.text, size === 'M' && styles.textM, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={style} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      style={style}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      hitSlop={size === 'S' ? { top: 10, bottom: 10 } : undefined}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

// Same component, name used for counters and statuses
export const Badge = Pill;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      borderRadius: radius.full,
      paddingHorizontal: space.lg,
      alignSelf: 'flex-start',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: space.xs,
    },
    text: { fontSize: text.label, fontWeight: '700' },
    textM: { fontSize: text.caption },
    neutral: { backgroundColor: colors.surfaceAlt },
    primary: { backgroundColor: colors.primarySoft },
    accent: { backgroundColor: colors.accentSoft },
    chip: { borderWidth: 1, borderColor: colors.border },
    selected: { backgroundColor: colors.primary },
    fill: { flex: 1, alignSelf: 'stretch' },
    disabled: { opacity: 0.5 },
  });
