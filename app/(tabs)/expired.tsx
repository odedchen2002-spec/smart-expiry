import React, { useMemo, useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useTime } from '@/context/TimeContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useItems } from '@/lib/hooks/useItems';
import { SearchBar } from '@/components/search/SearchBar';
import { filterItems } from '@/lib/utils/search';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { CategoryCardList } from '@/components/items/CategoryCardList';
import { UpgradeBanner } from '@/components/subscription/UpgradeBanner';
import { TrialReminderDialog } from '@/components/subscription/TrialReminderDialog';
import { Trial5DayReminderDialog } from '@/components/subscription/Trial5DayReminderDialog';
import { TrialEndedDialog } from '@/components/subscription/TrialEndedDialog';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ExpiredScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { timeString, dateString } = useTime();
  const styles = createStyles(isRTL);
  const insets = useSafeAreaInsets();
  const { hasNew, markSeen } = useNotificationBadge();
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  const { items, loading, error, refetch } = useItems({
    scope: 'expired',
    ownerId: activeOwnerId || undefined,
    autoFetch: !!activeOwnerId,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Only refetch on focus if data is stale (older than 30 seconds) or if explicitly needed
  // This prevents unnecessary refetches on every tab switch
  const lastFetchRef = useRef<number>(0);
  const STALE_TIME = 30000; // 30 seconds

  useFocusEffect(
    useCallback(() => {
      if (activeOwnerId) {
        const now = Date.now();
        // Only refetch if data is stale (older than 30 seconds) or never fetched
        if (now - lastFetchRef.current > STALE_TIME || lastFetchRef.current === 0) {
          refetch();
          lastFetchRef.current = Date.now();
        }
      }
    }, [activeOwnerId, refetch])
  );

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    return filterItems(items, searchQuery);
  }, [items, searchQuery]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8F9FA' }]} edges={[]}>
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
              size={24}
              onPress={() => router.push('/settings' as any)}
              iconColor="#FFFFFF"
              style={styles.headerIcon}
            />
          </View>
          <View style={styles.headerCenter}>
            <Text style={styles.headerDate}>{dateString}</Text>
            <Text style={styles.headerTime}>{timeString}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.bellWrapper}>
              <IconButton
                icon="bell-outline"
                size={24}
                onPress={async () => {
                  await markSeen();
                  router.push('/notifications-history' as any);
                }}
                iconColor="#FFFFFF"
                style={[styles.headerIcon, styles.bellIcon]}
              />
              {hasNew && <View style={styles.badgeDot} />}
            </View>
            <IconButton
              icon="folder-cog-outline"
              size={24}
              onPress={() => router.push('/categories' as any)}
              iconColor="#FFFFFF"
              style={styles.headerIcon}
            />
          </View>
        </View>
        <View style={styles.headerContent}>
          <Text style={styles.headerLabel}>{t('screens.expired.title')}</Text>
          <Text style={styles.headerCount}>{filteredItems.length} {filteredItems.length === 1 ? t('screens.expired.product') : t('screens.expired.products')}</Text>
        </View>
        </LinearGradient>
      </View>

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('search.placeholder')}
          />
        </View>

        <UpgradeBanner />

        <CategoryCardList
          items={filteredItems}
          loading={loading || ownerLoading}
          error={error}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          searchQuery={searchQuery}
          emptyMessage={t('screens.expired.empty')}
          sortDirection="desc"
        />
      </View>
      <Trial5DayReminderDialog />
      <TrialReminderDialog />
      <TrialEndedDialog />
    </SafeAreaView>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrapper: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, // Soft bottom shadow
    shadowOpacity: 0.08, // Very gentle shadow strength
    shadowRadius: 14, // Soft blur for polished separation
    elevation: 4, // Reduced for subtlety
  },
  header: {
    paddingBottom: 8, // Reduced by 20% (from 10 to 8)
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8, // Reduced by 20% (from 10 to 8)
    minHeight: 32, // Reduced by 20% (from 40 to 32)
    position: 'relative', // Enable absolute positioning for center
  },
  headerIcon: {
    margin: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.12)', // Subtle translucent white background (12% opacity)
    borderRadius: 14, // Rounded corners (14px)
    minWidth: 44, // Minimum hit-area of 44x44px
    minHeight: 44,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    opacity: 0.7, // Lower opacity to not pull focus
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 80,
    flexShrink: 0,
    zIndex: 1,
    paddingStart: 4, // Extra padding so icons don't touch screen edges
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0, // Behind the left/right icons
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: isRTL ? 'flex-start' : 'flex-end',
    minWidth: 80,
    flexShrink: 0,
    gap: 18, // Increased spacing between buttons (16-20px)
    zIndex: 1,
    paddingEnd: 4, // Extra padding so icons don't touch screen edges
  },
  bellIcon: {
    marginStart: 0,
  },
  bellWrapper: {
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  headerDate: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 2, // Reduced vertical spacing (from 4 to 2)
    marginBottom: 1, // Reduced vertical spacing (from 2 to 1)
  },
  headerTime: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: 0,
  },
  headerLabel: {
    color: '#FFFFFF',
    fontSize: 12, // Reduced by ~8% (13 * 0.92)
    fontWeight: '400', // Reduced from '500' for softer look
    opacity: 0.95,
    marginBottom: 12, // Extra spacing below the title
    letterSpacing: 0.3,
  },
  headerCount: {
    color: '#FFFFFF',
    fontSize: 30.4, // Reduced by 20% (from 38 to 30.4)
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    marginTop: 0,
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#F8F9FA',
  },
  });
}

