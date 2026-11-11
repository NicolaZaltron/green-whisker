import React, { forwardRef, useMemo } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';

export interface AppTextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  autoFocus?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  onFocus?: TextInputProps['onFocus'];
  onBlur?: TextInputProps['onBlur'];
  multiline?: boolean;
  numberOfLines?: number;
  secureTextEntry?: boolean;
  editable?: boolean;
  /** Optional icon rendered before the input (e.g. a search icon). */
  leftIcon?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  /** Container override, for layout only (flex, width, margins). */
  style?: StyleProp<ViewStyle>;
}

const FIELD_HEIGHT = 44;

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      height: FIELD_HEIGHT,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 12,
    },
    containerMultiline: {
      height: undefined,
      minHeight: FIELD_HEIGHT,
      alignItems: 'flex-start',
      paddingVertical: 10,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontWeight: '400',
      color: colors.text,
      paddingVertical: 0,
    },
    inputMultiline: {
      alignSelf: 'stretch',
      minHeight: 22,
      textAlignVertical: 'top',
    },
    leftIcon: {
      marginRight: 8,
    },
    clearButton: {
      marginLeft: 8,
    },
  });
}

export type AppTextFieldHandle = React.ComponentRef<typeof TextInput>;

export const AppTextField = forwardRef<AppTextFieldHandle, AppTextFieldProps>(function AppTextField(
  {
    value,
    onChangeText,
    placeholder,
    keyboardType,
    autoCapitalize,
    autoCorrect,
    autoFocus,
    returnKeyType,
    onSubmitEditing,
    onFocus,
    onBlur,
    multiline,
    numberOfLines,
    secureTextEntry,
    editable = true,
    leftIcon,
    accessibilityLabel,
    testID,
    style,
  },
  ref,
) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const showClear = editable && value.length > 0;

  return (
    <View style={[styles.container, multiline && styles.containerMultiline, style]}>
      {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
      <TextInput
        ref={ref}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={onFocus}
        onBlur={onBlur}
        multiline={multiline}
        numberOfLines={numberOfLines}
        secureTextEntry={secureTextEntry}
        editable={editable}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        clearButtonMode="never"
      />
      {showClear ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.clear')}
          style={styles.clearButton}
        >
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});
