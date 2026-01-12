/**
 * Quick Delete Products Screen
 * Allows bulk deletion of products grouped by category
 */

import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { supabase } from '@/lib/supabase/client';
import { deleteAllItems, deleteItems } from '@/lib/supabase/mutations/items';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import type { Database } from '@/types/database';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Dialog,
  Portal,
  Snackbar,
  Text,
} from 'react-native-paper';
import { useItemsQuery } from '@/hooks/queries/useItemsQuery';
import { useQueryClient } from '@tanstack/react-query';

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

// Memoized Product Item component - only re-renders when its own props change
interface ProductItemProps {
  item: Item;
  isSelected: boolean;
  isLastItem: boolean;
  onToggle: (itemId: string) => void;
  rtlContainer: any;
  rtlText: any;
  styles: any;
}

const ProductItem = React.memo(({ item, isSelected, isLastItem, onToggle, rtlContainer, rtlText, styles }: ProductItemProps) => {
  const formatDate = (dateString: string): string => {
    try {
      return format(new Date(dateString), 'd MMM yyyy');
    } catch {
      return dateString;
    }
  };

  // Safety check: skip items without valid ID
  if (!item.id) return null;

  return (
    <Pressable
      onPress={() => onToggle(item.id!)}
      style={({ pressed }) => [
        styles.itemRow,
        rtlContainer,
        isLastItem && styles.lastItemRow,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <SquareCheckbox
        checked={isSelected}
        onPress={() => onToggle(item.id!)}
      />
      <View style={styles.itemTextContainer}>
        <Text
          variant="bodyLarge"
          style={[styles.itemName, rtlText]}
          numberOfLines={1}
        >
          {item.product_name || item.barcode_snapshot || '—'}
        </Text>
        <Text
          variant="bodySmall"
          style={[styles.itemDate, rtlText]}
          numberOfLines={1}
        >
          {item.expiry_date ? formatDate(item.expiry_date) : '—'}
        </Text>
      </View>
    </Pressable>
  );
});

ProductItem.displayName = 'ProductItem';

export default function QuickDeleteProductsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { activeOwnerId } = useActiveOwner();
  const queryClient = useQueryClient();
  
  // Memoize styles to prevent unnecessary re-renders
  const rtlContainer = useMemo(() => getRtlContainerStyles(isRTL), [isRTL]);
  const rtlText = useMemo(() => getRtlTextStyles(isRTL), [isRTL]);
  const styles = useMemo(() => createStyles(isRTL), [isRTL]);

  // For Quick Delete, we need ALL items including resolved ones
  // Cache scopes filter them out, so we fetch directly from Supabase
  const [items, setItems] = useState<Item[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  useEffect(() => {
    if (!activeOwnerId) return;

    const loadAllItems = async () => {
      try {
        setIsLoadingItems(true);
        console.log('[QuickDelete] Loading ALL items directly from Supabase (with pagination)...');
        console.log('[QuickDelete] activeOwnerId:', activeOwnerId);
        console.log('[QuickDelete] Filter: status != resolved (excluding sold/thrown/finished items)');
        
        // Supabase PostgREST has a hard limit of 1000 rows per request
        let allItems: Item[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('items_with_details')
            .select('*')
            .eq('owner_id', activeOwnerId)
            .neq('status', 'resolved') // Exclude items marked as sold/thrown/finished
            .order('expiry_date', { ascending: true })
            .range(from, from + pageSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allItems = [...allItems, ...(data as Item[])];
            
            // Check for items with different owner_id (should NOT happen)
            const wrongOwners = data.filter(item => item.owner_id !== activeOwnerId);
            if (wrongOwners.length > 0) {
              console.warn(`[QuickDelete] ⚠️ Found ${wrongOwners.length} items with WRONG owner_id!`, wrongOwners.slice(0, 3));
            }
            
            console.log(`[QuickDelete] Loaded page: ${from}-${from + data.length - 1} (${data.length} items)`);
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        // Final deduplication and owner check
        const uniqueOwnerIds = new Set(allItems.map(item => item.owner_id));
        console.log(`[QuickDelete] ✅ Loaded ${allItems.length} items (excluding resolved)`);
        console.log(`[QuickDelete] Unique owner IDs in results:`, Array.from(uniqueOwnerIds));
        
        setItems(allItems);
      } catch (error) {
        console.error('[QuickDelete] Error loading items:', error);
      } finally {
        setIsLoadingItems(false);
      }
    };

    loadAllItems();
  }, [activeOwnerId]);

  const isFetching = isLoadingItems;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [deleteAllDialogVisible, setDeleteAllDialogVisible] = useState(false);
  const [deleteSelectedDialogVisible, setDeleteSelectedDialogVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    console.log(`[QuickDelete] Total items from cache: ${items.length}`);
    if (!searchQuery.trim()) {
      console.log(`[QuickDelete] No search query, showing all ${items.length} items`);
      return items;
    }
    const query = searchQuery.trim().toLowerCase();
    const filtered = items.filter(item =>
      (item.product_name?.toLowerCase().includes(query)) ||
      (item.barcode_snapshot?.toLowerCase().includes(query))
    );
    console.log(`[QuickDelete] Filtered ${items.length} → ${filtered.length} items with query: "${query}"`);
    return filtered;
  }, [items, searchQuery]);

  const toggleSelection = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  }, []);

  const toggleSelectAll = () => {
    // Filter out items without valid IDs
    const currentFilteredIds = filteredItems
      .map((item) => item.id)
      .filter((id): id is string => id !== null && id !== undefined);
    const allFilteredSelected = currentFilteredIds.every((id) => selectedIds.includes(id));

    console.log(`[QuickDelete] toggleSelectAll: ${currentFilteredIds.length} filtered items, ${allFilteredSelected ? 'deselecting' : 'selecting'} all`);

    if (allFilteredSelected) {
      // Deselect all filtered items
      setSelectedIds((prev) => prev.filter((id) => !currentFilteredIds.includes(id)));
    } else {
      // Select all filtered items (add to existing selection)
      setSelectedIds((prev) => [...new Set([...prev, ...currentFilteredIds])]);
    }
  };

  const handleDeleteAll = async () => {
    if (!activeOwnerId) return;

    // Close dialog immediately
    setDeleteAllDialogVisible(false);

    // Store count for success message
    const deletedCount = items.length;

    // Optimistic update: Clear UI immediately
    setItems([]);
    setSelectedIds([]);

    // Delete in background
    try {
      await deleteAllItems(activeOwnerId);
      setSnackbar(
        t('quickDelete.deleteAllSuccess', { count: deletedCount }) ||
        `נמחקו ${deletedCount} מוצרים בהצלחה`
      );
      
      // Invalidate cache to ensure other screens are updated
      await queryClient.invalidateQueries({ queryKey: ['items', activeOwnerId, 'all'] });
      await queryClient.invalidateQueries({ queryKey: ['items', activeOwnerId, 'expired'] });
      await queryClient.invalidateQueries({ queryKey: ['stats', activeOwnerId] });
    } catch (error) {
      console.error('[QuickDelete] Error deleting all items:', error);
      setSnackbar(t('quickDelete.deleteError') || 'הייתה בעיה במחיקת המוצרים');
      // Rollback: reload items from Supabase
      if (activeOwnerId) {
        const { data } = await supabase
          .from('items_with_details')
          .select('*')
          .eq('owner_id', activeOwnerId)
          .neq('status', 'resolved')
          .order('expiry_date', { ascending: true });
        if (data) setItems(data as Item[]);
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;

    // Store selected IDs and count for rollback and success message
    const idsToDelete = [...selectedIds];
    const deletedCount = idsToDelete.length;
    
    // Close dialog immediately
    setDeleteSelectedDialogVisible(false);

    // Optimistic update: Remove items from UI immediately
    const previousItems = [...items];
    setItems(prevItems => prevItems.filter(item => item.id && !idsToDelete.includes(item.id)));
    setSelectedIds([]);

    // Delete in background
    try {
      await deleteItems(idsToDelete);
      setSnackbar(
        t('quickDelete.deleteSelectedSuccess', { count: deletedCount }) ||
        `נמחקו ${deletedCount} מוצרים בהצלחה`
      );
      
      // Invalidate cache to ensure other screens are updated
      await queryClient.invalidateQueries({ queryKey: ['items', activeOwnerId, 'all'] });
      await queryClient.invalidateQueries({ queryKey: ['items', activeOwnerId, 'expired'] });
      await queryClient.invalidateQueries({ queryKey: ['stats', activeOwnerId] });
    } catch (error) {
      console.error('[QuickDelete] Error deleting selected items:', error);
      setSnackbar(t('quickDelete.deleteError') || 'הייתה בעיה במחיקת המוצרים');
      // Rollback: restore previous items
      setItems(previousItems);
    }
  };

  const renderItem = useCallback(
    ({ item, index }: { item: Item; index: number }) => (
      <ProductItem
        key={item.id}
        item={item}
        isSelected={item.id ? selectedIds.includes(item.id) : false}
        isLastItem={index === filteredItems.length - 1}
        onToggle={toggleSelection}
        rtlContainer={rtlContainer}
        rtlText={rtlText}
        styles={styles}
      />
    ),
    [selectedIds, filteredItems.length, toggleSelection, rtlContainer, rtlText, styles]
  );

  const renderListHeader = useCallback(() => (
    <>
      {/* Select All Toggle - Only this in header, search bar moved out */}
      {filteredItems.length > 0 && (
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <View style={[styles.selectAllRow, rtlContainer]}>
              <SquareCheckbox
                checked={filteredItems.length > 0 && filteredItems.every((item) => item.id && selectedIds.includes(item.id))}
                onPress={toggleSelectAll}
              />
              <Text
                variant="bodyLarge"
                style={[styles.selectAllText, rtlText]}
                onPress={toggleSelectAll}
              >
                {t('quickDelete.selectAll') || 'בחר הכל'} {searchQuery ? `(${filteredItems.length})` : ''}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}
    </>
  ), [filteredItems.length, selectedIds, rtlContainer, rtlText, styles, t, toggleSelectAll, searchQuery]);

  const renderListEmpty = useCallback(() => {
    if (isFetching && items.length === 0) {
      return (
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <Text style={[rtlText, styles.loadingText]}>
              {t('common.loading') || 'טוען...'}
            </Text>
          </Card.Content>
        </Card>
      );
    }
    if (items.length === 0) {
      return (
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <Text style={[rtlText, styles.emptyText]}>
              {t('quickDelete.noItems') || 'אין מוצרים למחיקה'}
            </Text>
          </Card.Content>
        </Card>
      );
    }
    if (filteredItems.length === 0) {
      return (
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <Text style={[rtlText, styles.emptyText]}>
              {t('quickDelete.noSearchResults') || 'לא נמצאו תוצאות'}
            </Text>
          </Card.Content>
        </Card>
      );
    }
    return null;
  }, [isFetching, items.length, filteredItems.length, rtlText, styles, t]);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={t('quickDelete.title') || 'מחיקת מוצרים מהירה'}
        />
      </Appbar.Header>

      {/* Search Bar - OUTSIDE FlatList to prevent keyboard dismiss */}
      {items.length > 0 && (
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color="#757575" style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, isRTL && styles.searchInputRTL]}
            placeholder={t('quickDelete.searchPlaceholder') || 'חיפוש מוצר...'}
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#999" />
            </Pressable>
          )}
        </View>
      )}

      <FlatList
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id || 'unknown'}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews={true}
      />

      {/* Delete Selected Button (Fixed at bottom) */}
      {items.length > 0 && (
        <View style={styles.bottomActions}>
          <Button
            mode="contained"
            onPress={() => setDeleteSelectedDialogVisible(true)}
            disabled={selectedIds.length === 0}
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
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#E0E0E0',
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: '#212121',
      paddingVertical: 6,
    },
    searchInputRTL: {
      textAlign: 'right',
    },
    clearButton: {
      padding: 4,
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
    lastItemRow: {
      borderBottomWidth: 0,
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

