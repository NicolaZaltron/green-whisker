import React, { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { space, text } from '../../theme/tokens';

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Optional label shown next to the switch */
  label?: string;
  /** Accessibility name when the label is shown elsewhere (e.g. next to a description) */
  accessibilityLabel?: string;
  disabled?: boolean;
  testID?: string;
}

// Switch with an optional label on the left
export function Toggle({ value, onValueChange, label, accessibilityLabel, disabled = false, testID }: ToggleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const toggle = (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.borderStrong, true: colors.primary }}
      thumbColor={colors.onPrimary}
      ios_backgroundColor={colors.borderStrong}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      testID={testID}
    />
  );

  if (!label) return toggle;
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Text style={styles.label}>{label}</Text>
      {toggle}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.md,
    },
    label: { flex: 1, fontSize: text.body, color: colors.text },
    disabled: { opacity: 0.5 },
  });
