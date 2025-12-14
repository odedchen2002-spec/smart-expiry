/**
 * Notifications History Screen
 * Shows all notifications sent to the user
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { IconButton, Text, Card } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { getNotificationHistory } from '@/lib/supabase/queries/notifications';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase/client';
import { useCallback } from 'react';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  data?: any;
  read: boolean;
  created_at: string;
}

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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tappedIds, setTappedIds] = useState<Set<string>>(new Set());
  const [lastTappedAt, setLastTappedAt] = useState<string | null>(null);
  const [timeString, setTimeString] = useState<string>(
    new Date().toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  );
  const [dateString, setDateString] = useState<string>(
    new Date().toLocaleDateString(isRTL ? 'he-IL' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeString(new Date().toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' }));
      setDateString(
        new Date().toLocaleDateString(isRTL ? 'he-IL' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })
      );
    }, 1000 * 30);
    return () => clearInterval(interval);
  }, [isRTL]);

  const STORAGE_KEY = useMemo(() => {
    if (!user?.id || !activeOwnerId) return null;
    return `notif_last_tapped_${user.id}_${activeOwnerId}`;
  }, [user?.id, activeOwnerId]);

  const loadNotifications = useCallback(async () => {
    if (!user?.id || !activeOwnerId) return;

    try {
      const data = await getNotificationHistory(user.id, activeOwnerId);
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, activeOwnerId]);

  useEffect(() => {
    loadNotifications();
  }, [user?.id, activeOwnerId]);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user?.id && activeOwnerId) {
        // Reload lastTappedAt from storage FIRST to ensure read state is correct
        // This must happen before loadNotifications so the isUnread check works correctly
        if (STORAGE_KEY) {
          AsyncStorage.getItem(STORAGE_KEY)
            .then((saved) => {
              if (saved) {
                setLastTappedAt(saved);
              }
            })
            .catch(() => {
              // Ignore errors
            })
            .finally(() => {
              // Reload notifications after lastTappedAt is loaded
              loadNotifications();
            });
        } else {
          // If no storage key, just reload notifications
          loadNotifications();
        }
      }
    }, [user?.id, activeOwnerId, STORAGE_KEY, loadNotifications])
  );

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!user?.id || !activeOwnerId) return;

    const channel = supabase
      .channel(`notif_history_${user.id}_${activeOwnerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_sent_log',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Only reload if the notification is for the current owner
          if ((payload.new as any)?.owner_id === activeOwnerId) {
            console.log('[Notifications History] New notification detected, reloading...');
            // Use a small delay to ensure the database transaction is committed
            setTimeout(() => {
              loadNotifications();
            }, 100);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeOwnerId, loadNotifications]);

  // Load last tapped timestamp for unread logic
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
  };

  const isUnread = (n: NotificationItem) => {
    // Check if notification is in current session's tappedIds (immediate UI feedback)
    if (tappedIds.has(n.id)) {
      return false; // Already marked as read in this session
    }
    
    // Check against persisted lastTappedAt (for persistence across restarts)
    if (!lastTappedAt) {
      return true; // No read notifications yet, so this is unread
    }
    
    // Compare timestamps - notification is unread if created AFTER lastTappedAt
    // Since we add 1ms to lastTappedAt when setting it, notifications created at or before that time are read
    const created = new Date(n.created_at).getTime();
    const last = new Date(lastTappedAt).getTime();
    // Notification is unread only if it was created strictly after lastTappedAt
    return created > last;
  };

  const handleMarkAsRead = async (notification: NotificationItem) => {
    // Immediately update UI state for instant feedback
    setTappedIds(prev => new Set(prev).add(notification.id));
    
    // Determine the new lastTappedAt value
    // Use the notification's created_at directly to avoid timestamp conversion issues
    const notificationTime = new Date(notification.created_at).getTime();
    const currentTime = lastTappedAt ? new Date(lastTappedAt).getTime() : 0;
    
    // Use the maximum timestamp to ensure all older notifications are marked as read
    let newLastTappedAt: string;
    if (notificationTime >= currentTime) {
      // Add 1ms to the notification's timestamp to ensure this notification itself is always considered read
      // This handles edge cases where timestamp comparisons might have precision issues
      const adjustedTime = notificationTime + 1;
      newLastTappedAt = new Date(adjustedTime).toISOString();
    } else {
      // Keep current lastTappedAt (notification is older)
      newLastTappedAt = lastTappedAt;
    }
    
    // Persist the update
    if (STORAGE_KEY) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, newLastTappedAt);
        // Update state immediately for UI
        setLastTappedAt(newLastTappedAt);
      } catch (error) {
        console.error('Error saving lastTappedAt:', error);
      }
    } else {
      // Even without storage key, update state for immediate UI feedback
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

  const renderNotification = ({ item: notification }: { item: NotificationItem }) => {
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

  const renderEmpty = () => (
    <View style={styles.center}>
      <Text style={[styles.emptyText, rtlText]}>
        {t('settings.notifications.empty') || 'אין התראות'}
      </Text>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.center}>
      <Text style={rtlText}>
        {t('common.loading') || 'טוען...'}
      </Text>
    </View>
  );

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
                  // Already on notifications history, no need to navigate
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
          <Text style={styles.headerLabel}>
            {t('settings.notifications.history') || 'היסטוריית התראות'}
          </Text>
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
        {loading ? (
          renderLoading()
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderNotification}
            keyExtractor={(item) => item.id}
            contentContainerStyle={
              notifications.length === 0 ? styles.emptyContainer : styles.listContainer
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
          />
        )}
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
    shadowOffset: { width: 0, height: 3 }, // Soft bottom shadow
    shadowOpacity: 0.08, // Very gentle shadow strength
    shadowRadius: 14, // Soft blur for polished separation
    elevation: 4, // Reduced for subtlety
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
  headerDate: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
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
    paddingTop: 2,
  },
  headerLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
    marginBottom: 4,
    letterSpacing: 0.3,
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
  });
}

