/**
 * Home Screen - Premium Dashboard
 * 
 * Compact color-coded counts for quick status overview:
 * 🔴 Red = already expired
 * 🟠 Orange = expiring today
 * 🟡 Yellow = expiring this week
 * 🟢 Green = OK (future items)
 * 
 * Features:
 * - Hero card showing items needing attention
 * - 2x2 status grid with visual cards
 * - Premium staggered entry animations
 * - Smooth press feedback with haptics
 * - Animated counters
 */

import { useLanguage } from '@/context/LanguageContext';
import { useCacheReady } from '@/context/CacheContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { itemEvents } from '@/lib/events/itemEvents';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { STALE_TIME, useHomeStats } from '@/lib/hooks/useHomeStats';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { useNotificationPermission } from '@/lib/hooks/useNotificationPermission';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Animation constants - calm and confident
const ANIMATION = {
  ENTRY_DURATION: 300,
  ENTRY_DELAY_STEP: 60,
  ENTRY_TRANSLATE_Y: 10,
  PRESS_DURATION: 100,
  COUNTER_DURATION: 200,
  NAVIGATION_DELAY: 80,
};

// Easing for smooth, professional feel
const EASE_OUT = Easing.bezier(0.25, 0.1, 0.25, 1);

// Status colors - only for icons and numbers
const STATUS_COLORS = {
  expired: '#EF4444',
  today: '#F97316',
  week: '#D4A017', // Muted golden instead of bright yellow
  ok: '#22C55E',
};

// Neutral colors for clean, premium look
const NEUTRAL = {
  cardBg: '#FFFFFF',
  cardBorder: '#E5E7EB',
  iconBg: '#F3F4F6',
  labelText: '#4B5563',
  subtleText: '#9CA3AF',
};

// Animated counter component
// Skeleton component with subtle pulse animation
interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}

function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 800,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 800,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: NEUTRAL.iconBg,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
}

interface AnimatedCounterProps {
  value: number;
  color: string;
  style?: any;
}

function AnimatedCounter({ value, color, style }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isFirstRender = useRef(true);
  const hasHadNonZero = useRef(value > 0);

  useEffect(() => {
    // Track if we've ever shown a non-zero value
    if (value > 0) {
      hasHadNonZero.current = true;
    }

    if (value !== displayValue) {
      // ANTI-FLICKER: If we've shown a non-zero value before, and now value is 0,
      // but displayValue is non-zero, skip this update - it's likely a transient state
      if (hasHadNonZero.current && value === 0 && displayValue > 0) {
        return;
      }

      // Skip animation on first render or when going from 0 to a real value
      // (this happens when cache loads - we don't want animation for initial load)
      const shouldSkipAnimation = isFirstRender.current || displayValue === 0;
      isFirstRender.current = false;

      if (shouldSkipAnimation) {
        // Just update immediately without animation
        setDisplayValue(value);
        return;
      }

      // Fade out, change value, fade in (only for real changes)
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.3,
          duration: ANIMATION.COUNTER_DURATION / 2,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION.COUNTER_DURATION / 2,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Update value at the midpoint
      setTimeout(() => {
        setDisplayValue(value);
      }, ANIMATION.COUNTER_DURATION / 2);
    }
  }, [value, displayValue, fadeAnim]);

  return (
    <Animated.Text style={[style, { color, opacity: fadeAnim }]}>
      {displayValue}
    </Animated.Text>
  );
}

interface StatusCardProps {
  icon: string;
  label: string;
  count: number;
  color: string;
  isRTL?: boolean;
  onPress?: () => void;
  animationDelay?: number;
  isLoading?: boolean;
}

// Status card with premium press animation - neutral background, colored icon/number only
function StatusCard({ icon, label, count, color, isRTL, onPress, animationDelay = 0, isLoading = false }: StatusCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const entryAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(ANIMATION.ENTRY_TRANSLATE_Y)).current;
  const router = useRouter();

  // Entry animation
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(entryAnim, {
          toValue: 1,
          duration: ANIMATION.ENTRY_DURATION,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION.ENTRY_DURATION,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
    }, animationDelay);

    return () => clearTimeout(timer);
  }, [animationDelay, entryAnim, translateY]);

  const handlePressIn = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.97,
        duration: ANIMATION.PRESS_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.92,
        duration: ANIMATION.PRESS_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: ANIMATION.PRESS_DURATION * 1.5,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: ANIMATION.PRESS_DURATION * 1.5,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = async () => {
    await Haptics.selectionAsync();
    // Small delay before navigation for tactile feedback
    setTimeout(() => {
      onPress?.();
    }, ANIMATION.NAVIGATION_DELAY);
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
      style={styles.statusCardWrapper}
    >
      <Animated.View
        style={[
          styles.statusCard,
          {
            transform: [{ scale: scaleAnim }, { translateY }],
            opacity: Animated.multiply(entryAnim, opacityAnim),
          },
        ]}
      >
        {/* Icon - neutral background, colored icon */}
        <View style={styles.statusCardIcon}>
          <MaterialCommunityIcons name={icon as any} size={22} color={isLoading ? NEUTRAL.subtleText : color} />
        </View>

        {/* Count - show skeleton when loading */}
        {isLoading ? (
          <Skeleton width={40} height={32} borderRadius={8} style={styles.countSkeletonMargin} />
        ) : (
          <AnimatedCounter value={count} color={color} style={styles.statusCardCount} />
        )}

        {/* Label - neutral gray */}
        <Text style={[styles.statusCardLabel, isRTL && styles.textRTL]}>{label}</Text>

        {/* Chevron indicator - neutral */}
        {onPress && (
          <View style={styles.statusCardChevron}>
            <MaterialCommunityIcons
              name={isRTL ? 'chevron-left' : 'chevron-right'}
              size={14}
              color={NEUTRAL.subtleText}
            />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

interface HeroCardProps {
  needsAttentionCount: number;
  isRTL?: boolean;
  isLoading?: boolean;
}

// Hero card with entry animation
function HeroCard({ needsAttentionCount, isRTL, isLoading = false }: HeroCardProps) {
  const { t } = useLanguage();
  const entryAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(ANIMATION.ENTRY_TRANSLATE_Y)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entryAnim, {
        toValue: 1,
        duration: ANIMATION.ENTRY_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: ANIMATION.ENTRY_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entryAnim, translateY]);

  return (
    <Animated.View
      style={[
        styles.heroCard,
        {
          opacity: entryAnim,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.heroCardContent, isRTL && styles.heroCardContentRTL]}>
        {/* Icon - subtle, not glowing */}
        <View style={styles.heroCardIconWrapper}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={NEUTRAL.subtleText} />
        </View>

        {/* Text */}
        <View style={styles.heroCardTextWrapper}>
          {isLoading ? (
            <Skeleton width="80%" height={20} borderRadius={6} />
          ) : (
            <>
              <Text style={[styles.heroCardTitle, isRTL && styles.textRTL]}>
                {needsAttentionCount > 0
                  ? (
                    <>
                      {t('home.heroNeedsAttention') || 'יש'}{' '}
                      <Text style={styles.heroCardCount}>{needsAttentionCount}</Text>{' '}
                      {t('home.heroProducts') || 'מוצרים שדורשים טיפול'}
                    </>
                  )
                  : t('home.heroAllGood') || 'הכול בשליטה! 👍'}
              </Text>
            </>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// Section title with entry animation
interface AnimatedSectionTitleProps {
  children: React.ReactNode;
  isRTL?: boolean;
  delay?: number;
}

function AnimatedSectionTitle({ children, isRTL, delay = 0 }: AnimatedSectionTitleProps) {
  const entryAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(ANIMATION.ENTRY_TRANSLATE_Y / 2)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(entryAnim, {
          toValue: 1,
          duration: ANIMATION.ENTRY_DURATION,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION.ENTRY_DURATION,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, entryAnim, translateY]);

  return (
    <Animated.Text
      style={[
        styles.sectionTitle,
        isRTL && styles.textRTL,
        { opacity: entryAnim, transform: [{ translateY }] },
      ]}
    >
      {children}
    </Animated.Text>
  );
}

// Statistics button with entry animation
interface AnimatedStatisticsButtonProps {
  onPress: () => void;
  label: string;
  delay?: number;
}

function AnimatedStatisticsButton({ onPress, label, delay = 0 }: AnimatedStatisticsButtonProps) {
  const entryAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(ANIMATION.ENTRY_TRANSLATE_Y)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(entryAnim, {
          toValue: 1,
          duration: ANIMATION.ENTRY_DURATION,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION.ENTRY_DURATION,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, entryAnim, translateY]);

  const handlePressIn = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.97,
        duration: ANIMATION.PRESS_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.92,
        duration: ANIMATION.PRESS_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: ANIMATION.PRESS_DURATION * 1.5,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: ANIMATION.PRESS_DURATION * 1.5,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = async () => {
    await Haptics.selectionAsync();
    setTimeout(() => {
      onPress();
    }, ANIMATION.NAVIGATION_DELAY);
  };

  return (
    <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View
        style={[
          styles.statisticsButton,
          {
            opacity: Animated.multiply(entryAnim, opacityAnim),
            transform: [{ scale: scaleAnim }, { translateY }],
          },
        ]}
      >
        <MaterialCommunityIcons name="chart-line" size={20} color="#FFFFFF" />
        <Text style={styles.statisticsButtonText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// Notification Warning Banner - shown when push notifications are disabled
interface NotificationWarningBannerProps {
  isRTL: boolean;
  onPress: () => void;
  t: (key: string) => string;
}

function NotificationWarningBanner({ isRTL, onPress, t }: NotificationWarningBannerProps) {
  return (
    <Pressable onPress={onPress} style={styles.notificationWarningBanner}>
      <View style={[styles.notificationWarningContent, isRTL && styles.notificationWarningContentRTL]}>
        <View style={styles.notificationWarningIconWrapper}>
          <MaterialCommunityIcons name="bell-off-outline" size={20} color="#DC2626" />
        </View>
        <View style={styles.notificationWarningTextWrapper}>
          <Text style={[styles.notificationWarningTitle, isRTL && styles.textRTL]}>
            {t('home.notificationsDisabled') || 'התראות כבויות'}
          </Text>
          <Text style={[styles.notificationWarningSubtitle, isRTL && styles.textRTL]}>
            {t('home.notificationsDisabledDescription') || 'לא תקבלו התראות על מוצרים שעומדים לפוג. לחצו כדי להפעיל בהגדרות.'}
          </Text>
        </View>
        <MaterialCommunityIcons 
          name={isRTL ? 'chevron-left' : 'chevron-right'} 
          size={20} 
          color="#9CA3AF" 
        />
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasNew, markSeen } = useNotificationBadge();
  const { activeOwnerId, isViewer } = useActiveOwner();
  const { cachedOwnerId } = useCacheReady(); // Get cached owner ID for instant display
  const { isEnabled: notificationsEnabled, isLoading: isLoadingPermission, requestOrOpenSettings } = useNotificationPermission();

  const [refreshing, setRefreshing] = useState(false);

  // Use activeOwnerId if available, otherwise fall back to cachedOwnerId for instant cache display
  // This prevents flickering when activeOwnerId is still loading but we have cached data
  const ownerIdForStats = activeOwnerId || cachedOwnerId;

  // Use stale-while-revalidate stats hook
  const { stats, isLoading: isLoadingFromHook, hasCache, refetch, lastFetchTime } = useHomeStats({
    ownerId: ownerIdForStats,
    autoFetch: !!activeOwnerId, // Only auto-fetch when activeOwnerId is ready
  });

  // Show loading state ONLY when the hook says it's loading (no cache and fetching)
  // This ensures cached data shows instantly, even if activeOwnerId is still loading
  const isLoadingStats = isLoadingFromHook;

  // Alias stats for cleaner template usage
  const counts = stats;
  const pendingItemsCount = stats.pendingDates;
  // Count only "This Week" (excluding today) + "Expired" for hero card
  const needsAttentionCount = counts.expired + counts.week;

  // Stale data refresh on focus OR if items changed since last fetch
  useFocusEffect(
    useCallback(() => {
      if (activeOwnerId) {
        const now = Date.now();
        const lastItemChange = itemEvents.getLastUpdateTimestamp();
        
        // Refetch if:
        // 1. Data is stale (older than STALE_TIME)
        // 2. OR never fetched
        // 3. OR items changed since last fetch (someone marked sold/finished/thrown)
        const shouldRefetch = 
          now - lastFetchTime > STALE_TIME || 
          lastFetchTime === 0 ||
          lastItemChange > lastFetchTime;
        
        if (shouldRefetch) {
          refetch();
        }
      }
    }, [activeOwnerId, lastFetchTime, refetch])
  );

  // Subscribe to itemEvents - refresh stats when items are added/removed/resolved
  // This handles the case when home screen is visible and items change
  useEffect(() => {
    const unsubscribe = itemEvents.subscribe(() => {
      if (activeOwnerId) {
        refetch();
      }
    });
    return () => unsubscribe();
  }, [activeOwnerId, refetch]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      console.warn('[HomeScreen] Error during refresh:', err);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleStatisticsPress = () => {
    router.push('/settings/statistics' as any);
  };

  // Calculate staggered delays
  const HERO_DELAY = 0;
  const SECTION_TITLE_DELAY = ANIMATION.ENTRY_DELAY_STEP;
  const CARD_BASE_DELAY = ANIMATION.ENTRY_DELAY_STEP * 2;
  const BUTTON_DELAY = ANIMATION.ENTRY_DELAY_STEP * 6;

  return (
    <View style={styles.container}>
      {/* Header with gradient */}
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={THEME_COLORS.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <IconButton
                icon="cog-outline"
                size={19}
                onPress={() => router.push('/settings' as any)}
                iconColor="rgba(255, 255, 255, 0.72)"
                style={styles.headerIcon}
              />
            </View>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>{t('home.title') || 'דף הבית'}</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.bellWrapper}>
                <IconButton
                  icon="bell-outline"
                  size={19}
                  onPress={async () => {
                    await markSeen();
                    router.push('/notifications-history' as any);
                  }}
                  iconColor="rgba(255, 255, 255, 0.72)"
                  style={styles.headerIcon}
                />
                {hasNew && <View style={styles.badgeDot} />}
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[THEME_COLORS.primary]}
            tintColor={THEME_COLORS.primary}
          />
        }
      >
        {/* Notification Warning Banner - show if notifications are disabled */}
        {!isLoadingPermission && !notificationsEnabled && (
          <NotificationWarningBanner 
            isRTL={isRTL} 
            onPress={requestOrOpenSettings}
            t={t}
          />
        )}

        {/* Hero Card */}
        <HeroCard
          needsAttentionCount={needsAttentionCount}
          isRTL={isRTL}
          isLoading={isLoadingStats}
        />

        {/* Section Title */}
        <AnimatedSectionTitle isRTL={isRTL} delay={SECTION_TITLE_DELAY}>
          {t('home.expiryStatus') || 'סטטוס פגי תוקף'}
        </AnimatedSectionTitle>

        {/* Status Grid - 2x2 */}
        <View style={styles.statusGrid}>
          <View style={styles.statusGridRow}>
            <StatusCard
              icon="calendar-week"
              label={t('home.week') || 'השבוע'}
              count={counts.week}
              color={STATUS_COLORS.week}
              isRTL={isRTL}
              onPress={() =>
                router.push({ pathname: '/(tabs)/all', params: { daysAhead: '7' } } as any)
              }
              animationDelay={CARD_BASE_DELAY}
              isLoading={isLoadingStats}
            />
            <StatusCard
              icon="clock-alert-outline"
              label={t('home.today') || 'היום'}
              count={counts.today}
              color={STATUS_COLORS.today}
              isRTL={isRTL}
              onPress={() =>
                router.push({ pathname: '/(tabs)/all', params: { daysAhead: '0' } } as any)
              }
              animationDelay={CARD_BASE_DELAY + ANIMATION.ENTRY_DELAY_STEP}
              isLoading={isLoadingStats}
            />
          </View>
          <View style={styles.statusGridRow}>
            <StatusCard
              icon="alert-circle"
              label={t('status.expired') || 'פג תוקף'}
              count={counts.expired}
              color={STATUS_COLORS.expired}
              isRTL={isRTL}
              onPress={() => router.push('/(tabs)/expired' as any)}
              animationDelay={CARD_BASE_DELAY + ANIMATION.ENTRY_DELAY_STEP * 2}
              isLoading={isLoadingStats}
            />
            <StatusCard
              icon="check-circle-outline"
              label={t('status.ok') || 'תקין'}
              count={counts.ok}
              color={STATUS_COLORS.ok}
              isRTL={isRTL}
              onPress={() => router.push('/(tabs)/all' as any)}
              animationDelay={CARD_BASE_DELAY + ANIMATION.ENTRY_DELAY_STEP * 3}
              isLoading={isLoadingStats}
            />
          </View>
        </View>

        {/* Spacer for bottom button */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Statistics Button */}
      <View style={[styles.statisticsButtonContainer, { bottom: insets.bottom + 90 }]}>
        <AnimatedStatisticsButton
          onPress={handleStatisticsPress}
          label={t('home.savingsReport') || 'דוח חיסכון'}
          delay={BUTTON_DELAY}
        />
      </View>

      {/* Floating button for pending items */}
      {pendingItemsCount > 0 && !isViewer && (
        <Pressable
          style={[
            styles.pendingFloatingButton,
            { bottom: insets.bottom + 145 },
            isRTL && styles.pendingFloatingButtonRTL,
          ]}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTimeout(() => {
              router.push('/pending-expiry' as any);
            }, ANIMATION.NAVIGATION_DELAY);
          }}
        >
          <LinearGradient
            colors={['#F59E0B', '#D97706']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.pendingFloatingButtonGradient,
              isRTL && styles.pendingFloatingButtonGradientRTL,
            ]}
          >
            <MaterialCommunityIcons name="truck-delivery-outline" size={20} color="#FFFFFF" />
            <Text style={styles.pendingFloatingButtonText}>
              {t('buttons.pendingFromSupplier') || 'פריטים מהספק'}
            </Text>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeCountText}>{pendingItemsCount}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  headerWrapper: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  header: {
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    position: 'relative',
  },
  headerIcon: {
    margin: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    width: 36,
    height: 36,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 44,
    flexShrink: 0,
    zIndex: 1,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    paddingHorizontal: 50,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 44,
    flexShrink: 0,
    zIndex: 1,
  },
  bellWrapper: {
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 20,
  },
  textRTL: {
    textAlign: 'right',
  },

  // Notification Warning Banner
  notificationWarningBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    ...Platform.select({
      ios: {
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  notificationWarningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  notificationWarningContentRTL: {
    flexDirection: 'row-reverse',
  },
  notificationWarningIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationWarningTextWrapper: {
    flex: 1,
  },
  notificationWarningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 2,
  },
  notificationWarningSubtitle: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },

  // Hero Card - neutral, calm design
  heroCard: {
    backgroundColor: NEUTRAL.cardBg,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: NEUTRAL.cardBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  heroCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroCardContentRTL: {
    flexDirection: 'row-reverse',
  },
  heroCardIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: NEUTRAL.iconBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCardTextWrapper: {
    flex: 1,
  },
  heroCardTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: NEUTRAL.labelText,
    marginBottom: 4,
  },
  heroCardCount: {
    fontWeight: '800',
    color: '#1F2937',
  },
  // Section Title
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  // Status Grid
  statusGrid: {
    gap: 12,
    marginBottom: 16,
  },
  statusGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusCardWrapper: {
    flex: 1,
  },
  statusCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    position: 'relative',
    backgroundColor: NEUTRAL.cardBg,
    borderWidth: 1,
    borderColor: NEUTRAL.cardBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  statusCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: NEUTRAL.iconBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusCardCount: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 4,
  },
  statusCardLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: NEUTRAL.labelText,
    textAlign: 'center',
  },
  countSkeletonMargin: {
    marginBottom: 4,
  },
  statusCardChevron: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: NEUTRAL.iconBg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Statistics Button - refined shadow
  statisticsButtonContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  statisticsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  statisticsButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Pending Floating Button
  pendingFloatingButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  pendingFloatingButtonRTL: {},
  pendingFloatingButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  pendingFloatingButtonGradientRTL: {
    flexDirection: 'row-reverse',
  },
  pendingFloatingButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pendingBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  pendingBadgeCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
