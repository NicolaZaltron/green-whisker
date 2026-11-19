import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { space, text } from '../../theme/tokens';
import { Button, type ButtonProps } from './Button';
import { IconBadge } from './IconBadge';
import type { IconName } from './CircleButton';

export type EmptyStateAction = Pick<ButtonProps, 'label' | 'onPress' | 'icon' | 'variant' | 'size'>;

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Optional actions rendered as Buttons, stacked in a column. */
  actions?: EmptyStateAction[];
  /** Single action, kept for compatibility: same as actions with one XL button. */
  action?: { label: string; onPress: () => void };
}

// Empty list placeholder: icon in a circle, title, optional subtitle and actions
export function EmptyState({ icon, title, subtitle, actions, action }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const items: EmptyStateAction[] = actions ?? (action ? [{ ...action, size: 'XL' }] : []);

  return (
    <View style={styles.container}>
      <IconBadge icon={icon} size="XL" />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {items.length > 0 ? (
        <View style={styles.actions}>
          {items.map(item => (
            <Button
              key={item.label}
              label={item.label}
              onPress={item.onPress}
              icon={item.icon}
              variant={item.variant}
              size={item.size ?? 'M'}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xl,
      padding: space.huge * 2,
    },
    title: { fontSize: text.title, fontWeight: '700', color: colors.text, textAlign: 'center' },
    subtitle: { fontSize: text.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
    actions: { alignSelf: 'stretch', alignItems: 'center', gap: space.md },
  });
