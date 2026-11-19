import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { radius } from '../../theme/tokens';

export interface ProgressBarProps {
  /** From 0 to 1; out-of-range values are clamped. */
  value: number;
  testID?: string;
}

const HEIGHT = 8;

export function ProgressBar({ value, testID }: ProgressBarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      testID={testID}
    >
      <View style={[styles.fill, { width: `${v * 100}%` }]} />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    track: {
      height: HEIGHT,
      borderRadius: radius.full,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.primary },
  });
