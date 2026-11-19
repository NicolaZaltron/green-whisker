import React, { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { elevation, icon, space, text } from '../../theme/tokens';

// Floating navigation bar in Material You style
const BAR_HEIGHT = 64;
const BAR_SIDE_MARGIN = 16; // side margin of the bar
// Height of the fade above the bar: content gradually fades to white
const FADE_TOP = 10;
// Same max width as the screens (mainWrapper): bar and cards stay aligned
const MAX_CONTENT_WIDTH = 1200;

// Content of each tab: icon on top, name below. The active tab has a green pill.
function tabContent(
  name: React.ComponentProps<typeof Ionicons>['name'],
  color: string,
  focused: boolean,
  title: string,
  colors: Palette,
  styles: ReturnType<typeof makeStyles>,
) {
  if (!focused) {
    return (
      <View style={styles.inactive}>
        <Ionicons name={name} color={color} size={icon.xl} />
        <Text style={[styles.inactiveText, { color }]} numberOfLines={1}>{title}</Text>
      </View>
    );
  }
  return (
    <View style={styles.pill}>
      <Ionicons name={name} color={colors.primaryText} size={icon.lg} />
      <Text style={styles.pillText} numberOfLines={1}>{title}</Text>
    </View>
  );
}

// Container of each tab with fixed height: on web react-navigation uses an <a> with flex 1 1 0%
// that stretches to the bar height, so we replace it with a fixed-size element
function TabButton({
  children,
  onPress,
  onLongPress,
  accessibilityState,
}: {
  children: React.ReactNode;
  onPress?: (event: any) => void;
  onLongPress?: (event: any) => void;
  accessibilityState?: object;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabButton}
    >
      {children}
    </Pressable>
  );
}

// Bar background: the fade rises above the bar (transparent at the top, white at the bottom),
// the white pill covers exactly the area of the items
function TabBarBackground({ fadeHeight }: { fadeHeight: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[`${colors.background}00`, colors.background, colors.background]}
        locations={[0, 0.7, 1]}
        style={[styles.fade, { height: fadeHeight }]}
      />
      <View style={styles.floatingBar} />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sideInset = Math.max((width - MAX_CONTENT_WIDTH) / 2, 0);

  // Distance of the bar from the bottom: above the gesture bar or the system navigation bar
  const barBottom = Math.max(insets.bottom, 8) + 12;
  // Fade height: rises above the bar by FADE_TOP
  const fadeHeight = FADE_TOP + BAR_HEIGHT + barBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Unfocused tabs stay frozen: they do not re-render on context changes
        freezeOnBlur: true,
        tabBarShowLabel: false,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBackground: () => <TabBarBackground fadeHeight={fadeHeight} />,
        tabBarButton: props => <TabButton {...props} />,
        tabBarStyle: {
          position: 'absolute',
          left: sideInset,
          right: sideInset,
          bottom: 0,
          height: BAR_HEIGHT + barBottom,
          paddingTop: 0,
          paddingBottom: barBottom,
          paddingHorizontal: BAR_SIDE_MARGIN,
          flexDirection: 'row',
          alignItems: 'center',
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
        },
        // Fixed and centered height: no vertical stretch of the items, on any screen
        tabBarItemStyle: {
          height: BAR_HEIGHT,
          justifyContent: 'center',
          alignItems: 'center',
          alignSelf: 'center',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.explore'),
          tabBarIcon: ({ color, focused }) => tabContent('leaf', color as string, focused, t('tabs.explore'), colors, styles),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t('tabs.favorites'),
          tabBarIcon: ({ color, focused }) => tabContent(focused ? 'heart' : 'heart-outline', color as string, focused, t('tabs.favorites'), colors, styles),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: t('tabs.shopping'),
          tabBarIcon: ({ color, focused }) => tabContent(focused ? 'cart' : 'cart-outline', color as string, focused, t('tabs.shopping'), colors, styles),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: t('tabs.planner'),
          tabBarIcon: ({ color, focused }) => tabContent(focused ? 'calendar' : 'calendar-outline', color as string, focused, t('tabs.planner'), colors, styles),
        }}
      />
    </Tabs>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  tabButton: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -FADE_TOP,
  },
  floatingBar: {
    position: 'absolute',
    top: 0,
    height: BAR_HEIGHT,
    left: BAR_SIDE_MARGIN,
    right: BAR_SIDE_MARGIN,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: colors.surface,
    ...elevation(3, colors),
  },
  inactive: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveText: {
    fontSize: text.label,
    fontWeight: '600',
    marginTop: 2,
  },
  pill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    height: 52,
    paddingHorizontal: space.md,
    // Same radius as the bar: capsule shape
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: colors.primarySoft,
  },
  pillText: {
    fontSize: text.label,
    fontWeight: '700',
    color: colors.primaryText,
  },
});
