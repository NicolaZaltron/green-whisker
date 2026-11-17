import { FlatList, FlatListProps, ScrollView, ScrollViewProps, SectionList, SectionListProps, StyleProp, ViewStyle } from 'react-native';
import { useTabBarClearance } from '../hooks/useTabBarClearance';

// Wrappers of ScrollView, FlatList and SectionList for tab screens: they add at the bottom
// the navbar space, so no element ends up behind it.

export function TabScrollView({ contentContainerStyle, ...props }: ScrollViewProps) {
  const clearance = useTabBarClearance();
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[contentContainerStyle as StyleProp<ViewStyle>, { paddingBottom: clearance }]}
    />
  );
}

export function TabFlatList<T>({ contentContainerStyle, ...props }: FlatListProps<T>) {
  const clearance = useTabBarClearance();
  return (
    <FlatList
      {...props}
      contentContainerStyle={[contentContainerStyle as StyleProp<ViewStyle>, { paddingBottom: clearance }]}
    />
  );
}

export function TabSectionList<ItemT, SectionT>({ contentContainerStyle, ...props }: SectionListProps<ItemT, SectionT>) {
  const clearance = useTabBarClearance();
  return (
    <SectionList
      {...props}
      contentContainerStyle={[contentContainerStyle as StyleProp<ViewStyle>, { paddingBottom: clearance }]}
    />
  );
}
