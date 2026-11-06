import React from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
          {children}
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

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FBF9F5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
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
