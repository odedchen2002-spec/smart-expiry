import React, { useMemo, useCallback, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { IconButton, Snackbar, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useItemsQuery } from '@/hooks/queries/useItemsQuery';
import { useDeleteItem } from '@/hooks/writes/useDeleteItem';
import { useUpdateItem } from '@/hooks/writes/useUpdateItem';
import { SearchBar } from '@/components/search/SearchBar';
import { filterItems } from '@/lib/utils/search';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { CategoryCardList } from '@/components/items/CategoryCardList';
import { UpgradeBanner } from '@/components/subscription/UpgradeBanner';
import { TrialReminderDialog } from '@/components/subscription/TrialReminderDialog';
import { Trial7DayReminderDialog } from '@/components/subscription/Trial5DayReminderDialog';
import { TrialEndedDialog } from '@/components/subscription/TrialEndedDialog';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonItemList } from '@/components/items/SkeletonItemCard';
import { logSoldFinished, logThrown } from '@/lib/supabase/services/expiryEventsService';
import * as Haptics from 'expo-haptics';
import type { Database } from '@/types/database';

type Item = Database['public']['Views']['items_with_details']['Row'];

export default function ExpiredScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const styles = createStyles(isRTL);
  const insets = useSafeAreaInsets();
  const { hasNew, markSeen } = useNotificationBadge();
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  
  // TanStack Query for reads (cache-first, no refetch-on-focus)
  const { data: items = [], isFetching, error, refetch } = useItemsQuery({
    ownerId: activeOwnerId || undefined,
    scope: 'expired',
    enabled: !!activeOwnerId,
  });
  
  // Determine if we have cached data
  const hasCachedData = items.length > 0;
  
  // Show skeleton only if fetching AND no cached data (first load)
  const showSkeleton = isFetching && !hasCachedData;
  
  // Outbox write hooks
  const { deleteItem, undoDelete, canUndo: canUndoDelete } = useDeleteItem(activeOwnerId || '', 'expired');
  const { updateItem, canUndoResolve, undoResolve } = useUpdateItem(activeOwnerId || '', 'expired');
  
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isInitialMountRef = useRef(true); // Track initial mount for focus effect

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    // CRITICAL: Filter out soft-deleted items (marked for deletion with undo window)
    // This prevents duplicate key errors and ensures deleted items don't appear in UI
    let filtered = items.filter((item) => !(item as any)._deleted);
    
    // Note: No need to filter status === 'resolved' here
    // The reconcileUpdate in OutboxProcessor already removes them from 'expired' cache
    
    // SAFETY: Remove duplicate IDs (in case of optimistic + reconcile race)
    const seenIds = new Set<string>();
    const duplicates = new Set<string>();
    filtered = filtered.filter((item) => {
      if (seenIds.has(item.id)) {
        duplicates.add(item.id);
        return false;
      }
      seenIds.add(item.id);
      return true;
    });
    
    // Log duplicates only once (if any found)
    if (duplicates.size > 0) {
      console.warn('[ExpiredScreen] Duplicate IDs filtered:', Array.from(duplicates));
    }
    
    return filterItems(filtered, searchQuery);
  }, [items, searchQuery]);

  // Pull-to-refresh (ONLY manual refetch path)
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Auto-refresh when screen comes into focus (to update newly expired items)
  // This ensures items that just expired show up immediately
  useFocusEffect(
    useCallback(() => {
      // Skip initial mount (data already loaded)
      if (isInitialMountRef.current) {
        isInitialMountRef.current = false;
        return;
      }

      // Only refetch if we have an owner
      if (activeOwnerId) {
        console.log('[Expired Screen] Screen focused - refreshing data to catch newly expired items');
        refetch();
      }
    }, [activeOwnerId, refetch])
  );

  // Handle sold/finished action
  const handleSoldFinished = useCallback(async (item: Item) => {
    if (!activeOwnerId) return;
    
    // Haptic feedback immediately
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Background: Log event (fire-and-forget) and update via Outbox
    try {
      // Log the event (fire-and-forget, no await)
      void logSoldFinished(
        activeOwnerId,
        item.id,
        item.barcode_snapshot || item.product_barcode || undefined,
        item.product_name || undefined
      );
      
      // Mark item as resolved via Outbox (will remove immediately + 5s undo)
      await updateItem({
        itemId: item.id,
        updates: { status: 'resolved' as any, resolved_reason: 'sold' },
      });
      
      // Success haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[ExpiredScreen] Error handling sold/finished:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [activeOwnerId, updateItem]);

  // Handle thrown action
  const handleThrown = useCallback(async (item: Item) => {
    if (!activeOwnerId) return;
    
    // Haptic feedback immediately
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Background: Log event (fire-and-forget) and update via Outbox
    try {
      // Log the event (fire-and-forget, no await)
      void logThrown(
        activeOwnerId,
        item.id,
        item.barcode_snapshot || item.product_barcode || undefined,
        item.product_name || undefined
      );
      
      // Mark item as resolved via Outbox (will remove immediately + 5s undo)
      await updateItem({
        itemId: item.id,
        updates: { status: 'resolved' as any, resolved_reason: 'disposed' },
      });
      
      // Success haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[ExpiredScreen] Error handling thrown:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [activeOwnerId, updateItem]);

  // Handle delete action with Outbox + Undo
  const handleDelete = useCallback(async (item: Item) => {
    // Guard against missing owner
    if (!activeOwnerId) return;
    
    // Haptic feedback immediately
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      // Delete via Outbox (soft-delete with undo)
      await deleteItem(item.id);
      
      // Success haptic (snackbar managed by hook)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[ExpiredScreen] Error deleting item:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [activeOwnerId, deleteItem]);

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

        {showSkeleton ? (
          <SkeletonItemList count={8} />
        ) : (
          <CategoryCardList
            items={filteredItems}
            loading={ownerLoading}
            error={error}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            searchQuery={searchQuery}
            emptyMessage={t('screens.expired.empty')}
            sortDirection="desc"
            showExpiryActions
            onSoldFinished={handleSoldFinished}
            onThrown={handleThrown}
          />
        )}
      </View>
      <Trial7DayReminderDialog />
      <TrialReminderDialog />
      <TrialEndedDialog />
      
      {/* Snackbar with Undo for Delete */}
      {canUndoDelete && (
        <Snackbar
          visible={true}
          onDismiss={() => {
            // Note: actual cleanup happens in hook timer
          }}
          duration={5000}
          action={{
            label: t('common.cancel'),
            onPress: () => {
              undoDelete();
            },
          }}
          style={{ marginBottom: insets.bottom + 70 }}
        >
          {t('common.product_deleted')}
        </Snackbar>
      )}

      {/* Snackbar with Undo for Resolve (Sold/Thrown) */}
      {canUndoResolve && (
        <Snackbar
          visible={true}
          onDismiss={() => {
            // Note: actual cleanup happens in hook timer
          }}
          duration={5000}
          action={{
            label: t('common.cancel'),
            onPress: () => {
              undoResolve();
            },
          }}
          style={{ marginBottom: insets.bottom + 70 }}
        >
          {t('common.item_resolved')}
        </Snackbar>
      )}
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
  snackbar: {
    backgroundColor: '#22C55E',
    marginBottom: 100,
  },
  undoContainer: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  undoCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  undoButton: {
    backgroundColor: 'transparent',
    marginVertical: 0,
    marginHorizontal: 0,
    paddingHorizontal: 0,
  },
  undoButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60A5FA',
    marginHorizontal: 0,
  },
  undoMessage: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  });
}

