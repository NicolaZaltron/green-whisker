import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { cardRadius, space } from '../theme/tokens';

// Card that rises from the bottom, with the same rounded corners and background as the advanced filters.
// A tap outside the card closes it; the space below is that of the system bar.
// With fullScreen it shows the same screen full screen, respecting the system areas.
export function SheetModal({
  visible,
  onClose,
  fullScreen = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  fullScreen?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (fullScreen) {
    return (
      // Translucent on Android: the background extends under the status bar and navigation bar, as on the home
      <Modal
        visible={visible}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={onClose}
      >
        <View style={[styles.fullScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.fullScreenContent}>{children}</View>
        </View>
      </Modal>
    );
  }
  // Bottom sheet: the window stops above the system bars (no translucent bars), so nothing needs an inset
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, styles.sheetAuto, width >= 768 && styles.sheetTablet]}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Same max width as the home (1200px), centered also on full-screen cards
  fullScreenContent: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: cardRadius,
    borderTopRightRadius: cardRadius,
    overflow: 'hidden',
    paddingBottom: space.xxxl,
  },
  sheetAuto: { maxHeight: '80%' },
  sheetTablet: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    borderRadius: cardRadius,
    // On wide screens the card is vertically centered, like the advanced filters on the home
    marginTop: 'auto',
    marginBottom: 'auto',
  },
});
