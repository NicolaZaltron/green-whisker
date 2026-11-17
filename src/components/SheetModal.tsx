import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';

// Card that rises from the bottom, with the same rounded corners and background as the advanced filters.
// A tap outside the card closes it; the space below is that of the system bar.
// With fullScreen it shows the same screen full screen, respecting the system areas.
export function SheetModal({
  visible,
  onClose,
  fullScreen = false,
  autoHeight = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  fullScreen?: boolean;
  // Height based on content (up to 80%) instead of a fixed 90%
  autoHeight?: boolean;
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, autoHeight ? styles.sheetAuto : styles.sheetFixed, { paddingBottom: Math.max(insets.bottom, 8) }, width >= 768 && styles.sheetTablet]}>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 12,
  },
  sheetFixed: { height: '90%' },
  sheetAuto: { maxHeight: '80%' },
  sheetTablet: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 24,
    // On wide screens the card is vertically centered, like the advanced filters on the home
    marginTop: 'auto',
    marginBottom: 'auto',
  },
});
