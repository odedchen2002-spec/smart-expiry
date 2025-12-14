/**
 * Notification Details Screen
 * Shows detailed information about a specific notification
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import {
  Appbar,
  Text,
  Card,
  Chip,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { getNotificationHistory } from '@/lib/supabase/queries/notifications';
import { getItems } from '@/lib/supabase/queries/items';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@/types/database';

type Item = Database['public']['Views']['items_with_details']['Row'];

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  data?: any;
  read: boolean;
  created_at: string;
}

export default function NotificationDetailsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const { activeOwnerId } = useActiveOwner();
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const styles = createStyles(isRTL);
  const params = useLocalSearchParams<{ id?: string }>();
  const notificationId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [notification, setNotification] = useState<NotificationItem | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [lastTappedAt, setLastTappedAt] = useState<string | null>(null);
  const [isRead, setIsRead] = useState(false);

  const STORAGE_KEY = useMemo(() => {
    if (!user?.id || !activeOwnerId) return null;
    return `notif_last_tapped_${user.id}_${activeOwnerId}`;
  }, [user?.id, activeOwnerId]);

  // Load lastTappedAt from storage
  useEffect(() => {
    if (!STORAGE_KEY) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) {
          setLastTappedAt(saved);
        }
      })
      .catch(() => {
        // Ignore errors
      });
  }, [STORAGE_KEY]);

  // Calculate read state
  useEffect(() => {
    if (!notification) {
      setIsRead(false);
      return;
    }

    if (!lastTappedAt) {
      // If no lastTappedAt yet, check if we're about to mark it as read
      // For now, show as unread - it will update when markAsRead completes
      setIsRead(false);
      return;
    }

    const created = new Date(notification.created_at).getTime();
    const last = new Date(lastTappedAt).getTime();
    // Notification is read if created at or before lastTappedAt
    setIsRead(created <= last);
  }, [notification, lastTappedAt]);

  // Mark notification as read when screen opens
  useEffect(() => {
    if (!notification || !STORAGE_KEY || !user?.id || !activeOwnerId) return;

    const markAsRead = async () => {
      // Load current lastTappedAt from storage to get the latest value
      let currentLastTappedAt: string | null = null;
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        currentLastTappedAt = saved;
      } catch (error) {
        console.error('Error reading lastTappedAt:', error);
      }

      const notificationTime = new Date(notification.created_at).getTime();
      const currentTime = currentLastTappedAt ? new Date(currentLastTappedAt).getTime() : 0;

      // Determine the new lastTappedAt value
      let newLastTappedAt: string;
      if (notificationTime >= currentTime) {
        // Add 1ms to ensure this notification is always considered read
        const adjustedTime = notificationTime + 1;
        newLastTappedAt = new Date(adjustedTime).toISOString();
      } else {
        // Keep current lastTappedAt (notification is older)
        newLastTappedAt = currentLastTappedAt || notification.created_at;
      }

      // Persist the update
      try {
        await AsyncStorage.setItem(STORAGE_KEY, newLastTappedAt);
        // Update lastTappedAt state - this will trigger the isRead calculation effect
        setLastTappedAt(newLastTappedAt);
        // Also update isRead immediately to ensure UI updates right away
        // The notification is always read after we mark it
        setIsRead(true);
      } catch (error) {
        console.error('Error saving lastTappedAt:', error);
      }
    };

    markAsRead();
  }, [notification?.id, STORAGE_KEY, user?.id, activeOwnerId]); // Only run when notification ID changes

  useEffect(() => {
    if (!user?.id || !activeOwnerId || !notificationId) return;

    const loadNotification = async () => {
      try {
        setLoading(true);
        const notifications = await getNotificationHistory(user.id, activeOwnerId);
        const found = notifications.find(n => n.id === notificationId);
        setNotification(found || null);
        
        // Load items if notification has targetDate in data
        if (found?.data?.targetDate && activeOwnerId) {
          setLoadingItems(true);
          try {
            const targetDate = found.data.targetDate;
            const notificationItems = await getItems({
              ownerId: activeOwnerId,
              startDate: targetDate,
              endDate: targetDate,
              limit: 100,
            });
            // Filter out resolved and expired items (same as notification logic)
            const activeItems = (notificationItems || []).filter(
              item => item.status !== 'resolved' && item.status !== 'expired'
            );
            setItems(activeItems);
          } catch (error) {
            console.error('Error loading notification items:', error);
          } finally {
            setLoadingItems(false);
          }
        }
      } catch (error) {
        console.error('Error loading notification:', error);
      } finally {
        setLoading(false);
      }
    };

    loadNotification();
  }, [user?.id, activeOwnerId, notificationId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title={t('settings.notifications.details') || 'פרטי התראה'} />
        </Appbar.Header>
        <View style={styles.center}>
          <Text style={rtlText}>
            {t('common.loading') || 'טוען...'}
          </Text>
        </View>
      </View>
    );
  }

  if (!notification) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title={t('settings.notifications.details') || 'פרטי התראה'} />
        </Appbar.Header>
        <View style={styles.center}>
          <Text style={[styles.errorText, rtlText]}>
            {t('settings.notifications.notFound') || 'התראה לא נמצאה'}
          </Text>
        </View>
      </View>
    );
  }

  const formattedDateShort = format(new Date(notification.created_at), 'd MMM yyyy, HH:mm');

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.notifications.details') || 'פרטי התראה'} />
      </Appbar.Header>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Main Notification Card */}
        <Card style={styles.mainCard}>
          <Card.Content style={styles.mainCardContent}>
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <Text
                  variant="headlineSmall"
                  style={[styles.title, rtlTextCenter]}
                >
                  {notification.title}
                </Text>
                <View style={styles.metaRow}>
                  <Chip
                    icon="bell"
                    style={styles.typeChip}
                    textStyle={styles.typeChipText}
                    mode="flat"
                  >
                    {notification.notification_type === 'expiry_reminder'
                      ? (t('settings.notifications.expiryReminder') || 'תזכורת תפוגה')
                      : notification.notification_type}
                  </Chip>
                  {!isRead && (
                    <Chip
                      icon="circle"
                      style={styles.unreadChip}
                      textStyle={styles.unreadChipText}
                      mode="flat"
                    >
                      {t('settings.notifications.unread') || 'לא נקרא'}
                    </Chip>
                  )}
                </View>
              </View>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.bodySection}>
              <Text
                variant="bodyLarge"
                style={[styles.bodyText, rtlTextCenter]}
              >
                {notification.body}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Details Card */}
        <Card style={styles.detailsCard}>
          <Card.Content style={styles.detailsCardContent}>
            <Text
              variant="titleMedium"
              style={[styles.sectionTitle, rtlTextCenter]}
            >
              {t('settings.notifications.details') || 'פרטים'}
            </Text>

            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Text variant="bodyMedium" style={[styles.detailLabel, rtlTextCenter]}>
                  {t('settings.notifications.date') || 'תאריך ושעה'}
                </Text>
                <Text variant="bodyLarge" style={[styles.detailValue, rtlTextCenter]}>
                  {formattedDateShort}
                </Text>
              </View>

              <View style={styles.detailItem}>
                <Text variant="bodyMedium" style={[styles.detailLabel, rtlTextCenter]}>
                  {t('settings.notifications.status') || 'סטטוס'}
                </Text>
                <View style={styles.statusChipContainer}>
                  <Chip
                    icon={isRead ? 'check-circle' : 'circle'}
                    style={[
                      isRead ? styles.readChip : styles.unreadStatusChip,
                    ]}
                    textStyle={[
                      isRead ? styles.readChipText : styles.unreadStatusChipText,
                      rtlTextCenter,
                    ]}
                    mode="flat"
                    compact
                  >
                    {isRead
                      ? (t('settings.notifications.read') || 'נקרא')
                      : (t('settings.notifications.unread') || 'לא נקרא')}
                  </Chip>
                </View>
              </View>

            </View>
          </Card.Content>
        </Card>

        {/* Items Card */}
        {notification.data?.targetDate && (
          <Card style={styles.itemsCard}>
            <Card.Content style={styles.itemsCardContent}>
              <Text
                variant="titleMedium"
                style={[styles.sectionTitle, rtlTextCenter]}
              >
                {t('settings.notifications.items') || 'מוצרים בהתראה'}
              </Text>

              {loadingItems ? (
                <View style={styles.itemsLoadingContainer}>
                  <ActivityIndicator size="small" color="#42A5F5" />
                  <Text variant="bodySmall" style={[styles.itemsLoadingText, rtlText]}>
                    {t('common.loading') || 'טוען...'}
                  </Text>
                </View>
              ) : items.length === 0 ? (
                <Text variant="bodyMedium" style={[styles.noItemsText, rtlText]}>
                  {t('settings.notifications.noItems') || 'לא נמצאו מוצרים'}
                </Text>
              ) : (
                <View style={styles.itemsList}>
                  {items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => router.push(`/item/${item.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.itemRow, getRtlContainerStyles(isRTL)]}>
                        <View style={styles.itemInfo}>
                          <Text
                            variant="titleSmall"
                            style={[styles.itemName, rtlText]}
                            numberOfLines={1}
                          >
                            {item.product_name || t('item.name') || 'מוצר ללא שם'}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={[styles.itemExpiry, getRtlTextStyles(isRTL, 'date')]}
                          >
                            {format(new Date(item.expiry_date), 'd MMM yyyy')}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: getStatusColor(item.status) },
                          ]}
                        />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ok':
      return '#4CAF50';
    case 'soon':
      return '#FF9800';
    case 'expired':
      return '#F44336';
    case 'resolved':
      return '#9E9E9E';
    default:
      return '#9E9E9E';
  }
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#B00020',
  },
  // Main Card
  mainCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  mainCardContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 12,
    alignItems: 'center',
  },
  headerContent: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 10,
    lineHeight: 26,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeChip: {
    backgroundColor: '#E3F2FD',
    height: 32,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1976D2',
  },
  unreadChip: {
    backgroundColor: '#FFEBEE',
    height: 32,
  },
  unreadChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#C62828',
  },
  divider: {
    marginVertical: 12,
    backgroundColor: '#E0E0E0',
  },
  bodySection: {
    marginTop: 0,
    alignItems: 'center',
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#424242',
    textAlign: 'center',
  },
  // Details Card
  detailsCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  detailsCardContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
    textAlign: 'center',
  },
  detailRow: {
    gap: 16,
    alignItems: 'center',
  },
  detailItem: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 0,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#757575',
    marginBottom: 6,
    textAlign: 'center',
  },
  detailValue: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '600',
    textAlign: 'center',
  },
  statusChipContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  readChip: {
    backgroundColor: '#E8F5E9',
    height: 32,
    minWidth: 80,
  },
  readChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2E7D32',
    textAlign: 'center',
  },
  unreadStatusChip: {
    backgroundColor: '#FFEBEE',
    height: 32,
    minWidth: 80,
  },
  unreadStatusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C62828',
    textAlign: 'center',
  },
  dataContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  dataText: {
    fontSize: 13,
    color: '#616161',
    fontFamily: 'monospace',
  },
  // Items Card
  itemsCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  itemsCardContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemsLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  itemsLoadingText: {
    fontSize: 13,
    color: '#757575',
  },
  noItemsText: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 12,
  },
  itemsList: {
    marginTop: 4,
    gap: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  itemInfo: {
    flex: 1,
    ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }),
    alignItems: isRTL ? 'flex-end' : 'flex-start',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
    textAlign: isRTL ? 'right' : 'left',
  },
  itemExpiry: {
    fontSize: 13,
    color: '#757575',
    textAlign: isRTL ? 'right' : 'left',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  });
}

