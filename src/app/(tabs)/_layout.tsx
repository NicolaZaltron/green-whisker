import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const isWeb = Platform.OS === 'web';
  const isIOS = Platform.OS === 'ios';

  // Bottom padding: respects Android virtual 3-button navigation, gesture bar, iOS home bar, or web defaults
  const bottomPadding = isWeb
    ? 8
    : insets.bottom > 0
      ? insets.bottom
      : (isIOS ? 20 : 8);

  const contentHeight = isWeb ? 68 : (isIOS ? 54 : 60);
  const tabHeight = isWeb ? 68 : (contentHeight + (insets.bottom > 0 ? insets.bottom : (isIOS ? 20 : 8)));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4A6B53',
        tabBarInactiveTintColor: '#8E9C91',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#ECE7DF',
          borderTopWidth: 1,
          height: tabHeight,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          shadowColor: '#1A2E1F',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 4,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.explore'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="leaf" color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t('tabs.favorites'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'heart' : 'heart-outline'} color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: t('tabs.shopping'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'cart' : 'cart-outline'} color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: t('tabs.planner'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={size - 2} />
          ),
        }}
      />
    </Tabs>
  );
}
