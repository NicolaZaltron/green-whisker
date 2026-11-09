import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';

// Scheda che sale dal basso, con gli stessi angoli arrotondati e lo stesso sfondo dei filtri avanzati.
// Il tocco fuori dalla scheda la chiude; lo spazio sotto è quello della barra di sistema.
// Con fullScreen mostra la stessa schermata a tutto schermo, rispettando le aree di sistema.
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
  // Altezza in base al contenuto (fino all'80%) invece del 90% fisso
  autoHeight?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (fullScreen) {
    return (
      // Traslucide su Android: lo sfondo arriva sotto la status bar e la barra di navigazione, come nella home
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
  // Stessa larghezza massima della home (1200px), centrata anche sulle schede a tutto schermo
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
    // Su schermi larghi la scheda è centrata verticalmente, come i filtri avanzati della home
    marginTop: 'auto',
    marginBottom: 'auto',
  },
});
