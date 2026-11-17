import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Height of the floating navbar (see src/app/(tabs)/_layout.tsx: BAR_HEIGHT)
const TAB_BAR_HEIGHT = 64;

/**
 * Space at the bottom of the tab screen lists: content scrolls under the navbar
 * and the last element stays visible above it.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 8) + 12 + TAB_BAR_HEIGHT ;
}
