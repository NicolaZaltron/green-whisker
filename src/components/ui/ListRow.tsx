import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { cardRadius, space, text } from '../../theme/tokens';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Optional content on the right (icon, switch, badge) */
  trailing?: React.ReactNode;
  /** With onPress the row becomes a button */
  onPress?: () => void;
  /** card: surface with border and radius. divider: only a bottom border */
  variant?: 'card' | 'divider';
  accessibilityLabel?: string;
  testID?: string;
}

// List row with title, optional subtitle and trailing content
export function ListRow({
  title,
  subtitle,
  trailing,
  onPress,
  variant = 'card',
  accessibilityLabel,
  testID,
}: ListRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const style = [styles.base, styles[variant]];
  const content = (
    <>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={style} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [style, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxxl,
      paddingVertical: space.xl,
      paddingHorizontal: space.xxxl,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: cardRadius,
    },
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pressed: { opacity: 0.7 },
    texts: { flex: 1, gap: space.xs },
    title: { fontSize: text.title, fontWeight: '600', color: colors.text },
    subtitle: { fontSize: text.caption, color: colors.textSecondary },
    trailing: { flexShrink: 0 },
  });
