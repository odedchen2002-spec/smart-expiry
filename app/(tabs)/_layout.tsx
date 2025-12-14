import { Tabs, useFocusEffect } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { TimeProvider } from '@/context/TimeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useItems } from '@/lib/hooks/useItems';
import { useCallback, useRef } from 'react';

interface FloatingTabBarProps extends BottomTabBarProps {
  expiredCount?: number;
}

function FloatingTabBar({ state, descriptors, navigation, expiredCount = 0 }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? (options.tabBarLabel as string)
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;
          const color = isFocused ? '#0F172A' : '#6B7280';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
              activeOpacity={0.9}
            >
              <View style={[styles.tabPill, isFocused && styles.tabPillActive]}>
                <View style={styles.iconContainer}>
                  {options.tabBarIcon
                    ? options.tabBarIcon({ focused: isFocused, color, size: 20 })
                    : null}
                  {/* Show expired count badge on expired tab */}
                  {route.name === 'expired' && expiredCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {expiredCount > 99 ? '99+' : expiredCount}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useLanguage();
  const { activeOwnerId } = useActiveOwner();
  
  // Get expired items count for badge
  const { items: expiredItems, totalItemsCount, refetch: refetchExpired } = useItems({
    scope: 'expired',
    ownerId: activeOwnerId || undefined,
    autoFetch: !!activeOwnerId,
  });
  
  // Only refetch expired items badge count if data is stale (older than 30 seconds)
  // This prevents unnecessary refetches on every tab switch
  const lastBadgeFetchRef = useRef<number>(0);
  const STALE_TIME = 30000; // 30 seconds

  useFocusEffect(
    useCallback(() => {
      if (activeOwnerId) {
        const now = Date.now();
        // Only refetch if data is stale (older than 30 seconds) or never fetched
        if (now - lastBadgeFetchRef.current > STALE_TIME || lastBadgeFetchRef.current === 0) {
          refetchExpired();
          lastBadgeFetchRef.current = Date.now();
        }
      }
    }, [activeOwnerId, refetchExpired])
  );
  
  // For expired scope, items equals allItems (no subscription limits applied)
  // Use totalItemsCount which is allItems.length for the most accurate count
  // This should reflect all expired items from the database query
  const expiredCount = totalItemsCount || 0;

  return (
    <TimeProvider>
      <Tabs
        initialRouteName="all"
        screenOptions={{
          headerShown: false,
          lazy: false, // Keep all tabs mounted in memory
          freezeOnBlur: false, // Don't freeze screens when blurred (keeps them active)
          detachInactiveScreens: false, // Keep inactive screens mounted
        }}
        tabBar={(props) => <FloatingTabBar {...props} expiredCount={expiredCount} />}
      >
      <Tabs.Screen
        name="scanner"
        options={{
          title: t('screens.scan.title'),
          tabBarLabel: t('screens.scan.title'),
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="barcode-scan" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="all"
        options={{
          title: t('screens.all.title'),
          tabBarLabel: t('screens.all.title'),
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="format-list-bulleted" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="expired"
        options={{
          title: t('screens.expired.title'),
          tabBarLabel: t('screens.expired.title'),
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="alert-circle" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
    </TimeProvider>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: '6%', // Use percentage instead of fixed pixels
    maxWidth: 600, // Prevent tab bar from being too wide on tablets
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    borderRadius: 999,
    padding: 6,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  tabButton: {
    flex: 1,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
  },
  tabPillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabLabelActive: {
    color: '#0F172A',
  },
  iconContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    minHeight: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'left',
    includeFontPadding: false,
  },
});

