import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { text } from '../../theme/tokens';

export interface SectionLabelProps {
  text: string;
  testID?: string;
}

// Small uppercase eyebrow label above a group of content
export function SectionLabel({ text: label, testID }: SectionLabelProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Text style={styles.label} testID={testID}>
      {label}
    </Text>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    label: {
      fontSize: text.label,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
  });
