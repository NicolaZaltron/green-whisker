import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { cardRadius, elevation, space, type Elevation, type SpaceSize } from '../../theme/tokens';

export interface CardProps {
  /** Optional shadow level. Without it the card is flat with a border. */
  elevation?: Elevation;
  /** Inner padding, from the space scale */
  padding?: SpaceSize;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// Surface container for grouped content (cards, panels)
export function Card({ elevation: level, padding = 'xxxl', children, style, testID }: CardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View
      style={[styles.card, { padding: space[padding] }, level && elevation(level, colors), style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: cardRadius,
    },
  });
