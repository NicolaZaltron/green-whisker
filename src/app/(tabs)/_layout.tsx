import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// Barra di navigazione flottante in stile Material You
const BAR_HEIGHT = 64;
const BAR_SIDE_MARGIN = 16; // margine laterale della barra
// Spazio della sfumatura sopra la barra: il contenuto sparisce gradualmente verso il bianco
const FADE_TOP = 10;
// Stessa larghezza massima delle schermate (mainWrapper): barra e card restano allineate
const MAX_CONTENT_WIDTH = 1200;

// Contenuto di ogni scheda: icona sopra, nome sotto. La scheda attiva ha una pillola verde.
function tabContent(name: React.ComponentProps<typeof Ionicons>['name'], color: string, focused: boolean, title: string) {
  if (!focused) {
    return (
      <View style={styles.inactive}>
        <Ionicons name={name} color={color} size={22} />
        <Text style={[styles.inactiveText, { color }]} numberOfLines={1}>{title}</Text>
      </View>
    );
  }
  return (
    <View style={styles.pill}>
      <Ionicons name={name} color="#34523C" size={20} />
      <Text style={styles.pillText} numberOfLines={1}>{title}</Text>
    </View>
  );
}

// Contenitore di ogni scheda con altezza fissa: su web react-navigation usa un <a> con flex 1 1 0%
// che si allunga sull'altezza della barra, quindi lo sostituiamo con un elemento a dimensione fissa
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

// Sfondo della barra: la sfumatura sale sopra la barra (trasparente in alto, bianca in basso),
// la pillola bianca occupa esattamente l'area delle voci
function TabBarBackground({ fadeHeight }: { fadeHeight: number }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['rgba(255, 255, 255,0)', 'rgba(255,255,255,80)', 'rgba(255,255,255,80)']}
        locations={[0, 0.7, 1]}
        style={[styles.fade, { height: fadeHeight }]}
      />
      <View style={styles.floatingBar} />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sideInset = Math.max((width - MAX_CONTENT_WIDTH) / 2, 0);

  // Distanza della barra dal fondo: sopra la barra gestuale o la barra di navigazione di sistema
  const barBottom = Math.max(insets.bottom, 8) + 12;
  // Altezza della sfumatura: sale sopra la barra di FADE_TOP
  const fadeHeight = FADE_TOP + BAR_HEIGHT + barBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
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
        // Altezza fissa e centrata: nessuno stretch verticale delle voci, su qualsiasi schermo
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
          tabBarIcon: ({ color, focused }) => tabContent('leaf', color as string, focused, t('tabs.explore')),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t('tabs.favorites'),
          tabBarIcon: ({ color, focused }) => tabContent(focused ? 'heart' : 'heart-outline', color as string, focused, t('tabs.favorites')),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: t('tabs.shopping'),
          tabBarIcon: ({ color, focused }) => tabContent(focused ? 'cart' : 'cart-outline', color as string, focused, t('tabs.shopping')),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: t('tabs.planner'),
          tabBarIcon: ({ color, focused }) => tabContent(focused ? 'calendar' : 'calendar-outline', color as string, focused, t('tabs.planner')),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#FFFFFF',
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  inactive: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  pill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    height: 52,
    paddingHorizontal: 8,
    // Stesso raggio della barra: forma a capsula
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: '#DDE8DF',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34523C',
  },
});
