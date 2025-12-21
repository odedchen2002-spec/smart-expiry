/**
 * Item Card Component
 * Displays a single item in the list
 */

import { useLanguage } from '@/context/LanguageContext';
import { STATUS_COLORS, THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useDatePickerStyle } from '@/lib/hooks/useDatePickerStyle';
import { deleteItem, updateItem } from '@/lib/supabase/mutations/items';
import { getRTLMargin, getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import type { Database } from '@/types/database';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { differenceInCalendarDays, format } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Button, Card, Chip, IconButton, Text, useTheme } from 'react-native-paper';

type Item = Database['public']['Views']['items_with_details']['Row'];

interface ItemCardProps {
  item: Item;
  onRefresh?: () => void;
}

export function ItemCard({ item, onRefresh }: ItemCardProps) {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const theme = useTheme();
  const { isViewer } = useActiveOwner();
  const { datePickerStyle, loading: datePickerStyleLoading } = useDatePickerStyle();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextDate = getRtlTextStyles(isRTL, 'date');
  const styles = createStyles(isRTL);
  const [deleting, setDeleting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [updatingDate, setUpdatingDate] = useState(false);

  const minDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const currentExpiryDate = useMemo(() => {
    if (!item.expiry_date) {
      const fallback = new Date();
      fallback.setHours(0, 0, 0, 0);
      return fallback;
    }

    const parsed = new Date(item.expiry_date);
    parsed.setHours(0, 0, 0, 0);
    return isNaN(parsed.getTime()) ? minDate : parsed;
  }, [item.expiry_date, minDate]);

  const [selectedDate, setSelectedDate] = useState(currentExpiryDate);

  useEffect(() => {
    setSelectedDate(currentExpiryDate);
  }, [currentExpiryDate]);

  const isExpiringSoon = useMemo(() => {
    if (!item.expiry_date) {
      return false;
    }

    try {
      const expiry = new Date(item.expiry_date);
      expiry.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = differenceInCalendarDays(expiry, today);
      // Show button for items expiring today, tomorrow, or already expired
      return diff <= 1;
    } catch (error) {
      console.warn('Error checking expiry date proximity', error);
      return false;
    }
  }, [item.expiry_date]);

  /**
   * Calculate item status based on expiration date
   * This ensures the status is always correct regardless of database values
   */
  const calculatedStatus = useMemo(() => {
    // If item is resolved, keep it resolved
    if (item.status === 'resolved') {
      return 'resolved';
    }

    if (!item.expiry_date) {
      return 'ok'; // Default to ok if no expiry date
    }

    try {
      const expiry = new Date(item.expiry_date);
      expiry.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = differenceInCalendarDays(expiry, today);

      // Expired: past date
      if (diff < 0) {
        return 'expired';
      }

      // Soon: within 7 days (including today)
      if (diff <= 7) {
        return 'soon';
      }

      // Ok: more than 7 days away
      return 'ok';
    } catch {
      return 'ok'; // Default to ok on error
    }
  }, [item.expiry_date, item.status]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return STATUS_COLORS.ok;
      case 'soon':
        return STATUS_COLORS.soon;
      case 'expired':
        return STATUS_COLORS.expired;
      case 'resolved':
        return STATUS_COLORS.resolved;
      default:
        return '#9E9E9E';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'd MMM yyyy');
    } catch (error) {
      console.error('Error formatting date:', error, dateString);
      return dateString;
    }
  };

  const isLocked = item.is_plan_locked;

  const showLockedModal = () => {
    Alert.alert(
      t('common.upgradeRequired') || 'שדרוג נדרש',
      t('common.upgradeRequiredMessage') || 'חרגת מכמות המוצרים המותרת בתוכנית החינמית. כדי לערוך את כל המוצרים ולקבל התראות ללא הגבלה, שדרג לתוכנית Pro.'
    );
  };

  const handlePress = () => {
    if (isViewer) return;
    if (isLocked) {
      showLockedModal();
      return;
    }
    // Pass item data as route params for instant rendering
    router.push({
      pathname: `/item/${item.id}` as any,
      params: {
        // Pass all essential item data for instant display
        productName: item.product_name || '',
        expiryDate: item.expiry_date || '',
        status: item.status || '',
        category: item.product_category || '',
        barcode: item.barcode_snapshot || item.product_barcode || '',
        isPlanLocked: item.is_plan_locked ? 'true' : 'false',
        productId: item.product_id || '',
      },
    } as any);
  };

  const handleEdit = (e: any) => {
    e.stopPropagation();
    if (isViewer) return;
    if (isLocked) {
      showLockedModal();
      return;
    }
    // Pass item data as route params for instant rendering
    router.push({
      pathname: '/add' as any,
      params: {
        itemId: item.id,
        // Pass all essential item data for instant display
        productName: item.product_name || '',
        expiryDate: item.expiry_date || '',
        category: item.product_category || '',
        barcode: item.barcode_snapshot || item.product_barcode || '',
        isPlanLocked: item.is_plan_locked ? 'true' : 'false',
        productId: item.product_id || '',
      },
    } as any);
  };

  const handleDelete = async (e: any) => {
    e.stopPropagation();
    if (isViewer) return;
    
    Alert.alert(
      t('item.delete') || 'מחק',
      t('item.deleteConfirm') || 'האם אתה בטוח שברצונך למחוק את המוצר הזה?',
      [
        {
          text: t('common.cancel') || 'ביטול',
          style: 'cancel',
        },
        {
          text: t('item.delete') || 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await deleteItem(item.id);
              onRefresh?.();
            } catch (error: any) {
              Alert.alert(
                t('common.error') || 'שגיאה',
                error?.message || t('item.deleteError') || 'לא ניתן למחוק את המוצר'
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenDatePicker = (e?: any) => {
    e?.stopPropagation?.();
    if (isViewer) return;
    if (isLocked) {
      showLockedModal();
      return;
    }
    setSelectedDate(currentExpiryDate);
    setShowDatePicker(true);
  };

  const handleCancelDatePicker = () => {
    setShowDatePicker(false);
    setSelectedDate(currentExpiryDate);
  };

  const handleDateChange = (event: any, date?: Date) => {
    if (!date) {
      return;
    }

    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        return;
      }
      if (date >= minDate) {
        setSelectedDate(date);
      }
    } else {
      if (date >= minDate) {
        setSelectedDate(date);
      }
    }
  };

  const handleUpdateExpiryDate = async () => {
    try {
      setUpdatingDate(true);
      const safeDate = selectedDate < minDate ? minDate : selectedDate;
      const formattedDate = format(safeDate, 'yyyy-MM-dd');
      await updateItem(item.id, { expiry_date: formattedDate });
      setShowDatePicker(false);
      onRefresh?.();
    } catch (error: any) {
      Alert.alert(
        t('common.error') || 'Error',
        error?.message || t('item.dateUpdateError') || 'Could not update the expiry date'
      );
    } finally {
      setUpdatingDate(false);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={isViewer ? 1 : 0.7} disabled={isViewer}>
      <Card style={styles.card} elevation={0}>
        <Card.Content style={styles.content}>
          <View style={styles.header}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: isLocked
                    ? '#F3F4F6'
                    : getStatusColor(calculatedStatus) + '15',
                },
              ]}
            >
              {isLocked ? (
                <MaterialCommunityIcons name="lock" size={18} color="#6B7280" />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(calculatedStatus) }]} />
              )}
            </View>
            <View style={styles.titleContainer}>
              <Text variant="titleSmall" numberOfLines={1} style={[styles.productName, rtlText]}>
                {item.product_name || 'Unknown Product'}
              </Text>
              <Text variant="bodySmall" style={[styles.meta, rtlTextDate]}>
                {formatDate(item.expiry_date)}
              </Text>
            </View>
            {!isViewer && (
              <View style={styles.actions}>
                {isExpiringSoon && !isLocked && (
                  <IconButton
                    icon="calendar-edit"
                    iconColor={THEME_COLORS.primary}
                    size={20}
                    onPress={handleOpenDatePicker}
                    style={styles.actionIcon}
                  />
                )}
                {!isLocked && (
                  <IconButton
                    icon="pencil-outline"
                    iconColor="#42A5F5"
                    size={20}
                    onPress={handleEdit}
                    style={styles.actionIcon}
                  />
                )}
                <IconButton
                  icon="delete-outline"
                  iconColor="#F44336"
                  size={20}
                  onPress={handleDelete}
                  loading={deleting}
                  disabled={deleting}
                  style={styles.actionIcon}
                />
              </View>
            )}
          </View>
          {item.status === 'resolved' && item.resolved_reason && (
            <Chip style={styles.chip} textStyle={styles.chipText} mode="flat">
              {item.resolved_reason}
            </Chip>
          )}
        </Card.Content>
      </Card>
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDatePicker}
      >
        <TouchableWithoutFeedback onPress={handleCancelDatePicker}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
                <View style={[styles.modalHeader, { borderBottomColor: theme.colors.surfaceVariant }]}>
                  <View style={[styles.modalHeaderContent, rtlContainer]}>
                    <View style={[styles.modalIconContainer, { backgroundColor: THEME_COLORS.primary + '15' }]}>
                      <MaterialCommunityIcons 
                        name="calendar-edit" 
                        size={24} 
                        color={THEME_COLORS.primary} 
                      />
                    </View>
                    <View style={styles.modalTitleContainer}>
                      <Text style={[styles.modalTitle, rtlText, { color: theme.colors.onSurface }]}>
                        {t('item.updateExpiryDate') || 'Update expiry date'}
                      </Text>
                      <Text style={[styles.modalSubtitle, rtlText, { color: theme.colors.onSurfaceVariant }]}>
                        {t('item.updateExpiryDateDesc') || 'Select a new expiry date for this item'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                  <View style={[styles.datePickerContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
                    {!datePickerStyleLoading && (
                      <DateTimePicker
                        value={selectedDate < minDate ? minDate : selectedDate}
                        mode="date"
                        display={
                          datePickerStyle === 'calendar' 
                            ? (Platform.OS === 'ios' ? 'inline' : 'default')
                            : (Platform.OS === 'ios' ? 'spinner' : 'default')
                        }
                        minimumDate={minDate}
                        onChange={handleDateChange}
                        style={styles.datePicker}
                        textColor={theme.colors.onSurface}
                        accentColor={datePickerStyle === 'calendar' ? THEME_COLORS.primary : "white"}
                        themeVariant="light"
                        locale="he_IL"
                      />
                    )}
                  </View>
                </View>
                <View style={[styles.modalFooter, { borderTopColor: theme.colors.surfaceVariant }]}>
                  <Button
                    mode="outlined"
                    onPress={handleCancelDatePicker}
                    style={styles.modalCancelButton}
                    labelStyle={[styles.modalCancelLabel, { color: theme.colors.onSurfaceVariant }]}
                    contentStyle={styles.modalButtonContent}
                  >
                    {t('common.cancel') || 'Cancel'}
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleUpdateExpiryDate}
                    style={styles.modalConfirmButton}
                    labelStyle={styles.modalConfirmLabel}
                    buttonColor={THEME_COLORS.primary}
                    loading={updatingDate}
                    disabled={updatingDate}
                    contentStyle={styles.modalButtonContent}
                    icon="check"
                  >
                    {t('common.update') || 'Update'}
                  </Button>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </TouchableOpacity>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginVertical: 4,
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    content: {
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      minHeight: 48,
    },
    iconContainer: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      marginEnd: isRTL ? 0 : 12,
      marginStart: isRTL ? 12 : 0,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    titleContainer: {
      flex: 1,
      ...getRTLMargin.end(12),
    },
    productName: {
      fontWeight: '600',
      color: '#212121',
      fontSize: 15,
      marginBottom: 4,
    },
    meta: {
      color: '#757575',
      fontSize: 13,
    },
    actions: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 0,
      minHeight: 40,
      justifyContent: 'center',
    },
    actionIcon: {
      margin: 0,
      width: 36,
      height: 36,
    },
    chip: {
      marginTop: 12,
      alignSelf: isRTL ? 'flex-end' : 'flex-start',
      height: 28,
    },
  chipText: {
    fontSize: 12,
  },
  // lockBadge styles were removed because lock icon is now shown in the main status icon
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.25,
        shadowRadius: 40,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  modalHeader: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FAFBFC',
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  modalIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  modalTitleContainer: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 6,
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    letterSpacing: 0.1,
  },
  modalContent: {
    padding: 28,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 320,
    backgroundColor: '#FFFFFF',
  },
  datePickerContainer: {
    borderRadius: 24,
    padding: Platform.OS === 'ios' ? 28 : 20,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        minHeight: 280,
      },
      android: {
        elevation: 4,
        minHeight: 240,
      },
    }),
  },
  datePicker: {
    width: '100%',
    ...Platform.select({
      ios: {
        height: 260,
        transform: [{ scale: 1.08 }],
      },
      android: {
        height: 220,
      },
    }),
  },
  modalFooter: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FAFBFC',
    justifyContent: isRTL ? 'flex-start' : 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  modalButtonContent: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  modalCancelButton: {
    minWidth: 110,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  modalCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: '#6B7280',
  },
  modalConfirmButton: {
    minWidth: 130,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  modalConfirmLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  });
}

