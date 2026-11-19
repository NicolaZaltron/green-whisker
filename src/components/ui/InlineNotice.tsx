import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon, radius, space, text } from '../../theme/tokens';

export interface InlineNoticeProps {
  tone: 'danger' | 'caution';
  text: string;
  /** Optional leading Ionicons icon */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  testID?: string;
}

// Banner shown inside forms to report an error or a warning
export function InlineNotice({ tone, text: message, icon: iconName, testID }: InlineNoticeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const color = tone === 'danger' ? colors.danger : colors.cautionText;

  return (
    <View
      style={[styles.base, tone === 'danger' ? styles.danger : styles.caution]}
      accessibilityRole="alert"
      testID={testID}
    >
      {iconName ? <Ionicons name={iconName} size={icon.sm} color={color} /> : null}
      <Text style={[styles.text, { color }]}>{message}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      borderRadius: radius.md,
      padding: space.huge,
    },
    danger: { backgroundColor: colors.dangerSoft },
    caution: { backgroundColor: colors.cautionSoft },
    text: { flex: 1, fontSize: text.caption, fontWeight: '600' },
  });
