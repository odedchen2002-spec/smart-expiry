import React, { useMemo, useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
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
                size={19}
                onPress={() => router.push('/settings' as any)}
                iconColor="rgba(255, 255, 255, 0.72)"
                style={styles.headerIcon}
              />
            </View>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>{t('screens.expired.title')}</Text>
              <Text style={styles.headerSubtitle}>
                {t('screens.expired.total')} {filteredItems.length} {filteredItems.length === 1 ? t('screens.expired.product') : t('screens.expired.products')}
              </Text>
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
                  style={[styles.headerIcon, styles.bellIcon]}
                />
                {hasNew && <View style={styles.badgeDot} />}
              </View>
              <IconButton
                icon="folder-cog-outline"
                size={19}
                onPress={() => router.push('/categories' as any)}
                iconColor="rgba(255, 255, 255, 0.72)"
                style={styles.headerIcon}
              />
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.content}>
        {/* Status Line */}
        <View style={styles.statusLineContainer}>
          <Text style={styles.statusLineText}>
            {(() => {
              const expiredCount = items.length;
              
              if (expiredCount === 0) {
                return t('screens.expired.statusAllGood');
              } else if (expiredCount === 1) {
                return t('screens.expired.statusExpiredSingle');
              } else {
                return t('screens.expired.statusExpired', { count: expiredCount });
              }
            })()}
          </Text>
        </View>

        <View style={styles.searchContainer}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('screens.expired.searchPlaceholder')}
            elevated
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
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    position: 'relative',
  },
  headerIcon: {
    margin: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    minWidth: 40,
    minHeight: 40,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 50,
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
    paddingHorizontal: 60,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: isRTL ? 'flex-start' : 'flex-end',
    minWidth: 50,
    flexShrink: 0,
    gap: 8,
    zIndex: 1,
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
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    marginTop: 0,
  },
  statusLineContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#F8F9FA',
  },
  statusLineText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: isRTL ? 'right' : 'left',
    letterSpacing: 0.15,
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#F8F9FA',
  },
  });
}

