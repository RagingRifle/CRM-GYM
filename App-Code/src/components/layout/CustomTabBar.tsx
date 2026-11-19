import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  CalendarCheck,
  Dumbbell,
  LayoutDashboard,
  LayoutGrid,
  User,
} from '@/components/ui/app-icons';

interface CustomTabBarProps {
  state: any;
}

const H4_TABS = ['dashboard', 'attendance', 'workouts', 'more', 'profile'];

export const CustomTabBar: React.FC<CustomTabBarProps> = ({ state }) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activeColor = '#FEDF1E';
  const inactiveColor = '#E8E2D6';
  const activeBackground = '#2B2A25';
  const visibleRoutes = H4_TABS
    .map((name) => state.routes.find((route: any) => route.name === name))
    .filter(Boolean);
  const currentRouteName = state.routes[state.index]?.name;
  const h4MoreRoutes = ['diets', 'payments', 'classes', 'pt-sessions', 'assessments', 'support', 'shop'];
  const selectedRouteName = h4MoreRoutes.includes(currentRouteName)
    ? 'more'
    : currentRouteName;

  const getTab = (routeName: string) => {
    if (routeName === 'dashboard') return { label: 'Home', Icon: LayoutDashboard };
    if (routeName === 'attendance') return { label: 'Check-in', Icon: CalendarCheck };
    if (routeName === 'workouts') return { label: 'Train', Icon: Dumbbell };
    if (routeName === 'more') return { label: 'More', Icon: LayoutGrid };
    return { label: 'Profile', Icon: User };
  };

  return (
    <View style={[styles.mainWrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {visibleRoutes.map((route: any) => {
          const focused = selectedRouteName === route.name;
          const { label, Icon } = getTab(route.name);
          const color = focused ? activeColor : inactiveColor;
          const onPress = () => {
            if (currentRouteName === route.name) return;
            router.navigate(`/(h4)/${route.name}` as any);
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.75}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              style={[styles.tab, focused && { backgroundColor: activeBackground }]}
            >
              <Icon color={color} size={21} strokeWidth={focused ? 2.5 : 2} />
              <Text style={[styles.label, { color }]} numberOfLines={1} adjustsFontSizeToFit>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mainWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    backgroundColor: '#171713',
  },
  bar: {
    height: 68,
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: '#34332E',
    borderWidth: 0,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'stretch',
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.18, shadowRadius: 8 },
      android: { elevation: 10 },
    }),
  },
  tab: {
    flex: 1,
    minWidth: 0,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  label: {
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
  },
});
