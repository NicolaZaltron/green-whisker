import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Altezza della navbar flottante (vedi src/app/(tabs)/_layout.tsx: BAR_HEIGHT)
const TAB_BAR_HEIGHT = 64;

/**
 * Spazio in fondo alle liste delle schermate a tab: il contenuto scorre sotto la navbar
 * e l'ultimo elemento resta visibile sopra di essa.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 8) + 12 + TAB_BAR_HEIGHT ;
}
