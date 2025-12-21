/**
 * Home Screen - 3-Second Dashboard
 * 
 * Compact color-coded counts for quick status overview:
 * 🔴 Red = already expired
 * 🟠 Orange = expiring today
 * 🟡 Yellow = expiring this week
 * 🟢 Green = OK (future items)
 * 
 * Primary CTA: Fast Scan button
 */

import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { useItems } from '@/lib/hooks/useItems';
import { getUnresolvedPendingItemsCount } from '@/lib/supabase/services/pendingItemsService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Status colors matching the spec
const STATUS_COLORS = {
  expired: '#EF4444', // Red - already expired
  today: '#F97316',   // Orange - expiring today
  week: '#EAB308',    // Yellow - expiring this week
  ok: '#22C55E',      // Green - OK
};

interface CompactStatusRowProps {
  icon: string;
  label: string;
  count: number;
  color: string;
  isRTL?: boolean;
}

// Compact status row - readable but minimal
function CompactStatusRow({ icon, label, count, color, isRTL }: CompactStatusRowProps) {
  return (
    <View style={[styles.statusRow, isRTL && styles.statusRowRTL]}>
      <View style={[styles.statusRowLeft, isRTL && styles.statusRowLeftRTL]}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
        <Text style={styles.statusLabel}>{label}</Text>
      </View>
      <Text style={[styles.statusCount, { color }]}>{count}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasNew, markSeen } = useNotificationBadge();
  const { activeOwnerId, isViewer } = useActiveOwner();

  // Pending items count (from supplier intake)
  const [pendingItemsCount, setPendingItemsCount] = useState(0);

  // Fetch all items for counting
  const { items: allItems, refetch: refetchAll, loading } = useItems({
    scope: 'all',
    ownerId: activeOwnerId || undefined,
    autoFetch: !!activeOwnerId,
  });

  // Fetch expired items separately
  const { items: expiredItems, refetch: refetchExpired } = useItems({
    scope: 'expired',
    ownerId: activeOwnerId || undefined,
    autoFetch: !!activeOwnerId,
  });

  // Stale data refresh on focus
  const lastFetchRef = useRef<number>(0);
  const STALE_TIME = 30000; // 30 seconds

  // Fetch pending items count
  const fetchPendingCount = useCallback(async () => {
    if (activeOwnerId) {
      const count = await getUnresolvedPendingItemsCount(activeOwnerId);
      setPendingItemsCount(count);
    }
  }, [activeOwnerId]);

  useFocusEffect(
    useCallback(() => {
      if (activeOwnerId) {
        const now = Date.now();
        if (now - lastFetchRef.current > STALE_TIME || lastFetchRef.current === 0) {
          refetchAll();
          refetchExpired();
          fetchPendingCount();
          lastFetchRef.current = Date.now();
        } else {
          // Always check pending count on focus (might have changed from other screens)
          fetchPendingCount();
        }
      }
    }, [activeOwnerId, refetchAll, refetchExpired, fetchPendingCount])
  );

  // Calculate counts by expiry status
  const counts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    let todayCount = 0;
    let weekCount = 0;
    let okCount = 0;

    allItems.forEach((item) => {
      if (!item.expiry_date) return;
      
      const expiry = new Date(item.expiry_date);
      expiry.setHours(0, 0, 0, 0);

      const expiryTime = expiry.getTime();
      const todayTime = today.getTime();
      const weekTime = nextWeek.getTime();

      if (expiryTime === todayTime) {
        todayCount++;
      } else if (expiryTime > todayTime && expiryTime <= weekTime) {
        weekCount++;
      } else if (expiryTime > weekTime) {
        okCount++;
      }
    });

    return {
      expired: expiredItems.length,
      today: todayCount,
      week: weekCount,
      ok: okCount,
      total: allItems.length + expiredItems.length,
    };
  }, [allItems, expiredItems]);

  const handleScanPress = () => {
    router.push('/fast-scan' as any);
  };

  const handleRefresh = useCallback(() => {
    refetchAll();
    refetchExpired();
    fetchPendingCount();
    lastFetchRef.current = Date.now();
  }, [refetchAll, refetchExpired, fetchPendingCount]);

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
            refreshing={loading}
            onRefresh={handleRefresh}
            colors={[THEME_COLORS.primary]}
            tintColor={THEME_COLORS.primary}
          />
        }
      >
        {/* Status Summary Card */}
        <View style={styles.statusCard}>
          <Text style={[styles.statusCardTitle, isRTL && styles.textRTL]}>
            {t('home.expiryStatus') || 'סטטוס פגי תוקף'}
          </Text>
          
          <View style={styles.statusList}>
            <CompactStatusRow
              icon="alert-circle"
              label={t('status.expired') || 'פג תוקף'}
              count={counts.expired}
              color={STATUS_COLORS.expired}
              isRTL={isRTL}
            />
            <CompactStatusRow
              icon="clock-alert-outline"
              label={t('home.today') || 'היום'}
              count={counts.today}
              color={STATUS_COLORS.today}
              isRTL={isRTL}
            />
            <CompactStatusRow
              icon="calendar-week"
              label={t('home.week') || 'השבוע'}
              count={counts.week}
              color={STATUS_COLORS.week}
              isRTL={isRTL}
            />
            <CompactStatusRow
              icon="check-circle-outline"
              label={t('status.ok') || 'בסדר'}
              count={counts.ok}
              color={STATUS_COLORS.ok}
              isRTL={isRTL}
            />
          </View>
        </View>

        {/* Quick Action - Fast Scan CTA */}
        {!isViewer && (
          <View style={styles.ctaContainer}>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={handleScanPress}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#4A90D9', '#3A7CC8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.scanButtonGradient, isRTL && styles.scanButtonGradientRTL]}
              >
                <MaterialCommunityIcons name="barcode-scan" size={24} color="#FFFFFF" />
                <Text style={styles.scanButtonText}>
                  {t('buttons.scanProduct') || 'סרוק מוצר'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.secondaryButton, isRTL && styles.secondaryButtonRTL]}
              onPress={() => router.push({ pathname: '/add', params: { noBarcode: 'true' } } as any)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#6B7280" />
              <Text style={styles.secondaryButtonText}>
                {t('buttons.addWithoutBarcode') || 'הוסף ללא ברקוד'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.secondaryButton, isRTL && styles.secondaryButtonRTL]}
              onPress={() => router.push('/supplier-intake' as any)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="truck-delivery" size={18} color="#6B7280" />
              <Text style={styles.secondaryButtonText}>
                {t('buttons.supplierIntake') || 'קבלת סחורה'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Floating button for pending items from supplier intake */}
      {pendingItemsCount > 0 && !isViewer && (
        <TouchableOpacity
          style={[
            styles.pendingFloatingButton,
            { bottom: insets.bottom + 90 }, // Above tab bar
            isRTL && styles.pendingFloatingButtonRTL,
          ]}
          onPress={() => router.push('/pending-expiry' as any)}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#F59E0B', '#D97706']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.pendingFloatingButtonGradient, isRTL && styles.pendingFloatingButtonGradientRTL]}
          >
            <MaterialCommunityIcons name="truck-delivery-outline" size={20} color="#FFFFFF" />
            <Text style={styles.pendingFloatingButtonText}>
              {t('buttons.pendingFromSupplier') || 'פריטים מהספק'}
            </Text>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingItemsCount}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  headerWrapper: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
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
    paddingBottom: 120,
  },

  // Status card - compact
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statusCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  textRTL: {
    textAlign: 'right',
  },
  statusList: {
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRowRTL: {
    flexDirection: 'row-reverse',
  },
  statusRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusRowLeftRTL: {
    flexDirection: 'row-reverse',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  statusCount: {
    fontSize: 20,
    fontWeight: '700',
  },

  // CTA
  ctaContainer: {
    alignItems: 'center',
    gap: 12,
  },
  scanButton: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#3A7AB8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  scanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 24,
    gap: 10,
  },
  scanButtonGradientRTL: {
    flexDirection: 'row-reverse',
  },
  scanButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonRTL: {
    flexDirection: 'row-reverse',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },

  // Pending items floating button
  pendingFloatingButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  pendingFloatingButtonRTL: {
    // Same for RTL
  },
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
  pendingBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
