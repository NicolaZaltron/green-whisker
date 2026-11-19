import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { cardRadius, elevation, space, text } from '../../theme/tokens';

export interface ToastProps {
  message: string;
  position?: 'top' | 'bottom';
  testID?: string;
}

// Floating banner. The parent decides when to render it (and when to hide it)
export function Toast({ message, position = 'bottom', testID }: ToastProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const offset = (position === 'top' ? insets.top : insets.bottom) + space.huge;

  return (
    <View
      style={[styles.toast, position === 'top' ? { top: offset } : { bottom: offset }]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      left: space.huge,
      right: space.huge,
      zIndex: 100,
      borderRadius: cardRadius,
      paddingVertical: space.xxl,
      paddingHorizontal: space.huge,
      backgroundColor: colors.text,
      ...elevation(3, colors),
    },
    text: { color: colors.background, fontSize: text.body, fontWeight: '600', textAlign: 'center' },
  });
