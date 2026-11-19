import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { size as sizes, space, text } from '../../theme/tokens';
import { CircleButton } from './CircleButton';

export interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeLabel: string;
  /** Maximum lines of the title: the header grows vertically up to this many lines (default 1) */
  titleMaxLines?: number;
}

// Header of modals: title and optional subtitle, close button on the right
export function ModalHeader({ title, subtitle, onClose, closeLabel, titleMaxLines = 1 }: ModalHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={titleMaxLines} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <CircleButton icon="close" variant="plain" onPress={onClose} accessibilityLabel={closeLabel} />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      // Close button stays on the first title line when the title wraps
      alignItems: 'flex-start',
      gap: space.xl,
      paddingHorizontal: space.xxxl,
      paddingVertical: space.xl,
    },
    textBlock: { flex: 1 },
    // Line as tall as the close button: a single line stays centred with it, wrapped lines keep the same spacing
    title: { fontSize: text.page, fontWeight: '700', color: colors.text, lineHeight: sizes.circle.S },
    subtitle: { fontSize: text.caption, color: colors.textMuted, marginTop: 2 },
  });
