/**
 * Notifications History Screen
 * Shows all notifications sent to the user
 * 
 * Features:
 * - Instant display from cache
 * - Background refresh when stale (60s)
 * - Small loading indicator instead of full screen loading
 * - Pagination with infinite scroll
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { IconButton, Text, Card } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useNotificationsHistory } from '@/lib/hooks/useNotificationsHistory';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificationHistory } from '@/lib/supabase/queries/notifications';

export default function NotificationsHistoryScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const { user } = useAuth();
  const { activeOwnerId } = useActiveOwner();
  const { hasNew, markSeen } = useNotificationBadge();
  const insets = useSafeAreaInsets();
  
  // Use the new hook with caching and pagination
  const {
    notifications,
    isLoading,
    isFetching,
    isRefreshing,
    isLoadingMore,
    hasMore,
    hasInitialized,
    refresh,
    loadMore,
  } = useNotificationsHistory({
    userId: user?.id,
    ownerId: activeOwnerId || undefined,
    enabled: !!user?.id && !!activeOwnerId,
  });

  const [tappedIds, setTappedIds] = useState<Set<string>>(new Set());
  const [lastTappedAt, setLastTappedAt] = useState<string | null>(null);

  const STORAGE_KEY = useMemo(() => {
    if (!user?.id || !activeOwnerId) return null;
    return `notif_last_tapped_${user.id}_${activeOwnerId}`;
  }, [user?.id, activeOwnerId]);

  // Load last tapped timestamp on focus
  useFocusEffect(
    useCallback(() => {
      if (STORAGE_KEY) {
        AsyncStorage.getItem(STORAGE_KEY)
          .then((saved) => {
            if (saved) {
              setLastTappedAt(saved);
            }
          })
          .catch(() => {
            // Ignore errors
          });
      }
    }, [STORAGE_KEY])
  );

  // Load last tapped timestamp on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!STORAGE_KEY) return;
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled) setLastTappedAt(saved);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [STORAGE_KEY]);

  const isUnread = (n: NotificationHistory) => {
    // Check if notification is in current session's tappedIds (immediate UI feedback)
    if (tappedIds.has(n.id)) {
      return false; // Already marked as read in this session
    }
    
    // Check against persisted lastTappedAt (for persistence across restarts)
    if (!lastTappedAt) {
      return true; // No read notifications yet, so this is unread
    }
    
    // Compare timestamps - notification is unread if created AFTER lastTappedAt
    const created = new Date(n.created_at).getTime();
    const last = new Date(lastTappedAt).getTime();
    return created > last;
  };

  const handleMarkAsRead = async (notification: NotificationHistory) => {
    // Immediately update UI state for instant feedback
    setTappedIds(prev => new Set(prev).add(notification.id));
    
    // Determine the new lastTappedAt value
    const notificationTime = new Date(notification.created_at).getTime();
    const currentTime = lastTappedAt ? new Date(lastTappedAt).getTime() : 0;
    
    let newLastTappedAt: string;
    if (notificationTime >= currentTime) {
      const adjustedTime = notificationTime + 1;
      newLastTappedAt = new Date(adjustedTime).toISOString();
    } else {
      newLastTappedAt = lastTappedAt!;
    }
    
    if (STORAGE_KEY) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, newLastTappedAt);
        setLastTappedAt(newLastTappedAt);
      } catch (error) {
        console.error('Error saving lastTappedAt:', error);
      }
    } else {
      setLastTappedAt(newLastTappedAt);
    }
  };

  const unreadCount = notifications.filter(isUnread).length;

  const handleMarkAllAsRead = async () => {
    if (notifications.length && STORAGE_KEY) {
      const newest = notifications
        .map(n => n.created_at)
        .sort()
        .slice(-1)[0];
      if (newest) {
        await AsyncStorage.setItem(STORAGE_KEY, newest);
        setLastTappedAt(newest);
        setTappedIds(new Set());
      }
    }
  };

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [hasMore, isLoadingMore, loadMore]);

  const renderNotification = ({ item: notification }: { item: NotificationHistory }) => {
    const unread = isUnread(notification);
    return (
      <Card
        style={[
          styles.notificationCard,
          unread && styles.unreadCard,
        ]}
        onPress={() => {
          handleMarkAsRead(notification);
          router.push({
            pathname: '/notification/[id]',
            params: { id: notification.id },
          } as any);
        }}
      >
        <Card.Content>
          <View style={[styles.notificationHeader, rtlContainer]}>
            <View style={styles.notificationContent}>
              <Text
                variant="titleMedium"
                style={[
                  styles.notificationTitle,
                  rtlText,
                  unread && styles.unreadTitle,
                ]}
              >
                {notification.title}
              </Text>
              <Text
                variant="bodyMedium"
                style={[styles.notificationBody, rtlText]}
              >
                {notification.body}
              </Text>
              <Text
                variant="bodySmall"
                style={[styles.notificationDate, getRtlTextStyles(isRTL, 'date')]}
              >
                {format(new Date(notification.created_at), 'd MMM yyyy, HH:mm')}
              </Text>
            </View>
            {unread && (
              <View style={styles.unreadDot} />
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  // Determine what to show when list is empty
  const renderListEmpty = () => {
    // Show empty state ONLY if:
    // 1. We have valid user/owner IDs
    // 2. We've completed at least one fetch (hasInitialized)
    // 3. We're not currently loading/fetching
    // 4. There are no notifications
    const canShowEmptyState = 
      user?.id && 
      activeOwnerId && 
      hasInitialized && 
      !isFetching && 
      !isLoading && 
      notifications.length === 0;
    
    if (canShowEmptyState) {
      return (
        <View style={styles.center}>
          <Text style={[styles.emptyText, rtlText]}>
            {t('settings.notifications.empty') || 'אין התראות'}
          </Text>
        </View>
      );
    }
    
    // Otherwise show skeleton placeholder when list is empty
    if (notifications.length === 0) {
      return (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3].map((i) => (
            <Card key={i} style={styles.skeletonCard}>
              <Card.Content>
                <View style={styles.skeletonTitle} />
                <View style={styles.skeletonBody} />
                <View style={styles.skeletonBody2} />
                <View style={styles.skeletonDate} />
              </Card.Content>
            </Card>
          ))}
        </View>
      );
    }
    
    return null;
  };

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={THEME_COLORS.primary} />
      </View>
    );
  };

  // Show small indicator when fetching in background (with existing data)
  const showFetchingIndicator = (isFetching || isLoading) && !isRefreshing && notifications.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8F9FA' }]} edges={[]}>
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={THEME_COLORS.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <IconButton
                icon="arrow-right"
                size={24}
                onPress={() => router.back()}
                iconColor="#FFFFFF"
                style={styles.headerIcon}
              />
            </View>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>
                {t('settings.notifications.history') || 'היסטוריית התראות'}
              </Text>
            </View>
            {/* Show small fetching indicator */}
            <View style={styles.headerRight}>
              {showFetchingIndicator && (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
              )}
            </View>
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.headerCount}>
              {notifications.length} {notifications.length === 1 ? t('settings.notifications.notification') : t('settings.notifications.notifications')}
              {unreadCount > 0 && ` • ${unreadCount} ${unreadCount === 1 ? t('settings.notifications.unread') : t('settings.notifications.unreadPlural')}`}
            </Text>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={handleMarkAllAsRead}
                style={styles.markAllButton}
              >
                <Text style={styles.markAllText}>
                  {t('settings.notifications.markAllRead') || 'סמן הכל כנקרא'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      </View>

      <View style={styles.content}>
        {/* Always show the list - never use full screen loading guard */}
        <FlatList
          data={notifications ?? []}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            // Use emptyContainer only for actual empty state (not for loading skeleton)
            notifications.length === 0 && hasInitialized && !isFetching && !isLoading
              ? styles.emptyContainer 
              : styles.listContainer
          }
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
          }
          ListEmptyComponent={renderListEmpty}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
        />
      </View>
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
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 4,
    },
    header: {
      paddingBottom: 14,
      paddingHorizontal: 20,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
      minHeight: 48,
    },
    headerIcon: {
      margin: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      borderRadius: 12,
      minWidth: 36,
      minHeight: 36,
      width: 36,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      minWidth: 88,
      zIndex: 1,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      minWidth: 88,
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
      top: 0,
      right: 0,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#FF3B30',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.9)',
    },
    headerTitle: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
      textShadowColor: 'rgba(0, 0, 0, 0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    headerContent: {
      alignItems: 'center',
      paddingTop: 2,
    },
    headerCount: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      textShadowColor: 'rgba(0, 0, 0, 0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
      letterSpacing: 0.5,
      textAlign: 'center',
    },
    markAllButton: {
      marginTop: 8,
      paddingVertical: 6,
      paddingHorizontal: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      borderRadius: 16,
    },
    markAllText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
      opacity: 0.95,
    },
    content: {
      flex: 1,
      backgroundColor: '#F8F9FA',
      marginTop: 0,
    },
    listContainer: {
      padding: 16,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 32,
    },
    emptyText: {
      fontSize: 16,
      color: '#9E9E9E',
    },
    loadingText: {
      fontSize: 14,
      color: '#9E9E9E',
    },
    skeletonContainer: {
      padding: 16,
      width: '100%',
    },
    skeletonCard: {
      marginBottom: 12,
      borderRadius: 12,
      elevation: 2,
    },
    skeletonTitle: {
      height: 18,
      backgroundColor: '#E0E0E0',
      borderRadius: 4,
      marginBottom: 12,
      width: 180,
    },
    skeletonBody: {
      height: 14,
      backgroundColor: '#EEEEEE',
      borderRadius: 4,
      marginBottom: 6,
      width: 260,
    },
    skeletonBody2: {
      height: 14,
      backgroundColor: '#EEEEEE',
      borderRadius: 4,
      marginBottom: 8,
      width: 200,
    },
    skeletonDate: {
      height: 12,
      backgroundColor: '#F5F5F5',
      borderRadius: 4,
      marginTop: 8,
      width: 120,
    },
    notificationCard: {
      marginBottom: 12,
      elevation: 2,
      borderRadius: 12,
    },
    unreadCard: {
      backgroundColor: '#E3F2FD',
      borderLeftWidth: 4,
      borderLeftColor: '#42A5F5',
    },
    notificationHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    notificationContent: {
      flex: 1,
    },
    notificationTitle: {
      fontWeight: '600',
      marginBottom: 4,
    },
    unreadTitle: {
      fontWeight: '700',
    },
    notificationBody: {
      marginBottom: 8,
      color: '#424242',
    },
    notificationDate: {
      color: '#9E9E9E',
      marginTop: 4,
    },
    unreadDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#42A5F5',
      marginStart: 8,
      marginTop: 4,
    },
    footerLoader: {
      paddingVertical: 16,
      alignItems: 'center',
    },
  });
}
