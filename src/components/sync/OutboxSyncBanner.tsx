/**
 * OutboxSyncBanner - Shows sync status when operations are pending
 * 
 * Displays:
 * - "Syncing X operations..." when processing
 * - "X operations pending" when offline with pending operations
 * - Nothing when queue is empty
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOutboxStats } from '@/lib/outbox/useOutboxStats';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';

export function OutboxSyncBanner() {
  const { t, isRTL } = useLanguage();
  const { hasPending, pendingCount, processingCount, failedCount, isProcessing } = useOutboxStats();
  const { isOffline } = useNetworkStatus();

  // Don't show banner if no pending operations
  if (!hasPending) {
    return null;
  }

  // Show processing state
  if (isProcessing) {
    return (
      <Surface style={styles.banner} elevation={1}>
        <View style={[styles.content, isRTL && styles.contentRTL]}>
          <ActivityIndicator size="small" color={THEME_COLORS.primary} />
          <Text style={styles.text}>
            {t('sync.syncing') || 'מסנכרן'} {pendingCount} {t('sync.operations') || 'פעולות'}...
          </Text>
        </View>
      </Surface>
    );
  }

  // Show offline state with pending count
  if (isOffline) {
    return (
      <Surface style={[styles.banner, styles.offlineBanner]} elevation={1}>
        <View style={[styles.content, isRTL && styles.contentRTL]}>
          <MaterialCommunityIcons name="cloud-off-outline" size={18} color="#F59E0B" />
          <Text style={styles.text}>
            {pendingCount} {t('sync.pendingOperations') || 'פעולות ממתינות'} 
            {failedCount > 0 && ` (${failedCount} ${t('sync.failed') || 'נכשלו'})`}
          </Text>
        </View>
      </Surface>
    );
  }

  // Show pending state (online but not yet processed)
  return (
    <Surface style={[styles.banner, styles.pendingBanner]} elevation={1}>
      <View style={[styles.content, isRTL && styles.contentRTL]}>
        <MaterialCommunityIcons name="clock-outline" size={18} color="#3B82F6" />
        <Text style={styles.text}>
          {pendingCount} {t('sync.pendingSync') || 'ממתינות לסנכרון'}
        </Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#F0F9FF',
    borderRadius: 0,
    marginBottom: 0,
  },
  offlineBanner: {
    backgroundColor: '#FFFBEB',
  },
  pendingBanner: {
    backgroundColor: '#EFF6FF',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  contentRTL: {
    flexDirection: 'row-reverse',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1F2937',
    flex: 1,
  },
});
