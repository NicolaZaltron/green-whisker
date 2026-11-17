import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ScreenHeaderProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  // Buttons on the right, rendered with HeaderIconButton
  actions?: React.ReactNode;
}

// Common header of the main screens: icon on the left, title and subtitle, actions on the right
export function ScreenHeader({ icon, title, subtitle, actions }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={28} color={colors.primaryText} />
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

interface HeaderIconButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
}

// Round header button: same size and style for all screens
export function HeaderIconButton({ icon, onPress, accessibilityLabel }: HeaderIconButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  textBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    // Light shadow: the button reads as a button even without a border
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
