import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { space, type SpaceSize } from '../../theme/tokens';

export interface DividerProps {
  /** Vertical margin, from the space scale. Default 0 */
  marginVertical?: SpaceSize;
}

// Horizontal hairline divider
export function Divider({ marginVertical }: DividerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return <View style={[styles.line, { marginVertical: marginVertical ? space[marginVertical] : 0 }]} />;
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    line: {
      height: 1,
      backgroundColor: colors.border,
    },
  });
