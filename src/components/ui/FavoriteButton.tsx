import React, { useMemo } from 'react';
import { GestureResponderEvent, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon, radius, elevation } from '../../theme/tokens';

export interface FavoriteButtonProps {
  isFavorite: boolean;
  onPress: (e: GestureResponderEvent) => void;
  accessibilityLabel: string;
}

// Round heart button shared by recipe cards and the recipe modal; position is up to the caller
export function FavoriteButton({ isFavorite, onPress, accessibilityLabel }: FavoriteButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons
        name={isFavorite ? 'heart' : 'heart-outline'}
        size={icon.md}
        color={isFavorite ? colors.danger : colors.primaryText}
      />
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    button: {
      backgroundColor: colors.surface,
      width: 34,
      height: 34,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      ...elevation(2, colors),
    },
  });
