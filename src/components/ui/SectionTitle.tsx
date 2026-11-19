import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { space, text } from '../../theme/tokens';

export interface SectionTitleProps {
  title: string;
  subtitle?: string;
}

// Section heading with optional supporting line
export function SectionTitle({ title, subtitle }: SectionTitleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.block}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    block: { gap: space.xs, marginBottom: space.md },
    title: { fontSize: text.title, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: text.caption, color: colors.textMuted },
  });
