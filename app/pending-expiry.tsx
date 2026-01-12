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
import { itemEvents } from '@/lib/events/itemEvents';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { supabase } from '@/lib/supabase/client';
import { createItem } from '@/lib/supabase/mutations/items';
import { createProduct } from '@/lib/supabase/mutations/products';
import { getOrCreateDefaultLocation } from '@/lib/supabase/queries/locations';
import { getProductByBarcode } from '@/lib/supabase/queries/products';
// Name resolution now uses batch lookup from store_barcode_overrides directly
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Animated,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Vibration,
  View,
} from 'react-native';
import {
  Button,
  Card,
  IconButton,
  Snackbar,
  Text,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

// ============================================================================
// DATE UTILITIES
// ============================================================================

const formatDateForDB = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTomorrowDate = (): Date => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
};

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
  // True if displayName is the default unknown/placeholder
  needsName?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PendingExpiryScreen() {
  const router = useRouter();
  const { t, isRTL, currentLocale } = useLanguage();
  const { activeOwnerId } = useActiveOwner();
  const { refresh: refreshSubscription } = useSubscription();
  const queryClient = useQueryClient();
  const styles = createStyles(isRTL);

  const [items, setItems] = useState<PendingItem[]>([]);
  const [refreshing, setRefreshing] = useState(true); // Start with refreshing to show pull indicator
  const [snack, setSnack] = useState<string | null>(null);
  
  // Date picker state
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(getTomorrowDate());
  const [isSaving, setIsSaving] = useState(false);
  
  // Free plan limit state
  const [isProPlan, setIsProPlan] = useState<boolean>(false);
  const [isInFreeTrial, setIsInFreeTrial] = useState<boolean>(false);
  const [currentItemCount, setCurrentItemCount] = useState<number>(0);
  const FREE_PLAN_MAX_ITEMS = 150;
  const TRIAL_DAYS = 30;
  
  // Minimum date (today)
  const minDate = useRef(new Date()).current;
  minDate.setHours(0, 0, 0, 0);
  
  // Success animation
  const [showSuccess, setShowSuccess] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;

  // Refs for auto-scroll
  const flatListRef = useRef<FlatList>(null);
  
  // Delete all confirmation
  const [deleteAllDialogVisible, setDeleteAllDialogVisible] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Name edit modal state
  const [nameEditModalVisible, setNameEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PendingItem | null>(null);
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // ============================================================================
  // LOAD SUBSCRIPTION INFO
  // ============================================================================

  const loadSubscriptionInfo = useCallback(async () => {
    if (!activeOwnerId) return;
    
    try {
      // Load profile info for subscription check
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('subscription_tier, created_at')
        .eq('id', activeOwnerId)
        .maybeSingle();

      if (profileError) {
        console.error('[Pending Expiry] Error loading profile:', profileError);
        return;
      }

      if (profile) {
        const tier = (profile as any).subscription_tier as string | null;
        const createdAt = (profile as any).created_at as string | null;
        
        setIsProPlan(tier === 'pro' || tier === 'pro_plus');
        
        // Check if in free trial
        if (createdAt && tier !== 'pro' && tier !== 'pro_plus') {
          const signupDate = new Date(createdAt);
          signupDate.setHours(0, 0, 0, 0);
          const trialEnd = new Date(signupDate);
          trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
          trialEnd.setHours(23, 59, 59, 999);
          const now = new Date();
          setIsInFreeTrial(now <= trialEnd);
        } else {
          setIsInFreeTrial(false);
        }
      }

      // Count current active items
      const { count, error: countError } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', activeOwnerId)
        .neq('status', 'resolved');

      if (!countError && count !== null) {
        setCurrentItemCount(count);
      }
    } catch (error) {
      console.error('[Pending Expiry] Error loading subscription info:', error);
    }
  }, [activeOwnerId, TRIAL_DAYS]);

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

      const unknownProductText = t('pendingExpiry.unknownProduct') || 'מוצר לא מזוהה';
      
      // STEP 1: Show items immediately with raw_name (fast)
      const initialItems = (data || []).map((item: any) => ({
        ...item,
        displayName: item.raw_name || unknownProductText,
        needsName: !item.raw_name,
      }));
      
      setItems(initialItems);
      setRefreshing(false);
      
      // STEP 2: Resolve better names in background (for items with barcode but no raw_name)
      const itemsNeedingResolution = initialItems.filter(
        (item: any) => item.barcode && !item.raw_name
      );
      
      if (itemsNeedingResolution.length > 0) {
        // Batch lookup: get all barcodes at once from store_barcode_overrides
        const barcodes = itemsNeedingResolution.map((i: any) => i.barcode);
        
        const { data: overrides } = await supabase
          .from('store_barcode_overrides')
          .select('barcode, custom_name')
          .eq('store_id', activeOwnerId)
          .in('barcode', barcodes);
        
        if (overrides && overrides.length > 0) {
          const overrideMap = new Map(overrides.map(o => [o.barcode, o.custom_name]));
          
          // Update items with resolved names
          setItems(prev => prev.map(item => {
            if (item.barcode && overrideMap.has(item.barcode)) {
              return {
                ...item,
                displayName: overrideMap.get(item.barcode) || item.displayName,
                needsName: false,
              };
            }
            return item;
          }));
        }
      }
    } catch (error) {
      console.error('[Pending Expiry] Load error:', error);
      setSnack(t('pendingExpiry.loadError') || 'שגיאה בטעינת הפריטים');
      setRefreshing(false);
    }
  }, [activeOwnerId, t]);

  useFocusEffect(
    useCallback(() => {
      // Don't wait for ownerLoading - activeOwnerId is available immediately from cache
      if (activeOwnerId) {
        loadItems();
        loadSubscriptionInfo();
      }
    }, [activeOwnerId, loadItems, loadSubscriptionInfo])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadItems();
  }, [loadItems]);

  // ============================================================================
  // DATE ENTRY
  // ============================================================================

  const handleOpenDatePicker = useCallback((item: PendingItem) => {
    setSelectedItem(item);
    setSelectedDate(getTomorrowDate());
    setDatePickerVisible(true);
  }, []);

  const handleCloseDatePicker = useCallback(() => {
    setDatePickerVisible(false);
    setSelectedItem(null);
  }, []);

  const handleDateChange = useCallback((event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        handleCloseDatePicker();
        return;
      }
    }
    if (date && date >= minDate) {
      setSelectedDate(date);
    }
  }, [minDate, handleCloseDatePicker]);

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

  const handleConfirmDate = useCallback(async () => {
    if (!selectedItem || !activeOwnerId) return;

    // Check free plan limit (only for non-pro, non-trial users)
    if (!isProPlan && !isInFreeTrial && currentItemCount >= FREE_PLAN_MAX_ITEMS) {
      setSnack(t('pendingExpiry.limitReached') || 'הגעת למגבלת 150 מוצרים. שדרג לפרו להוספת מוצרים נוספים.');
      setDatePickerVisible(false);
      setSelectedItem(null);
      return;
    }

    // CRITICAL: Get the LATEST item from state (not selectedItem which might be stale after name edit)
    const latestItem = items.find(i => i.id === selectedItem.id);
    if (!latestItem) {
      console.error('[Pending Expiry] Item not found in state:', selectedItem.id);
      return;
    }

    console.log('[Pending Expiry] 🔄 Using latest item from state:', {
      selectedItemName: selectedItem.displayName,
      latestItemName: latestItem.displayName,
      wasUpdated: selectedItem.displayName !== latestItem.displayName
    });

    // Capture data for background save
    const itemToSave = latestItem; // Use latest from state, not stale selectedItem
    const dateToSave = selectedDate;
    const ownerId = activeOwnerId;

    // === OPTIMISTIC UI UPDATE - Immediate ===
    // Close date picker immediately
    setDatePickerVisible(false);
    setSelectedItem(null);
    
    // Play success feedback immediately
    playSuccessFeedback();
    
    // Increment current item count for free plan tracking
    setCurrentItemCount(prev => prev + 1);
    
    // Remove item from list immediately
    setItems(prev => {
      const newItems = prev.filter(i => i.id !== itemToSave.id);
      
      // If more items, auto-scroll to next (first item now)
      if (newItems.length > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: 0, animated: true });
        }, 100);
      }
      
      return newItems;
    });
    
    // CRITICAL: Add item optimistically to "All" screen cache IMMEDIATELY
    // This ensures the item appears in "All" screen right away
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const displayName = itemToSave.displayName || itemToSave.raw_name || 'מוצר חדש';
    const dateStr = formatDateForDB(dateToSave);
    
    const queryKey = ['items', ownerId, 'all'];
    queryClient.setQueryData(queryKey, (old: any[] = []) => {
      console.log('[Pending Expiry] Adding optimistic item to cache:', displayName);
      return [
        ...old,
        {
          id: tempId,
          owner_id: ownerId,
          product_name: displayName,
          expiry_date: dateStr,
          barcode_snapshot: itemToSave.barcode || null,
          product_barcode: itemToSave.barcode || null,
          product_category: null,
          product_id: null,
          location_id: null,
          location_name: null,
          location_order: null,
          product_image_url: null,
          note: null,
          status: 'ok',
          resolved_reason: null,
          is_plan_locked: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _optimistic: true,
          _syncStatus: 'pending',
        },
      ];
    });
    
    // Invalidate to trigger re-render
    queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
    console.log('[Pending Expiry] Optimistic item added and cache invalidated');
    
    setSnack(t('pendingExpiry.saved') || 'נשמר!');

    // === BACKGROUND SAVE - Fire and forget ===
    (async () => {
      try {
        const locationId = await getOrCreateDefaultLocation(ownerId);
        if (!locationId) {
          console.error('[Pending Expiry] Could not get default location');
          return;
        }

        // Get or create product
        let productId: string | null = null;
        const productName = itemToSave.displayName || itemToSave.raw_name || 'Unknown';
        
        console.log('[Pending Expiry] 🔍 Creating product for item:', {
          barcode: itemToSave.barcode,
          displayName: itemToSave.displayName,
          raw_name: itemToSave.raw_name,
          productName: productName
        });

        if (itemToSave.barcode && itemToSave.barcode.trim()) {
          // Has barcode - check if product exists
          const existingProduct = await getProductByBarcode(ownerId, itemToSave.barcode);
          
          if (existingProduct) {
            productId = existingProduct.id;
            console.log('[Pending Expiry] ✅ Using existing product:', existingProduct.name);
          } else {
            // Create new product with barcode
            try {
              console.log('[Pending Expiry] 📦 Creating NEW product WITH BARCODE, name:', productName);
              const newProduct = await createProduct({
                ownerId: ownerId,
                name: productName,
                barcode: itemToSave.barcode,
                category: null,
              });
              productId = newProduct.id;
              console.log('[Pending Expiry] ✅ Product created successfully:', newProduct.name);
            } catch (productError) {
              console.warn('[Pending Expiry] ❌ Error creating product:', productError);
              // Continue without product_id
            }
          }
        } else {
          // No barcode - create product without barcode
          try {
            console.log('[Pending Expiry] 📦 Creating NEW product WITHOUT BARCODE, name:', productName);
            const newProduct = await createProduct({
              ownerId: ownerId,
              name: productName,
              barcode: null,
              category: null,
            });
            productId = newProduct.id;
            console.log('[Pending Expiry] ✅ Product created successfully (no barcode):', newProduct.name);
          } catch (productError) {
            console.warn('[Pending Expiry] ❌ Error creating product without barcode:', productError);
            // Continue without product_id
          }
        }

        // Format date for DB
        const dateStr = formatDateForDB(dateToSave);

        // Create item (batch)
        const newItem = await createItem({
          owner_id: ownerId,
          product_id: productId,
          barcode_snapshot: itemToSave.barcode || null,
          expiry_date: dateStr,
          location_id: locationId,
        } as any);

        console.log('[Pending Expiry] Item created on server:', newItem);

        // CRITICAL: Replace optimistic temp item with real server item
        if (newItem && newItem.id) {
          const queryKey = ['items', ownerId, 'all'];
          queryClient.setQueryData(queryKey, (old: any[] = []) => {
            // Remove ALL temp items
            const withoutTemp = old.filter((item) => !item.id.startsWith('temp_'));
            
            // Check if item already exists (to avoid duplicates)
            const existingIndex = withoutTemp.findIndex((item) => item.id === newItem.id);
            
            if (existingIndex >= 0) {
              // Replace existing item
              const updated = [...withoutTemp];
              updated[existingIndex] = {
                ...(newItem as any),
                product_name: (newItem as any).product_name || productName,
                _syncStatus: 'synced'
              };
              return updated;
            } else {
              // Add new item
              return [
                ...withoutTemp, 
                { 
                  ...(newItem as any), 
                  product_name: (newItem as any).product_name || productName,
                  _syncStatus: 'synced' 
                }
              ];
            }
          });
          
          console.log('[Pending Expiry] Cache updated with real server item:', newItem.id);
        }

        // CRITICAL: Invalidate TanStack Query cache to refresh All screen
        // This ensures the newly saved items appear immediately in the All screen
        console.log('[Pending Expiry] Invalidating items cache after saving item');
        if (ownerId) {
          queryClient.invalidateQueries({ queryKey: ['items', ownerId, 'all'], refetchType: 'none' });
          queryClient.invalidateQueries({ queryKey: ['items', ownerId, 'expired'], refetchType: 'none' });
          queryClient.invalidateQueries({ queryKey: ['stats', ownerId] });
          
          // Refresh subscription to update activeItemsCount and canAddItems
          // This prevents collaborators from exceeding the owner's plan limit
          if (refreshSubscription) {
            await refreshSubscription();
            console.log('[Pending Expiry] Subscription refreshed after adding item');
          }
        }

        // Mark pending item as resolved
        await supabase
          .from('pending_items')
          .update({ resolved_at: new Date().toISOString() })
          .eq('id', itemToSave.id);

      } catch (error: any) {
        console.error('[Pending Expiry] Background save error:', error);
        // Rollback: add item back to list
        setItems(prev => [itemToSave, ...prev]);
        setCurrentItemCount(prev => Math.max(0, prev - 1));
        setSnack(t('pendingExpiry.saveError') || 'שגיאה בשמירה');
      }
    })();
  }, [selectedItem, activeOwnerId, selectedDate, playSuccessFeedback, t, isProPlan, isInFreeTrial, currentItemCount, items]);

  // ============================================================================
  // EDIT NAME (for items without names)
  // ============================================================================

  const handleOpenNameEdit = useCallback((item: PendingItem) => {
    setEditingItem(item);
    // If unknown product, start empty. Otherwise show current name for editing
    const isUnknown = item.displayName === (t('pendingExpiry.unknownProduct') || 'מוצר לא מזוהה');
    setEditedName(isUnknown ? '' : (item.displayName || ''));
    setNameEditModalVisible(true);
  }, [t]);

  const handleCloseNameEdit = useCallback(() => {
    setNameEditModalVisible(false);
    setEditingItem(null);
    setEditedName('');
  }, []);

  const handleSaveName = useCallback(async () => {
    if (!editingItem || !activeOwnerId || !editedName.trim()) {
      setSnack(t('pendingExpiry.enterName') || 'נא להזין שם מוצר');
      return;
    }

    // Normalize name: trim, remove double spaces, limit length
    const MAX_NAME_LENGTH = 100;
    const normalizedName = editedName
      .trim()
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single
      .substring(0, MAX_NAME_LENGTH);
    
    // Validate name length
    if (normalizedName.length < 3) {
      setSnack(t('fastScan.nameTooShort') || 'לפחות 3 תווים');
      return;
    }

    setIsSavingName(true);

    try {
      // Optimistic UI update
      setItems(prev => prev.map(item => 
        item.id === editingItem.id 
          ? { ...item, displayName: normalizedName, needsName: false }
          : item
      ));

      // Close modal immediately for better UX
      handleCloseNameEdit();
      setSnack(t('fastScan.nameSaved') || 'השם נשמר');

      // Save to store_barcode_overrides in background (if has barcode)
      if (editingItem.barcode) {
        // Normalize barcode (digits only) before saving
        const normalizedBarcode = editingItem.barcode.replace(/\D/g, '');
        
        if (normalizedBarcode) {
          const { error: overrideError } = await supabase
            .from('store_barcode_overrides')
            .upsert({
              store_id: activeOwnerId,
              barcode: normalizedBarcode,
              custom_name: normalizedName,
              updated_at: new Date().toISOString(),
            }, { 
              onConflict: 'store_id,barcode',
              ignoreDuplicates: false // Allow update if exists
            });

          if (overrideError) {
            console.warn('[Pending Expiry] Failed to save override:', overrideError);
          } else {
            console.log('[Pending Expiry] Saved name override for barcode:', normalizedBarcode);
          }
        }
      }

      // Also update pending_items.raw_name for persistence
      await supabase
        .from('pending_items')
        .update({ raw_name: normalizedName })
        .eq('id', editingItem.id);

    } catch (error) {
      console.error('[Pending Expiry] Error saving name:', error);
      // Rollback
      setItems(prev => prev.map(item => 
        item.id === editingItem.id 
          ? { ...item, displayName: editingItem.displayName, needsName: editingItem.needsName }
          : item
      ));
      setSnack(t('pendingExpiry.saveError') || 'שגיאה בשמירה');
    } finally {
      setIsSavingName(false);
    }
  }, [editingItem, editedName, activeOwnerId, t, handleCloseNameEdit]);

  // ============================================================================
  // DELETE ITEM
  // ============================================================================

  const handleDeleteItem = useCallback(async (item: PendingItem) => {
    // Optimistic UI update - remove immediately
    setItems(prev => prev.filter(i => i.id !== item.id));
    setSnack(t('pendingExpiry.deleted') || 'נמחק');
    
    // Delete in background
    (async () => {
      try {
        await supabase
          .from('pending_items')
          .delete()
          .eq('id', item.id);
      } catch (error) {
        console.error('[Pending Expiry] Delete error:', error);
        // Rollback: add item back
        setItems(prev => [...prev, item].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ));
        setSnack(t('pendingExpiry.deleteError') || 'שגיאה במחיקה');
      }
    })();
  }, [t]);

  // ============================================================================
  // DELETE ALL ITEMS
  // ============================================================================

  const handleDeleteAll = useCallback(async () => {
    if (!activeOwnerId || items.length === 0) return;
    
    setIsDeletingAll(true);
    try {
      // Delete all unresolved pending items for this owner
      const { error } = await supabase
        .from('pending_items')
        .delete()
        .eq('store_id', activeOwnerId)
        .is('resolved_at', null);
      
      if (error) {
        console.error('[Pending Expiry] Delete all error:', error);
        setSnack(t('pendingExpiry.deleteError') || 'שגיאה במחיקה');
      } else {
        setItems([]);
        setSnack(t('pendingExpiry.allDeleted') || 'כל הפריטים נמחקו');
      }
    } catch (error) {
      console.error('[Pending Expiry] Delete all error:', error);
      setSnack(t('pendingExpiry.deleteError') || 'שגיאה במחיקה');
    } finally {
      setIsDeletingAll(false);
      setDeleteAllDialogVisible(false);
    }
  }, [activeOwnerId, items.length, t]);

  // ============================================================================
  // RENDER ITEM
  // ============================================================================

  const renderItem = useCallback(({ item, index }: { item: PendingItem; index: number }) => (
    <Card style={styles.itemCard}>
      <Card.Content style={styles.itemContent}>
        <TouchableOpacity 
          style={[styles.itemInfo, isRTL && styles.itemInfoRTL]}
          onPress={() => handleOpenNameEdit(item)}
          activeOpacity={0.7}
        >
          <View style={styles.itemIndex}>
            <Text style={styles.itemIndexText}>{index + 1}</Text>
          </View>
          <View style={styles.itemDetails}>
            <View style={styles.itemNameRow}>
              <View style={styles.nameWithEditIcon}>
                <Text style={[styles.itemName, item.needsName && styles.itemNameMissing]} numberOfLines={2}>
                  {item.displayName}
                </Text>
                <MaterialCommunityIcons 
                  name="pencil" 
                  size={14} 
                  color={item.needsName ? THEME_COLORS.error : '#999'} 
                  style={styles.editNameIcon}
                />
              </View>
              {item.needsName && (
                <MaterialCommunityIcons name="pencil" size={16} color={THEME_COLORS.primary} style={styles.editIcon} />
              )}
            </View>
            {item.barcode && (
              <Text style={styles.itemBarcode}>{item.barcode}</Text>
            )}
            {item.needsName && (
              <Text style={styles.needsNameHint}>
                {t('supplierIntake.needsManualName') || 'לחץ להזנת שם'}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        
        <View style={[styles.itemActions, isRTL && styles.itemActionsRTL]}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteItem(item)}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#999" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.enterDateButton}
            onPress={() => handleOpenDatePicker(item)}
          >
            <MaterialCommunityIcons name="calendar-plus" size={20} color="#FFF" />
            <Text style={styles.enterDateText}>
              {t('pendingExpiry.enterDate') || 'הזן תאריך'}
            </Text>
          </TouchableOpacity>
        </View>
      </Card.Content>
    </Card>
  ), [isRTL, styles, handleOpenDatePicker, handleDeleteItem, t]);

  // ============================================================================
  // EMPTY STATE
  // ============================================================================

  const renderEmpty = useCallback(() => {
    // Show nothing while refreshing (loading initial data)
    if (refreshing) return null;
    
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
  }, [refreshing, styles, t, router]);

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  // No blocking - activeOwnerId is available immediately from cache
  // Items will load with RefreshControl indicator

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
        {items.length > 0 ? (
          <TouchableOpacity
            style={styles.deleteAllButton}
            onPress={() => setDeleteAllDialogVisible(true)}
          >
            <Text style={styles.deleteAllButtonText}>
              {t('pendingExpiry.deleteAll') || 'מחק הכל'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {/* Progress bar */}
      {items.length > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '100%' }]} />
          </View>
        </View>
      )}

      {/* Info banner - show if any items need verification */}
      {items.length > 0 && items.some(item => item.needsName || !item.barcode) && (
        <View style={styles.infoBanner}>
          <MaterialCommunityIcons name="information-outline" size={20} color="#1976D2" style={styles.infoBannerIcon} />
          <View style={styles.infoBannerContent}>
            <Text style={styles.infoBannerTitle}>
              {t('pendingExpiry.autoDetectedTitle') || 'זיהוי אוטומטי מתעודת משלוח'}
            </Text>
            <Text style={styles.infoBannerText}>
              {t('pendingExpiry.autoDetectedMessage') || 'חלק מהפרטים זוהו אוטומטית ועשויים לדרוש אימות. ניתן להשלים או לסרוק ברקוד במידת הצורך.'}
            </Text>
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

      {/* Date Picker Modal */}
      <Modal
        visible={datePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseDatePicker}
      >
        <TouchableWithoutFeedback onPress={handleCloseDatePicker}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.datePickerCard}>
                {/* Header */}
                <View style={styles.datePickerHeader}>
                  <Text style={styles.datePickerTitle}>
                    {t('fastScan.selectExpiryDate') || 'בחר תאריך תפוגה'}
                  </Text>
                  {selectedItem && (
                    <Text style={styles.datePickerProductName} numberOfLines={1}>
                      {selectedItem.displayName}
                    </Text>
                  )}
                </View>

                {/* Date Picker */}
                <View style={styles.datePickerContainer}>
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={minDate}
                    onChange={handleDateChange}
                    locale={currentLocale}
                    style={styles.datePicker}
                    themeVariant="light"
                  />
                </View>

                {/* Actions */}
                <View style={styles.datePickerActions}>
                  <Button
                    mode="outlined"
                    onPress={handleCloseDatePicker}
                    style={styles.datePickerCancelButton}
                    labelStyle={styles.datePickerCancelLabel}
                  >
                    {t('common.cancel') || 'ביטול'}
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleConfirmDate}
                    style={styles.datePickerConfirmButton}
                    labelStyle={styles.datePickerConfirmLabel}
                    buttonColor={THEME_COLORS.primary}
                    loading={isSaving}
                    disabled={isSaving}
                  >
                    {t('common.confirm') || 'אישור'}
                  </Button>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Delete All Confirmation Modal */}
      <Modal
        visible={deleteAllDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteAllDialogVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDeleteAllDialogVisible(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.deleteAllCard}>
                <View style={styles.deleteAllIconContainer}>
                  <MaterialCommunityIcons name="trash-can-outline" size={32} color="#EF4444" />
                </View>
                <Text style={styles.deleteAllTitle}>
                  {t('pendingExpiry.deleteAllTitle') || 'מחיקת כל הפריטים'}
                </Text>
                <Text style={styles.deleteAllMessage}>
                  {(t('pendingExpiry.deleteAllMessage') || 'האם אתה בטוח שברצונך למחוק את כל {count} הפריטים?').replace('{count}', String(items.length))}
                </Text>
                <View style={styles.deleteAllActions}>
                  <Button
                    mode="outlined"
                    onPress={() => setDeleteAllDialogVisible(false)}
                    style={styles.deleteAllCancelButton}
                    labelStyle={styles.deleteAllCancelLabel}
                    disabled={isDeletingAll}
                  >
                    {t('common.cancel') || 'ביטול'}
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleDeleteAll}
                    style={styles.deleteAllConfirmButton}
                    labelStyle={styles.deleteAllConfirmLabel}
                    buttonColor="#EF4444"
                    loading={isDeletingAll}
                    disabled={isDeletingAll}
                  >
                    {t('common.delete') || 'מחיקה'}
                  </Button>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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

      {/* Name Edit Modal */}
      <Modal
        visible={nameEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseNameEdit}
      >
        <TouchableWithoutFeedback onPress={handleCloseNameEdit}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.nameEditCard}>
                {/* Header */}
                <View style={styles.nameEditHeader}>
                  <Text style={styles.nameEditTitle}>
                    {t('supplierIntake.enterProductName') || 'הזנת שם מוצר'}
                  </Text>
                  {editingItem?.barcode && (
                    <Text style={styles.nameEditBarcode}>{editingItem.barcode}</Text>
                  )}
                </View>

                {/* Input */}
                <View style={styles.nameEditInputContainer}>
                  <TextInput
                    style={[styles.nameEditInput, isRTL && styles.nameEditInputRTL]}
                    value={editedName}
                    onChangeText={setEditedName}
                    placeholder={t('fastScan.productNamePlaceholder') || 'שם המוצר...'}
                    placeholderTextColor="#999"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                </View>

                {/* Actions */}
                <View style={styles.nameEditActions}>
                  <Button
                    mode="outlined"
                    onPress={handleCloseNameEdit}
                    style={styles.nameEditCancelButton}
                    labelStyle={styles.nameEditCancelLabel}
                  >
                    {t('common.cancel') || 'ביטול'}
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleSaveName}
                    style={styles.nameEditConfirmButton}
                    labelStyle={styles.nameEditConfirmLabel}
                    buttonColor={THEME_COLORS.primary}
                    loading={isSavingName}
                    disabled={isSavingName || !editedName.trim()}
                  >
                    {t('common.save') || 'שמור'}
                  </Button>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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
    deleteAllButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: '#FEE2E2',
    },
    deleteAllButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#DC2626',
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
    infoBanner: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      backgroundColor: '#E3F2FD',
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 4,
      padding: 12,
      borderRadius: 10,
      borderLeftWidth: isRTL ? 0 : 3,
      borderRightWidth: isRTL ? 3 : 0,
      borderColor: '#1976D2',
    },
    infoBannerIcon: {
      marginTop: 2,
    },
    infoBannerContent: {
      flex: 1,
      marginHorizontal: 10,
    },
    infoBannerTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: '#1565C0',
      textAlign: isRTL ? 'right' : 'left',
      marginBottom: 2,
    },
    infoBannerText: {
      fontSize: 12,
      color: '#1976D2',
      textAlign: isRTL ? 'right' : 'left',
      lineHeight: 18,
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
      flex: 1,
    },
    itemNameMissing: {
      color: '#999',
      fontStyle: 'italic',
    },
    itemNameRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 6,
    },
    nameWithEditIcon: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    editNameIcon: {
      opacity: 0.6,
    },
    editIcon: {
      marginTop: 2,
    },
    needsNameHint: {
      fontSize: 11,
      color: THEME_COLORS.primary,
      marginTop: 2,
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
    // Date Picker Modal styles
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    datePickerCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      width: '100%',
      maxWidth: 360,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.2,
          shadowRadius: 24,
        },
        android: {
          elevation: 12,
        },
      }),
    },
    datePickerHeader: {
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#F3F4F6',
    },
    datePickerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#111827',
      textAlign: 'center',
    },
    datePickerProductName: {
      fontSize: 14,
      fontWeight: '500',
      color: '#6B7280',
      textAlign: 'center',
      marginTop: 4,
    },
    datePickerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      backgroundColor: '#FAFAFA',
    },
    datePicker: {
      width: '100%',
      height: Platform.OS === 'ios' ? 200 : 'auto',
    },
    datePickerActions: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: '#F3F4F6',
    },
    datePickerCancelButton: {
      flex: 1,
      borderRadius: 12,
      borderColor: '#E5E7EB',
    },
    datePickerCancelLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
    datePickerConfirmButton: {
      flex: 1,
      borderRadius: 12,
    },
    datePickerConfirmLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
    // Delete All Modal styles
    deleteAllCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 20,
      width: '100%',
      maxWidth: 320,
      padding: 24,
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.2,
          shadowRadius: 24,
        },
        android: {
          elevation: 12,
        },
      }),
    },
    deleteAllIconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#FEE2E2',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    deleteAllTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#111827',
      textAlign: 'center',
      marginBottom: 8,
    },
    deleteAllMessage: {
      fontSize: 14,
      color: '#6B7280',
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    deleteAllActions: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      gap: 12,
      width: '100%',
    },
    deleteAllCancelButton: {
      flex: 1,
      borderRadius: 12,
      borderColor: '#E5E7EB',
    },
    deleteAllCancelLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    deleteAllConfirmButton: {
      flex: 1,
      borderRadius: 12,
    },
    deleteAllConfirmLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    // Name Edit Modal styles
    nameEditCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 20,
      width: '100%',
      maxWidth: 320,
      padding: 24,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.25,
          shadowRadius: 20,
        },
        android: {
          elevation: 15,
        },
      }),
    },
    nameEditHeader: {
      marginBottom: 16,
    },
    nameEditTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#333',
      textAlign: 'center',
      marginBottom: 4,
    },
    nameEditBarcode: {
      fontSize: 12,
      color: '#999',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      textAlign: 'center',
    },
    nameEditInputContainer: {
      marginBottom: 20,
    },
    nameEditInput: {
      backgroundColor: '#F5F5F5',
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: '#333',
      textAlign: isRTL ? 'right' : 'left',
    },
    nameEditInputRTL: {
      textAlign: 'right',
    },
    nameEditActions: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    nameEditCancelButton: {
      flex: 1,
      borderRadius: 12,
      borderColor: '#DDD',
    },
    nameEditCancelLabel: {
      fontSize: 14,
    },
    nameEditConfirmButton: {
      flex: 1,
      borderRadius: 12,
    },
    nameEditConfirmLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
  });

