import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useUiPreferences } from '../../context/UiPreferencesContext';
import type { Palette } from '../../theme/palette';
import { icon, radius, size as sizes, space, text } from '../../theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface SegmentedOption {
  key: string;
  label: string;
  icon?: IconName;
  /** Option not available yet (e.g. to generate): unselected it gets a dashed border */
  dashed?: boolean;
}

interface BaseProps {
  options: SegmentedOption[];
  /** Mandatory label of the whole group */
  accessibilityLabel: string;
  size?: 'M' | 'L' | 'XL';
  disabled?: boolean;
  /** Key of an option to keep fixed on the left, outside the scrolling capsule (e.g. a reset "all" option) */
  pinnedKey?: string;
  testID?: string;
}
interface SingleProps extends BaseProps {
  multiple?: false;
  value: string;
  onChange: (key: string) => void;
}
interface MultipleProps extends BaseProps {
  multiple: true;
  values: string[];
  onChange: (keys: string[]) => void;
}
export type SegmentedControlProps = SingleProps | MultipleProps;

// Capsule with a capsule indicator on the active option(s). Scrolls horizontally when options do not fit.
export function SegmentedControl(props: SegmentedControlProps) {
  const { options, accessibilityLabel, testID, disabled = false, size = 'M', pinnedKey } = props;
  const { colors } = useTheme();
  const { segmentedBackground: withBackground } = useUiPreferences();
  const styles = useMemo(() => makeStyles(colors, size, withBackground), [colors, size, withBackground]);
  const isSelected = (key: string) => (props.multiple ? props.values.includes(key) : props.value === key);
  const toggle = (key: string) => {
    if (!props.multiple) return props.onChange(key);
    props.onChange(props.values.includes(key) ? props.values.filter(k => k !== key) : [...props.values, key]);
  };

  const renderOption = (opt: SegmentedOption, pinned = false) => {
    const selected = isSelected(opt.key);
    const color = selected ? colors.onPrimary : colors.textSecondary;
    return (
      <Pressable
        key={opt.key}
        style={[styles.option, pinned && styles.pinnedOption, opt.dashed && !selected && styles.optionDashed, selected && styles.optionActive]}
        onPress={() => toggle(opt.key)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
      >
        {opt.icon ? <Ionicons name={opt.icon} size={icon.sm} color={color} /> : null}
        <Text style={[styles.text, selected && styles.textActive, { color }]} numberOfLines={1}>
          {opt.label}
        </Text>
      </Pressable>
    );
  };

  const pinned = options.find(opt => opt.key === pinnedKey);
  const scrolled = pinned ? options.filter(opt => opt !== pinned) : options;
  const capsule = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.capsule, styles.capsuleFull, disabled && styles.disabled]}
      contentContainerStyle={styles.content}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {scrolled.map(opt => renderOption(opt))}
    </ScrollView>
  );

  // The pinned option stays visible on the left, next to the scrolling capsule
  if (!pinned) return capsule;
  return (
    <View style={styles.row}>
      {renderOption(pinned, true)}
      <View style={styles.capsuleBeside}>{capsule}</View>
    </View>
  );
}

// Container height (size.segmented) = indicator + 2 * space.xs; M (40) matches the text fields
const makeStyles = (colors: Palette, size: 'M' | 'L' | 'XL', withBackground: boolean) =>
  StyleSheet.create({
    row: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    capsule: {
      flexGrow: 0,
      backgroundColor: colors.controlTrack,
      borderRadius: radius.full,
    },
    capsuleFull: { width: '100%' },
    // Takes the space left by the pinned option; the capsule inside it fills this box
    capsuleBeside: { flex: 1, minWidth: 0 },
    content: {
      flexGrow: 1,
      padding: space.xs,
      gap: space.xs,
    },
    option: {
      flexGrow: 1,
      height: sizes.segmented[size] - 2 * space.xs,
      paddingHorizontal: space.xxxl,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      borderRadius: radius.full,
      // Unselected options get a surface background and a thin border, so each one reads as a button.
      // Without background they are transparent and the border stays transparent to keep the same size
      backgroundColor: withBackground ? colors.surface : 'transparent',
      borderWidth: 1,
      borderColor: withBackground ? colors.border : 'transparent',
    },
    // Pinned option: sized by its label, not stretched to fill the row
    pinnedOption: { flexGrow: 0 },
    disabled: { opacity: 0.5 },
    // Not yet available option: dashed border, no surface background
    optionDashed: { borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'transparent' },
    optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    text: { fontSize: text.caption, fontWeight: '600' },
    textActive: { fontWeight: '700' },
  });
