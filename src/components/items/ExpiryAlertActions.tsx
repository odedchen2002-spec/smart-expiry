/**
 * Expiry Alert Actions Component
 * 
 * Bottom sheet shown when opening an expiry alert (Level B savings tracking).
 * 
 * Shows:
 * - Product name + expiry info
 * - Question: "What happened?"
 * - Buttons: SOLD/FINISHED, THROWN, UPDATE DATE
 * 
 * On tap:
 * - Insert row into expiry_events
 * - UPDATE DATE creates NEW batch + UPDATED_DATE event
 */

import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Modal, TouchableWithoutFeedback, TouchableOpacity } from 'react-native';
import { Text, Button, IconButton, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { logSoldFinished, logThrown } from '@/lib/supabase/services/expiryEventsService';
import { resolveItem } from '@/lib/supabase/mutations/items';
import * as Haptics from 'expo-haptics';

export interface ExpiryAlertItem {
  id: string;
  productName: string;
  barcode?: string | null;
  expiryDate: string;
  storeId: string;
}

interface ExpiryAlertActionsProps {
  visible: boolean;
  onDismiss: () => void;
  item: ExpiryAlertItem | null;
  onActionComplete?: (action: 'sold' | 'thrown' | 'updated') => void;
}

// Action button component
interface ActionButtonProps {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

function ActionButton({ icon, label, color, onPress, loading, disabled }: ActionButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, { borderColor: color }, disabled && styles.actionButtonDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIconContainer, { backgroundColor: `${color}15` }]}>
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <MaterialCommunityIcons name={icon as any} size={24} color={color} />
        )}
      </View>
      <Text style={[styles.actionButtonText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ExpiryAlertActions({
  visible,
  onDismiss,
  item,
  onActionComplete,
}: ExpiryAlertActionsProps) {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<'sold' | 'thrown' | 'update' | null>(null);

  // Format expiry date for display
  const formatExpiryDate = useCallback((dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }, []);

  // Check if item is expired
  const isExpired = useCallback((dateStr: string) => {
    try {
      const expiryDate = new Date(dateStr);
      expiryDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return expiryDate < today;
    } catch {
      return false;
    }
  }, []);

  // Handle SOLD / FINISHED action
  const handleSoldFinished = useCallback(async () => {
    if (!item) return;
    
    setLoadingAction('sold');
    try {
      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Log the event
      await logSoldFinished(
        item.storeId,
        item.id,
        item.barcode || undefined,
        item.productName
      );
      
      // Mark item as resolved in the database
      await resolveItem(item.id, 'sold');
      
      // Success haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      onDismiss();
      onActionComplete?.('sold');
    } catch (error) {
      console.error('[ExpiryAlertActions] Error handling sold/finished:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoadingAction(null);
    }
  }, [item, onDismiss, onActionComplete]);

  // Handle THROWN action
  const handleThrown = useCallback(async () => {
    if (!item) return;
    
    setLoadingAction('thrown');
    try {
      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Log the event
      await logThrown(
        item.storeId,
        item.id,
        item.barcode || undefined,
        item.productName
      );
      
      // Mark item as resolved (disposed) in the database
      await resolveItem(item.id, 'disposed');
      
      // Success haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      onDismiss();
      onActionComplete?.('thrown');
    } catch (error) {
      console.error('[ExpiryAlertActions] Error handling thrown:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoadingAction(null);
    }
  }, [item, onDismiss, onActionComplete]);

  // Handle UPDATE DATE action - opens fast scan screen to capture new date
  const handleUpdateDate = useCallback(async () => {
    if (!item) return;
    
    setLoadingAction('update');
    try {
      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      onDismiss();
      
      // Navigate to fast-scan screen in date-only mode
      // This will create a new batch with the new date and log UPDATED_DATE event
      router.push({
        pathname: '/fast-scan',
        params: {
          mode: 'date_only', // Date-only mode (no barcode scanning)
          barcode: item.barcode || undefined,
          itemId: item.id, // Pass original item ID for UPDATED_DATE event
        },
      } as any);
      
      onActionComplete?.('updated');
    } catch (error) {
      console.error('[ExpiryAlertActions] Error navigating to update date:', error);
    } finally {
      setLoadingAction(null);
    }
  }, [item, onDismiss, router, onActionComplete]);

  if (!item) return null;

  const expired = isExpired(item.expiryDate);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.bottomSheet}>
              {/* Handle bar */}
              <View style={styles.handleBar} />
              
              {/* Header with close button */}
              <View style={styles.header}>
                <View style={styles.headerTextContainer}>
                  <Text style={[styles.productName, isRTL && styles.textRTL]} numberOfLines={2}>
                    {item.productName}
                  </Text>
                  <View style={[styles.expiryRow, isRTL && styles.rowRTL]}>
                    <MaterialCommunityIcons 
                      name="calendar-clock" 
                      size={16} 
                      color={expired ? '#EF4444' : '#F97316'} 
                    />
                    <Text 
                      style={[
                        styles.expiryText, 
                        { color: expired ? '#EF4444' : '#F97316' },
                        isRTL && styles.textRTL,
                      ]}
                    >
                      {expired 
                        ? `${t('status.expired') || 'Expired'}: ${formatExpiryDate(item.expiryDate)}`
                        : `${t('item.expiry') || 'Expires'}: ${formatExpiryDate(item.expiryDate)}`
                      }
                    </Text>
                  </View>
                </View>
                <IconButton
                  icon="close"
                  size={24}
                  onPress={onDismiss}
                  style={styles.closeButton}
                />
              </View>

              {/* Question */}
              <Text style={[styles.question, isRTL && styles.textRTL]}>
                {t('expiryAlert.whatHappened') || 'What happened?'}
              </Text>

              {/* Action buttons */}
              <View style={styles.actionsContainer}>
                <ActionButton
                  icon="check-circle"
                  label={t('resolvedReason.sold') || 'Sold / Finished'}
                  color="#22C55E"
                  onPress={handleSoldFinished}
                  loading={loadingAction === 'sold'}
                  disabled={loadingAction !== null}
                />
                
                <ActionButton
                  icon="delete"
                  label={t('resolvedReason.disposed') || 'Thrown'}
                  color="#EF4444"
                  onPress={handleThrown}
                  loading={loadingAction === 'thrown'}
                  disabled={loadingAction !== null}
                />
                
                <ActionButton
                  icon="calendar-edit"
                  label={t('item.updateExpiryDate') || 'Update Date'}
                  color="#3B82F6"
                  onPress={handleUpdateDate}
                  loading={loadingAction === 'update'}
                  disabled={loadingAction !== null}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  expiryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  textRTL: {
    textAlign: 'right',
  },
  closeButton: {
    margin: 0,
    backgroundColor: '#F3F4F6',
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 16,
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    gap: 16,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
});

