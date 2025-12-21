import { useLanguage } from '@/context/LanguageContext';
import { TimeProvider } from '@/context/TimeContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useItems } from '@/lib/hooks/useItems';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FloatingTabBarProps extends BottomTabBarProps {
  expiringCount?: number;
}

function FloatingTabBar({ state, descriptors, navigation, expiringCount = 0 }: FloatingTabBarProps) {
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
          // Blue for active, black for inactive (inspired by the design)
          const color = isFocused ? '#007AFF' : '#1C1C1E';

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
              activeOpacity={0.7}
            >
              <View style={[styles.tabPill, isFocused && styles.tabPillActive]}>
                <View style={styles.iconContainer}>
                  {options.tabBarIcon
                    ? options.tabBarIcon({ focused: isFocused, color, size: 22 })
                    : null}
                  {/* Show expiring count badge on expired tab */}
                  {route.name === 'expired' && expiringCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {expiringCount > 99 ? '99+' : expiringCount}
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
  
  // Get expired items count for badge (items that have already expired)
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
  const expiringCount = totalItemsCount || 0;

  return (
    <TimeProvider>
      <Tabs
        initialRouteName="home"
        screenOptions={{
          headerShown: false,
          lazy: false, // Keep all tabs mounted in memory
          freezeOnBlur: false, // Don't freeze screens when blurred (keeps them active)
          detachInactiveScreens: false, // Keep inactive screens mounted
        }}
        tabBar={(props) => <FloatingTabBar {...props} expiringCount={expiringCount} />}
      >
      {/* Tab order: Scan, Home, All, Expiring (4 tabs exactly) */}
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
        name="home"
        options={{
          title: t('home.title') || 'Home',
          tabBarLabel: t('home.title') || 'Home',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="home" size={22} color={color} />
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabBar: {
    width: 320,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 12,
    // Subtle border for definition
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  tabButton: {
    flex: 1,
  },
  tabPill: {
    flexDirection: 'column', // Vertical layout - icon above text
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  tabPillActive: {
    backgroundColor: '#F0F0F0', // Subtle gray background for active tab
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1C1C1E', // Black text for inactive
  },
  tabLabelActive: {
    color: '#007AFF', // Blue text for active
    fontWeight: '600',
  },
  iconContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
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
    textAlign: 'center',
    includeFontPadding: false,
  },
});

