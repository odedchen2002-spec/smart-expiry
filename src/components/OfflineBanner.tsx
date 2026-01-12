/**
 * Offline banner component that shows when the device is offline
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Animated, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import { getPendingCount, addQueueChangeListener } from '@/lib/offline/offlineQueue';

interface OfflineBannerProps {
  showPendingCount?: boolean;
}

export function OfflineBanner({ showPendingCount = true }: OfflineBannerProps) {
  const { t } = useLanguage();
  const { isOffline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [slideAnim] = useState(new Animated.Value(-60));

  // Load pending count
  useEffect(() => {
    const loadCount = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    };
    loadCount();

    // Subscribe to queue changes
    const unsubscribe = addQueueChangeListener((queue) => {
      setPendingCount(queue.items.length);
    });

    return () => unsubscribe();
  }, []);

  // Animate banner in/out
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOffline ? 0 : -60,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [isOffline, slideAnim]);

  if (!isOffline && pendingCount === 0) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.content}>
        <MaterialCommunityIcons
          name={isOffline ? 'wifi-off' : 'cloud-sync'}
          size={20}
          color="#fff"
        />
        <Text style={styles.text}>
          {isOffline
            ? t('offline.youAreOffline')
            : t('offline.syncing')}
        </Text>
        {showPendingCount && pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>
      {isOffline && pendingCount > 0 && (
        <Text style={styles.subText}>
          {t('offline.pendingItems', { count: pendingCount })}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  subText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
});

