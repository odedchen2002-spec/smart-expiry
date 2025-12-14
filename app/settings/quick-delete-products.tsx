/**
 * Quick Delete Products Screen
 * Allows bulk deletion of products grouped by category
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, Pressable } from 'react-native';
import {
  Appbar,
  Card,
  Button,
  Text,
  Snackbar,
  Portal,
  Dialog,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { deleteItems, deleteAllItems } from '@/lib/supabase/mutations/items';
import { supabase } from '@/lib/supabase/client';
import { groupItemsByCategory } from '@/lib/utils/groupByCategory';
import type { Database } from '@/types/database';
import { format } from 'date-fns';

type Item = Database['public']['Views']['items_with_details']['Row'];

// Custom square checkbox component
interface SquareCheckboxProps {
  checked: boolean;
  onPress: () => void;
  size?: number;
}

function SquareCheckbox({ checked, onPress, size = 24 }: SquareCheckboxProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderWidth: 2,
          borderColor: checked ? THEME_COLORS.primary : '#757575',
          borderRadius: 4,
          backgroundColor: checked ? THEME_COLORS.primary : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {checked && (
        <MaterialCommunityIcons name="check" size={size - 6} color="#FFFFFF" />
      )}
    </Pressable>
  );
}

export default function QuickDeleteProductsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { activeOwnerId } = useActiveOwner();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [deleteAllDialogVisible, setDeleteAllDialogVisible] = useState(false);
  const [deleteSelectedDialogVisible, setDeleteSelectedDialogVisible] = useState(false);

  useEffect(() => {
    if (activeOwnerId) {
      loadItems();
    }
  }, [activeOwnerId]);

  const loadItems = async () => {
    if (!activeOwnerId) return;

    try {
      setLoading(true);
      // Get ALL items (including expired) for deletion screen
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('owner_id', activeOwnerId)
        .order('expiry_date', { ascending: true });

      if (error) {
        throw error;
      }

      // Fetch product details to get category and name
      if (data && data.length > 0) {
        const productIds = [...new Set(data.map((item: any) => item.product_id).filter(Boolean))];
        
        let productsMap = new Map();
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from('products')
            .select('id, name, category')
            .in('id', productIds);
          
          if (products) {
            productsMap = new Map(products.map((p: any) => [p.id, p]));
          }
        }

        // Transform to match ItemWithDetails format
        const itemsWithDetails: Item[] = data.map((item: any) => {
          const product = productsMap.get(item.product_id);
          return {
            ...item,
            product_name: product?.name || null,
            product_category: product?.category || null,
            location_name: null,
            location_order: null,
          } as Item;
        });

        setItems(itemsWithDetails);
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error('[QuickDelete] Error loading items:', error);
      setSnackbar(t('quickDelete.loadError') || 'הייתה בעיה בטעינת המוצרים');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (itemId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((item) => item.id));
    }
  };

  const handleDeleteAll = async () => {
    if (!activeOwnerId) return;

    try {
      setDeleting(true);
      const deletedCount = await deleteAllItems(activeOwnerId);
      setSnackbar(
        t('quickDelete.deleteAllSuccess', { count: deletedCount }) ||
        `נמחקו ${deletedCount} מוצרים בהצלחה`
      );
      setDeleteAllDialogVisible(false);
      await loadItems();
      setSelectedIds([]);
    } catch (error) {
      console.error('[QuickDelete] Error deleting all items:', error);
      setSnackbar(t('quickDelete.deleteError') || 'הייתה בעיה במחיקת המוצרים');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;

    try {
      setDeleting(true);
      await deleteItems(selectedIds);
      setSnackbar(
        t('quickDelete.deleteSelectedSuccess', { count: selectedIds.length }) ||
        `נמחקו ${selectedIds.length} מוצרים בהצלחה`
      );
      setDeleteSelectedDialogVisible(false);
      await loadItems();
      setSelectedIds([]);
    } catch (error) {
      console.error('[QuickDelete] Error deleting selected items:', error);
      setSnackbar(t('quickDelete.deleteError') || 'הייתה בעיה במחיקת המוצרים');
    } finally {
      setDeleting(false);
    }
  };

  const groupedItems = groupItemsByCategory(items);

  const formatDate = (dateString: string): string => {
    try {
      return format(new Date(dateString), 'd MMM yyyy');
    } catch {
      return dateString;
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={t('quickDelete.title') || 'מחיקת מוצרים מהירה'}
        />
      </Appbar.Header>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Select All Toggle */}
        {items.length > 0 && (
          <Card style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={[styles.selectAllRow, rtlContainer]}>
                <SquareCheckbox
                  checked={selectedIds.length === items.length}
                  onPress={toggleSelectAll}
                />
                <Text
                  variant="bodyLarge"
                  style={[styles.selectAllText, rtlText]}
                  onPress={toggleSelectAll}
                >
                  {t('quickDelete.selectAll') || 'בחר הכל'}
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Items grouped by category */}
        {loading ? (
          <Card style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <Text style={[rtlText, styles.loadingText]}>
                {t('common.loading') || 'טוען...'}
              </Text>
            </Card.Content>
          </Card>
        ) : groupedItems.length === 0 ? (
          <Card style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <Text style={[rtlText, styles.emptyText]}>
                {t('quickDelete.noItems') || 'אין מוצרים למחיקה'}
              </Text>
            </Card.Content>
          </Card>
        ) : (
          groupedItems.map((category) => (
            <Card key={category.title} style={styles.card}>
              <Card.Content style={styles.cardContent}>
                {/* Category Header */}
                <Text variant="titleMedium" style={[styles.categoryHeader, rtlText]}>
                  {category.title}
                </Text>

                {/* Items in category */}
                {category.data.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <View
                      key={item.id}
                      style={[styles.itemRow, rtlContainer]}
                    >
                      <SquareCheckbox
                        checked={isSelected}
                        onPress={() => toggleSelection(item.id)}
                      />
                      <View style={styles.itemTextContainer}>
                        <Text
                          variant="bodyLarge"
                          style={[styles.itemName, rtlText]}
                          numberOfLines={1}
                        >
                          {item.product_name || '—'}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={[styles.itemDate, rtlText]}
                          numberOfLines={1}
                        >
                          {formatDate(item.expiry_date)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Delete Selected Button (Fixed at bottom) */}
      {items.length > 0 && (
        <View style={styles.bottomActions}>
          <Button
            mode="contained"
            onPress={() => setDeleteSelectedDialogVisible(true)}
            disabled={selectedIds.length === 0 || deleting}
            loading={deleting}
            style={styles.deleteSelectedButton}
            labelStyle={styles.deleteSelectedButtonLabel}
            contentStyle={styles.deleteSelectedButtonContent}
            buttonColor="#D32F2F"
          >
            {selectedIds.length > 0
              ? `${t('quickDelete.deleteSelected') || 'מחק מוצרים שנבחרו'} (${selectedIds.length})`
              : (t('quickDelete.deleteSelected') || 'מחק מוצרים שנבחרו')}
          </Button>
        </View>
      )}

      {/* Delete All Confirmation Dialog */}
      <Portal>
        <Dialog
          visible={deleteAllDialogVisible}
          onDismiss={() => setDeleteAllDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={[styles.dialogTitle, rtlText]}>
            {t('quickDelete.confirmTitle') || 'אישור מחיקה'}
          </Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <Text style={[styles.dialogMessage, rtlText]}>
              {t('quickDelete.confirmDeleteAllMessage') ||
                'האם אתה בטוח שברצונך למחוק את כל המוצרים שלך?\n\nפעולה זו היא בלתי הפיכה ולא ניתן לבטל אותה.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={[styles.dialogActions, rtlContainer]}>
            <Button
              onPress={() => setDeleteAllDialogVisible(false)}
              mode="outlined"
              style={styles.dialogCancelButton}
              labelStyle={styles.dialogCancelLabel}
              contentStyle={styles.dialogButtonContent}
            >
              {t('common.cancel') || 'ביטול'}
            </Button>
            <Button
              onPress={handleDeleteAll}
              mode="contained"
              buttonColor="#D32F2F"
              loading={deleting}
              disabled={deleting}
              style={styles.dialogConfirmButton}
              labelStyle={styles.dialogConfirmLabel}
              contentStyle={styles.dialogButtonContent}
            >
              {t('quickDelete.confirmDeleteAll') || 'מחק הכל'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Delete Selected Confirmation Dialog */}
      <Portal>
        <Dialog
          visible={deleteSelectedDialogVisible}
          onDismiss={() => setDeleteSelectedDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={[styles.dialogTitle, rtlText]}>
            {t('quickDelete.confirmTitle') || 'אישור מחיקה'}
          </Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <Text style={[styles.dialogMessage, rtlText]}>
              {t('quickDelete.confirmDeleteSelectedMessage', {
                count: selectedIds.length,
              }) ||
                `האם אתה בטוח שברצונך למחוק את ${selectedIds.length} המוצרים שנבחרו?\n\nפעולה זו היא בלתי הפיכה ולא ניתן לבטל אותה.`}
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={[styles.dialogActions, rtlContainer]}>
            <Button
              onPress={() => setDeleteSelectedDialogVisible(false)}
              mode="outlined"
              style={styles.dialogCancelButton}
              labelStyle={styles.dialogCancelLabel}
              contentStyle={styles.dialogButtonContent}
            >
              {t('common.cancel') || 'ביטול'}
            </Button>
            <Button
              onPress={handleDeleteSelected}
              mode="contained"
              buttonColor="#D32F2F"
              loading={deleting}
              disabled={deleting}
              style={styles.dialogConfirmButton}
              labelStyle={styles.dialogConfirmLabel}
              contentStyle={styles.dialogButtonContent}
            >
              {t('quickDelete.confirmDelete') || 'מחק'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Snackbar for messages */}
      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F5F5F5',
    },
    content: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 100, // Space for fixed bottom button
    },
    card: {
      marginBottom: 12,
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    cardContent: {
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    selectAllRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
    },
    selectAllText: {
      marginLeft: isRTL ? 0 : 8,
      marginRight: isRTL ? 8 : 0,
      fontWeight: '600',
    },
    categoryHeader: {
      fontWeight: '700',
      fontSize: 16,
      color: '#212121',
      marginBottom: 12,
      marginTop: 4,
    },
    itemRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#E0E0E0',
    },
    itemTextContainer: {
      flex: 1,
      marginLeft: isRTL ? 0 : 12,
      marginRight: isRTL ? 12 : 0,
    },
    itemName: {
      fontSize: 15,
      fontWeight: '500',
      color: '#212121',
      marginBottom: 2,
    },
    itemDate: {
      fontSize: 13,
      color: '#757575',
    },
    bottomActions: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      backgroundColor: '#FFFFFF',
      borderTopWidth: 1,
      borderTopColor: '#E0E0E0',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    deleteSelectedButton: {
      borderRadius: 12,
    },
    deleteSelectedButtonContent: {
      paddingVertical: 8,
    },
    deleteSelectedButtonLabel: {
      fontSize: 15,
      fontWeight: '700',
    },
    dialog: {
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    dialogTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#212121',
      letterSpacing: 0.15,
      paddingBottom: 4,
    },
    dialogContent: {
      paddingTop: 8,
      paddingBottom: 8,
    },
    dialogMessage: {
      fontSize: 15,
      lineHeight: 22,
      color: '#424242',
      letterSpacing: 0.1,
    },
    dialogActions: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 8,
      gap: 8,
    },
    dialogCancelButton: {
      borderRadius: 12,
      borderColor: '#E0E0E0',
      borderWidth: 1.5,
      minWidth: 100,
    },
    dialogCancelLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: '#424242',
      letterSpacing: 0.1,
    },
    dialogConfirmButton: {
      borderRadius: 12,
      minWidth: 100,
      ...Platform.select({
        ios: {
          shadowColor: '#D32F2F',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    dialogConfirmLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.1,
    },
    dialogButtonContent: {
      paddingVertical: 6,
      paddingHorizontal: 16,
    },
    loadingText: {
      textAlign: 'center',
      color: '#757575',
      paddingVertical: 20,
    },
    emptyText: {
      textAlign: 'center',
      color: '#757575',
      paddingVertical: 20,
    },
  });
}

