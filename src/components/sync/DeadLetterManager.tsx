/**
 * Dead-Letter Manager - UI for managing permanently failed operations
 * 
 * Shows failed outbox entries and allows:
 * - Manual retry (reset attempts and retry)
 * - Discard (permanently remove without processing)
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Card, Button, Text, Chip, Divider, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { outboxStorage } from '@/lib/outbox/outboxStorage';
import { triggerOutboxProcessing } from '@/providers/QueryProvider';
import type { OutboxEntry } from '@/lib/outbox/outboxTypes';
import { useLanguage } from '@/context/LanguageContext';

interface DeadLetterManagerProps {
  onClose?: () => void;
}

export function DeadLetterManager({ onClose }: DeadLetterManagerProps) {
  const { t, isRTL } = useLanguage();
  const [failedEntries, setFailedEntries] = useState<OutboxEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFailedEntries = async () => {
    try {
      const failed = await outboxStorage.getFailed();
      setFailedEntries(failed);
    } catch (error) {
      console.error('[DeadLetterManager] Error loading failed entries:', error);
    }
  };

  useEffect(() => {
    loadFailedEntries();
    
    // Refresh every 5 seconds
    const intervalId = setInterval(loadFailedEntries, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const handleRetryOne = async (id: string) => {
    setLoading(true);
    try {
      await outboxStorage.retryFailed(id);
      await triggerOutboxProcessing();
      await loadFailedEntries();
      
      Alert.alert(
        t('sync.retrySuccess') || 'Retry Scheduled',
        t('sync.retrySuccessMessage') || 'Operation will be retried'
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardOne = async (id: string, type: string) => {
    Alert.alert(
      t('sync.confirmDiscard') || 'Discard Operation?',
      t('sync.confirmDiscardMessage') || 'This operation will be permanently removed.',
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('sync.discard') || 'Discard',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await outboxStorage.discardFailed(id);
              await loadFailedEntries();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRetryAll = async () => {
    Alert.alert(
      t('sync.retryAll') || 'Retry All?',
      t('sync.retryAllMessage') || `Retry ${failedEntries.length} failed operations?`,
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('sync.retryAll') || 'Retry All',
          onPress: async () => {
            setLoading(true);
            try {
              const count = await outboxStorage.retryAllFailed();
              await triggerOutboxProcessing();
              await loadFailedEntries();
              
              Alert.alert(
                t('sync.retrySuccess') || 'Retry Scheduled',
                `${count} ${t('sync.operations') || 'operations'} ${t('sync.willRetry') || 'will be retried'}`
              );
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDiscardAll = async () => {
    Alert.alert(
      t('sync.discardAll') || 'Discard All?',
      t('sync.discardAllWarning') || `Permanently remove ${failedEntries.length} failed operations? This cannot be undone.`,
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('sync.discardAll') || 'Discard All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await outboxStorage.discardAllFailed();
              await loadFailedEntries();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatOperationType = (type: string) => {
    switch (type) {
      case 'createItem': return t('sync.opCreate') || 'Create';
      case 'updateItem': return t('sync.opUpdate') || 'Update';
      case 'deleteItem': return t('sync.opDelete') || 'Delete';
      default: return type;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return t('sync.justNow') || 'Just now';
    if (minutes < 60) return `${minutes}${t('sync.minutesAgo') || 'm ago'}`;
    if (hours < 24) return `${hours}${t('sync.hoursAgo') || 'h ago'}`;
    return `${days}${t('sync.daysAgo') || 'd ago'}`;
  };

  if (failedEntries.length === 0) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="check-circle" size={64} color="#10B981" />
            <Text style={styles.emptyTitle}>
              {t('sync.noFailedOps') || 'No Failed Operations'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {t('sync.allOpsSuccessful') || 'All operations completed successfully'}
            </Text>
          </View>
        </Card.Content>
        {onClose && (
          <Card.Actions>
            <Button onPress={onClose}>{t('common.close') || 'Close'}</Button>
          </Card.Actions>
        )}
      </Card>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Title
          title={t('sync.failedOperations') || 'Failed Operations'}
          subtitle={`${failedEntries.length} ${t('sync.operations') || 'operations'}`}
          left={(props) => <MaterialCommunityIcons name="alert-circle" size={24} color="#EF4444" {...props} />}
        />
        
        <Card.Content>
          <Text variant="bodySmall" style={styles.description}>
            {t('sync.failedDescription') || 'These operations failed after 5 retry attempts. You can retry or discard them.'}
          </Text>

          <Divider style={styles.divider} />

          {failedEntries.map((entry) => (
            <View key={entry.id} style={styles.entryRow}>
              <View style={styles.entryHeader}>
                <View style={styles.entryInfo}>
                  <View style={styles.entryTitleRow}>
                    <Chip
                      mode="outlined"
                      style={styles.typeChip}
                      textStyle={styles.typeChipText}
                    >
                      {formatOperationType(entry.type)}
                    </Chip>
                    <Text variant="bodySmall" style={styles.timestamp}>
                      {formatTimestamp(entry.lastAttemptAt || entry.createdAt)}
                    </Text>
                  </View>
                  
                  {entry.lastError && (
                    <Text variant="bodySmall" style={styles.errorText} numberOfLines={2}>
                      {entry.lastError}
                    </Text>
                  )}
                  
                  <Text variant="bodySmall" style={styles.attemptsText}>
                    {entry.attempts} {t('sync.attempts') || 'attempts'}
                  </Text>
                </View>

                <View style={styles.entryActions}>
                  <IconButton
                    icon="refresh"
                    size={20}
                    onPress={() => handleRetryOne(entry.id)}
                    disabled={loading}
                  />
                  <IconButton
                    icon="delete"
                    size={20}
                    onPress={() => handleDiscardOne(entry.id, entry.type)}
                    disabled={loading}
                  />
                </View>
              </View>

              <Divider style={styles.entryDivider} />
            </View>
          ))}
        </Card.Content>

        <Card.Actions>
          <Button
            mode="outlined"
            onPress={handleRetryAll}
            disabled={loading}
            icon="refresh"
          >
            {t('sync.retryAll') || 'Retry All'}
          </Button>
          <Button
            mode="outlined"
            onPress={handleDiscardAll}
            disabled={loading}
            icon="delete"
            textColor="#EF4444"
          >
            {t('sync.discardAll') || 'Discard All'}
          </Button>
          {onClose && (
            <Button onPress={onClose}>{t('common.close') || 'Close'}</Button>
          )}
        </Card.Actions>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    margin: 16,
  },
  description: {
    color: '#6B7280',
    marginBottom: 8,
  },
  divider: {
    marginVertical: 12,
  },
  entryRow: {
    marginBottom: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryInfo: {
    flex: 1,
    marginRight: 8,
  },
  entryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  typeChip: {
    height: 24,
  },
  typeChipText: {
    fontSize: 12,
    marginVertical: 0,
  },
  timestamp: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  attemptsText: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryDivider: {
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
});
