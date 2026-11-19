import React from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export interface SpinnerProps {
  size?: 'small' | 'large';
  /** Use onPrimary on solid primary backgrounds. */
  tone?: 'primary' | 'onPrimary' | 'muted';
}

// ActivityIndicator with the theme color
export function Spinner({ size = 'small', tone = 'primary' }: SpinnerProps) {
  const { colors } = useTheme();
  const color = { primary: colors.primary, onPrimary: colors.onPrimary, muted: colors.textMuted }[tone];
  return <ActivityIndicator size={size} color={color} />;
}
