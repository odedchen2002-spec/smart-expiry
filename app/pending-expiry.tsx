/**
 * Pending Expiry Dates Screen
 * 
 * Assembly-line style screen for entering expiry dates for pending items.
 * Uses the same DDMM keypad UX as fast-scan.
 * 
 * Flow:
 * 1. Show list of unresolved pending_items
 * 2. User taps "הזן תאריך" to open DDMM keypad
 * 3. On confirm: create item (batch) + mark pending resolved
 * 4. Auto-advance to next item
 */

import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { supabase } from '@/lib/supabase/client';
import { createItem } from '@/lib/supabase/mutations/items';
import { createProduct } from '@/lib/supabase/mutations/products';
import { getOrCreateDefaultLocation } from '@/lib/supabase/queries/locations';
import { getProductByBarcode } from '@/lib/supabase/queries/products';
import { resolveBarcodeToName } from '@/lib/supabase/services/barcodeNameService';
import { DDMMKeypadSheet, formatDateForDB } from '@/components/date/DDMMKeypadSheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
  Animated,
  Vibration,
} from 'react-native';
import {
  ActivityIndicator,
  Card,
  IconButton,
  Snackbar,
  Text,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

// ============================================================================
// TYPES
// ============================================================================

interface PendingItem {
  id: string;
  store_id: string;
  barcode: string | null;
  raw_name: string | null;
  created_at: string;
  resolved_at: string | null;
  // Resolved display name (from override → catalog → raw_name)
  displayName?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PendingExpiryScreen() {
  const router = useRouter();
  const { t, isRTL, currentLocale } = useLanguage();
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  const styles = createStyles(isRTL);

  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  
  // Keypad state
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Success animation
  const [showSuccess, setShowSuccess] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;

  // Refs for auto-scroll
  const flatListRef = useRef<FlatList>(null);

  // ============================================================================
  // LOAD ITEMS
  // ============================================================================

  const loadItems = useCallback(async () => {
    if (!activeOwnerId) return;

    try {
      const { data, error } = await supabase
        .from('pending_items')
        .select('*')
        .eq('store_id', activeOwnerId)
        .is('resolved_at', null)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        console.error('[Pending Expiry] Error loading items:', error);
        setSnack(t('pendingExpiry.loadError') || 'שגיאה בטעינת הפריטים');
        return;
      }

      // Resolve display names
      const itemsWithNames = await Promise.all(
        (data || []).map(async (item: any) => {
          let displayName = item.raw_name;
          
          if (item.barcode) {
            try {
              const nameResult = await resolveBarcodeToName(
                item.barcode,
                activeOwnerId,
                currentLocale
              );
              if (nameResult.name) {
                displayName = nameResult.name;
              }
            } catch {}
          }
          
          return {
            ...item,
            displayName: displayName || t('pendingExpiry.unknownProduct') || 'מוצר לא מזוהה',
          };
        })
      );

      setItems(itemsWithNames);
    } catch (error) {
      console.error('[Pending Expiry] Load error:', error);
      setSnack(t('pendingExpiry.loadError') || 'שגיאה בטעינת הפריטים');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOwnerId, currentLocale, t]);

  useFocusEffect(
    useCallback(() => {
      if (!ownerLoading && activeOwnerId) {
        loadItems();
      }
    }, [activeOwnerId, ownerLoading, loadItems])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadItems();
  }, [loadItems]);

  // ============================================================================
  // DATE ENTRY
  // ============================================================================

  const handleOpenKeypad = useCallback((item: PendingItem) => {
    setSelectedItem(item);
    setKeypadVisible(true);
  }, []);

  const playSuccessFeedback = useCallback(async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Vibration.vibrate(100);
    }
    setShowSuccess(true);
    successScale.setValue(0);
    Animated.sequence([
      Animated.spring(successScale, { toValue: 1, tension: 150, friction: 8, useNativeDriver: true }),
      Animated.delay(300),
      Animated.timing(successScale, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => setShowSuccess(false));
  }, [successScale]);

  const handleConfirmDate = useCallback(async (
    dateStr: string,
    day: number,
    month: number,
    year: number
  ) => {
    if (!selectedItem || !activeOwnerId) return;

    setIsSaving(true);

    try {
      const locationId = await getOrCreateDefaultLocation(activeOwnerId);
      if (!locationId) {
        console.error('[Pending Expiry] Could not get default location');
        setSnack(t('pendingExpiry.saveError') || 'שגיאה בשמירה');
        setIsSaving(false);
        return;
      }

      // Get or create product
      let productId: string | null = null;
      const productName = selectedItem.displayName || selectedItem.raw_name || 'Unknown';

      if (selectedItem.barcode) {
        // Check if product exists
        const existingProduct = await getProductByBarcode(activeOwnerId, selectedItem.barcode);
        
        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          // Create new product
          try {
            const newProduct = await createProduct({
              ownerId: activeOwnerId,
              name: productName,
              barcode: selectedItem.barcode,
              category: null,
            });
            productId = newProduct.id;
          } catch (productError) {
            console.warn('[Pending Expiry] Error creating product:', productError);
            // Continue without product_id
          }
        }
      }

      // Create item (batch)
      await createItem({
        owner_id: activeOwnerId,
        product_id: productId,
        barcode_snapshot: selectedItem.barcode || null,
        expiry_date: dateStr,
        location_id: locationId,
      } as any);

      // Mark pending item as resolved
      await supabase
        .from('pending_items')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', selectedItem.id);

      // Close keypad and play success
      setKeypadVisible(false);
      setSelectedItem(null);
      await playSuccessFeedback();

      // Remove item from list
      setItems(prev => {
        const newItems = prev.filter(i => i.id !== selectedItem.id);
        
        // If more items, auto-scroll to next (first item now)
        if (newItems.length > 0) {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: 0, animated: true });
          }, 100);
        }
        
        return newItems;
      });

      setSnack(t('pendingExpiry.saved') || 'נשמר!');

    } catch (error: any) {
      console.error('[Pending Expiry] Save error:', error);
      setSnack(t('pendingExpiry.saveError') || 'שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  }, [selectedItem, activeOwnerId, playSuccessFeedback, t]);

  // ============================================================================
  // DELETE ITEM
  // ============================================================================

  const handleDeleteItem = useCallback(async (item: PendingItem) => {
    try {
      await supabase
        .from('pending_items')
        .delete()
        .eq('id', item.id);
      
      setItems(prev => prev.filter(i => i.id !== item.id));
      setSnack(t('pendingExpiry.deleted') || 'נמחק');
    } catch (error) {
      console.error('[Pending Expiry] Delete error:', error);
      setSnack(t('pendingExpiry.deleteError') || 'שגיאה במחיקה');
    }
  }, [t]);

  // ============================================================================
  // RENDER ITEM
  // ============================================================================

  const renderItem = useCallback(({ item, index }: { item: PendingItem; index: number }) => (
    <Card style={styles.itemCard}>
      <Card.Content style={styles.itemContent}>
        <View style={[styles.itemInfo, isRTL && styles.itemInfoRTL]}>
          <View style={styles.itemIndex}>
            <Text style={styles.itemIndexText}>{index + 1}</Text>
          </View>
          <View style={styles.itemDetails}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.displayName}
            </Text>
            {item.barcode && (
              <Text style={styles.itemBarcode}>{item.barcode}</Text>
            )}
          </View>
        </View>
        
        <View style={[styles.itemActions, isRTL && styles.itemActionsRTL]}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteItem(item)}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#999" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.enterDateButton}
            onPress={() => handleOpenKeypad(item)}
          >
            <MaterialCommunityIcons name="calendar-plus" size={20} color="#FFF" />
            <Text style={styles.enterDateText}>
              {t('pendingExpiry.enterDate') || 'הזן תאריך'}
            </Text>
          </TouchableOpacity>
        </View>
      </Card.Content>
    </Card>
  ), [isRTL, styles, handleOpenKeypad, handleDeleteItem, t]);

  // ============================================================================
  // EMPTY STATE
  // ============================================================================

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="check-circle-outline" size={64} color="#4CAF50" />
        <Text style={styles.emptyTitle}>
          {t('pendingExpiry.allDone') || 'הכל בוצע!'}
        </Text>
        <Text style={styles.emptyText}>
          {t('pendingExpiry.noItems') || 'אין פריטים ממתינים לתאריך תפוגה'}
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>
            {t('common.back') || 'חזרה'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [loading, styles, t, router]);

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  if (ownerLoading || loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME_COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => router.back()}
          iconColor="#333"
        />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {t('pendingExpiry.title') || 'השלמת תאריכים'}
          </Text>
          {items.length > 0 && (
            <Text style={styles.headerSubtitle}>
              {(t('pendingExpiry.remaining') || 'נותרו {count}').replace('{count}', String(items.length))}
            </Text>
          )}
        </View>
        <View style={{ width: 48 }} />
      </View>

      {/* Progress bar */}
      {items.length > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '100%' }]} />
          </View>
        </View>
      )}

      {/* List */}
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* DDMM Keypad Sheet */}
      <DDMMKeypadSheet
        visible={keypadVisible}
        onClose={() => {
          setKeypadVisible(false);
          setSelectedItem(null);
        }}
        onConfirm={handleConfirmDate}
        productName={selectedItem?.displayName}
        barcode={selectedItem?.barcode}
        isLoading={isSaving}
      />

      {/* Success animation */}
      {showSuccess && (
        <Animated.View
          style={[
            styles.successOverlay,
            { transform: [{ scale: successScale }] },
          ]}
          pointerEvents="none"
        >
          <View style={styles.successCircle}>
            <MaterialCommunityIcons name="check" size={48} color="#FFF" />
          </View>
        </Animated.View>
      )}

      {/* Snackbar */}
      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={2000}
      >
        {snack || ''}
      </Snackbar>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const createStyles = (isRTL: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F8F9FA',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    header: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
      backgroundColor: '#FFF',
      borderBottomWidth: 1,
      borderBottomColor: '#E0E0E0',
    },
    headerCenter: {
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#333',
    },
    headerSubtitle: {
      fontSize: 13,
      color: THEME_COLORS.primary,
      fontWeight: '500',
      marginTop: 2,
    },
    progressContainer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: '#FFF',
    },
    progressBar: {
      height: 4,
      backgroundColor: '#E0E0E0',
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: THEME_COLORS.primary,
      borderRadius: 2,
    },
    listContent: {
      padding: 16,
      paddingBottom: 32,
      flexGrow: 1,
    },
    itemCard: {
      marginBottom: 12,
      borderRadius: 12,
      backgroundColor: '#FFF',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
    },
    itemContent: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    itemInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 12,
    },
    itemInfoRTL: {
      flexDirection: 'row-reverse',
    },
    itemIndex: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#F0F0F0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemIndexText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#666',
    },
    itemDetails: {
      flex: 1,
    },
    itemName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#333',
      textAlign: isRTL ? 'right' : 'left',
    },
    itemBarcode: {
      fontSize: 12,
      color: '#999',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      marginTop: 2,
      textAlign: isRTL ? 'right' : 'left',
    },
    itemActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    itemActionsRTL: {
      flexDirection: 'row-reverse',
    },
    deleteButton: {
      padding: 8,
    },
    enterDateButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: THEME_COLORS.primary,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      gap: 8,
    },
    enterDateText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFF',
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingTop: 64,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: '#333',
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 15,
      color: '#666',
      textAlign: 'center',
      marginBottom: 24,
    },
    backButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 10,
      backgroundColor: '#F0F0F0',
    },
    backButtonText: {
      fontSize: 15,
      fontWeight: '500',
      color: '#333',
    },
    successOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#4CAF50',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#4CAF50',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 10,
    },
  });

