import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon as iconToken, radius, size as sizes, text as textToken } from '../../theme/tokens';
import type { IconName } from './CircleButton';

export interface IconBadgeProps {
  /** Ionicons icon, or text (e.g. a step number) if icon is missing. */
  icon?: IconName;
  text?: string;
  size?: 'S' | 'M' | 'XL';
  /** danger: red icon on a soft red background. */
  tone?: 'primary' | 'danger';
  testID?: string;
}

const ICON_SIZE = { S: iconToken.sm, M: iconToken.lg, XL: iconToken.xl };

// Non-interactive circle with an icon or a short text; same sizes as CircleButton S and M
export function IconBadge({ icon, text, size = 'M', tone = 'primary', testID }: IconBadgeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dim = sizes.circle[size];

  return (
    <View style={[styles.circle, { width: dim, height: dim }, tone === 'danger' && styles.circleDanger]} testID={testID} accessible={false}>
      {icon ? (
        <Ionicons name={icon} size={ICON_SIZE[size]} color={tone === 'danger' ? colors.danger : colors.primaryText} />
      ) : (
        <Text style={styles.text}>{text}</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    circle: {
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    circleDanger: { backgroundColor: colors.dangerSoft },
    text: { fontSize: textToken.body, fontWeight: '700', color: colors.primaryText },
  });
