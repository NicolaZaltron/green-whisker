import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon, radius, size as sizes, space, text } from '../../theme/tokens';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Shown when value is empty and no option matches */
  placeholder?: string;
  /** Mandatory label of the field */
  accessibilityLabel: string;
  /** Token size, same heights as AppTextField (M 40, L 52) */
  size?: 'M' | 'L';
  disabled?: boolean;
}

// Max height of the open list, then it scrolls
const LIST_MAX_HEIGHT = 240;

function createStyles(colors: Palette) {
  return StyleSheet.create({
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: space.xxxl,
    },
    fieldText: { flex: 1, fontSize: text.title, color: colors.text, marginRight: space.md },
    fieldPlaceholder: { color: colors.textMuted },
    disabled: { opacity: 0.5 },
    list: {
      maxHeight: LIST_MAX_HEIGHT,
      marginTop: space.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    option: {
      minHeight: sizes.touchMin,
      justifyContent: 'center',
      paddingHorizontal: space.xxl,
      paddingVertical: space.xl,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    optionActive: { backgroundColor: colors.primarySoft },
    optionText: { fontSize: text.body, color: colors.text },
    optionTextActive: { fontWeight: '700', color: colors.primaryText },
  });
}

// Dropdown: a field showing the selected value; the list opens below it and closes on selection or on a second tap
export function Select({
  value,
  options,
  onChange,
  placeholder,
  accessibilityLabel,
  size = 'M',
  disabled = false,
}: SelectProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const selected = options.find(opt => opt.value === value);
  // A saved value missing from the options is still shown as is
  const displayText = selected?.label ?? (value || placeholder || '');
  const showPlaceholder = !selected && !value;
  const isOpen = open && !disabled;

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.field, { height: sizes.field[size] }, disabled && styles.disabled]}
        onPress={() => setOpen(current => !current)}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: isOpen, disabled }}
      >
        <Text style={[styles.fieldText, showPlaceholder && styles.fieldPlaceholder]} numberOfLines={1}>
          {displayText}
        </Text>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={icon.xs} color={colors.textMuted} />
      </TouchableOpacity>
      {isOpen && (
        <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map(opt => {
            const active = opt.value === value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => handleSelect(opt.value)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
