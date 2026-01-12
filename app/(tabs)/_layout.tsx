import { useLanguage } from '@/context/LanguageContext';
import { TimeProvider } from '@/context/TimeContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useItems } from '@/lib/hooks/useItems';
import { useProLimitDialog } from '@/lib/hooks/useProLimitDialog';
import { ProLimitReachedDialog } from '@/components/subscription/ProLimitReachedDialog';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Animation constants
const TAB_ANIMATION = {
  PRESS_DURATION: 80,
  SCALE_PRESSED: 0.95,
};

interface FloatingTabBarProps extends BottomTabBarProps {
  expiringCount?: number;
}

// Animated tab button component
interface AnimatedTabButtonProps {
  route: any;
  index: number;
  isFocused: boolean;
  options: any;
  onPress: () => void;
  onLongPress: () => void;
  expiringCount: number;
}

function AnimatedTabButton({
  route,
  isFocused,
  options,
  onPress,
  onLongPress,
  expiringCount,
}: AnimatedTabButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const label =
    options.tabBarLabel !== undefined
      ? (options.tabBarLabel as string)
      : options.title !== undefined
      ? options.title
      : route.name;
  const color = isFocused ? '#007AFF' : '#1C1C1E';

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: TAB_ANIMATION.SCALE_PRESSED,
      duration: TAB_ANIMATION.PRESS_DURATION,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: TAB_ANIMATION.PRESS_DURATION * 1.5,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const handlePress = async () => {
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options.tabBarAccessibilityLabel}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={onLongPress}
      style={styles.tabButton}
    >
      <Animated.View
        style={[
          styles.tabPill,
          isFocused && styles.tabPillActive,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={styles.iconContainer}>
          {options.tabBarIcon
            ? options.tabBarIcon({ focused: isFocused, color, size: 22 })
            : null}
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
      </Animated.View>
    </Pressable>
  );
}

function FloatingTabBar({ state, descriptors, navigation, expiringCount = 0 }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

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
            <AnimatedTabButton
              key={route.key}
              route={route}
              index={index}
              isFocused={isFocused}
              options={options}
              onPress={onPress}
              onLongPress={onLongPress}
              expiringCount={expiringCount}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useLanguage();
  const { activeOwnerId } = useActiveOwner();
  
  // Pro limit dialog - shows once when reaching 2000 items
  const { showDialog: showProLimitDialog, dismissDialog: dismissProLimitDialog } = useProLimitDialog();
  
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
      
      {/* Pro Limit Dialog - shown once when reaching 2000 items */}
      <ProLimitReachedDialog
        visible={showProLimitDialog}
        onDismiss={dismissProLimitDialog}
        ownerId={activeOwnerId || ''}
      />
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
    // Refined shadow for premium depth
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
    // Subtle border for definition
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.03)',
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

