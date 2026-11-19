import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon, size as sizes, space, text } from '../../theme/tokens';

export interface TextButtonProps {
  label: string;
  onPress: () => void;
  /** Optional Ionicons icon before the label */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

// Text-only button. The hit area is at least size.touchMin high.
export function TextButton({ label, onPress, icon: iconName, disabled = false, accessibilityLabel, testID }: TextButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      style={[styles.base, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: space.md, bottom: space.md, left: space.md, right: space.md }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <View style={styles.row}>
        {iconName ? <Ionicons name={iconName} size={icon.sm} color={colors.primaryText} /> : null}
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      minHeight: sizes.touchMin,
      justifyContent: 'center',
      paddingHorizontal: space.md,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    text: { fontSize: text.caption, fontWeight: '700', color: colors.primaryText },
    disabled: { opacity: 0.5 },
  });
