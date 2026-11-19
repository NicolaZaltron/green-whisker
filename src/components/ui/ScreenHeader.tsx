import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon as iconSize, space, text } from '../../theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ScreenHeaderProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  // Buttons on the right, e.g. CircleButton
  actions?: React.ReactNode;
}

// Common header of the main screens: optional icon on the left, title and subtitle, actions on the right
export function ScreenHeader({ icon, title, subtitle, actions }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {icon ? <Ionicons name={icon} size={iconSize.xl} color={colors.primaryText} /> : null}
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Same minimum height on every screen: the actions stay centered in the same place
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
    paddingHorizontal: space.xxxl,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  textBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: text.page,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: text.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flexShrink: 0,
  },
});
