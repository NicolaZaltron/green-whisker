import React, { forwardRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { AppTextField, AppTextFieldHandle } from './AppTextField';

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  size?: 'M' | 'L';
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

// Search field: AppTextField with a magnifier icon; the clear button comes from AppTextField
export const SearchBar = forwardRef<AppTextFieldHandle, SearchBarProps>(function SearchBar(
  { size = 'M', ...rest },
  ref,
) {
  const { colors } = useTheme();
  return (
    <AppTextField
      ref={ref}
      {...rest}
      size={size}
      variant="search"
      returnKeyType="search"
      autoCorrect={false}
      leftIcon={<Ionicons name="search" size={18} color={colors.textMuted} />}
    />
  );
});
