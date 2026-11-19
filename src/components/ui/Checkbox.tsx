import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { space } from '../../theme/tokens';

export interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}

const BOX = 24;

// Single-size checkbox
export function Checkbox({ checked, onToggle, accessibilityLabel, disabled = false, testID }: CheckboxProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const slop = (44 - BOX) / 2;

  return (
    <TouchableOpacity
      style={[styles.box, checked && styles.boxChecked, disabled && styles.disabled]}
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      testID={testID}
    >
      {checked ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    box: {
      width: BOX,
      height: BOX,
      borderRadius: space.md,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    disabled: { opacity: 0.5 },
  });
