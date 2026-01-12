/**
 * Fast Scan Screen - Continuous Camera + Inline Date Picker
 * 
 * State machine:
 * A: No barcode → "כוון לברקוד", minimal bottom bar
 * B: Barcode + name resolved → show name (tappable) + date picker inline
 * C: Barcode + name missing → "מוצר לא מזוהה", prompt for name first
 * D: Date saved → show date text, ready for next scan
 * 
 * NO OCR, NO system keyboard modal, continuous scanning loop
 * Camera stays open at all times
 */

import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { itemEvents } from '@/lib/events/itemEvents';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useDatePickerStyle } from '@/lib/hooks/useDatePickerStyle';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { supabase } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { createItem } from '@/lib/supabase/mutations/items';
import { createProduct } from '@/lib/supabase/mutations/products';
import { getOrCreateDefaultLocation } from '@/lib/supabase/queries/locations';
import { getProductByBarcode } from '@/lib/supabase/queries/products';
import { resolveBarcodeToName, saveStoreOverride, submitBarcodeSuggestion, updateBarcodeCatalog } from '@/lib/supabase/services/barcodeNameService';
import { logExpiryEvent } from '@/lib/supabase/services/expiryEventsService';
import { tryResolvePendingItem } from '@/lib/supabase/services/pendingItemsService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Vibration,
  View,
} from 'react-native';
import { Button, IconButton, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Animation constants - fast and subtle
const ANIMATION = {
  FRAME_PULSE_DURATION: 2500,
  SCAN_SCALE_DURATION: 200,
  SHEET_SLIDE_DURATION: 250,
  PRESS_DURATION: 100,
  EASE_OUT: Easing.bezier(0.25, 0.1, 0.25, 1),
  EASE_OUT_BACK: Easing.bezier(0.34, 1.56, 0.64, 1),
};

// ============================================================================
// DATE UTILITIES
// ============================================================================

const formatDateForDB = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateForDisplay = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const getTomorrowDate = (): Date => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
};

// ============================================================================
// STATE TYPES
// ============================================================================

type ScanState =
  | 'idle'
  | 'scanned_loading'
  | 'scanned_unnamed'
  | 'scanned_ready'      // Has name, ready to pick date
  | 'entering_name'      // Inline name editor
  | 'date_saved';        // Date saved, showing saved date

// ============================================================================
// ANIMATED SCAN FRAME
// ============================================================================

function AnimatedScanFrame() {
  const pulseAnim = useRef(new Animated.Value(0.7)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Subtle pulse animation on frame opacity
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: ANIMATION.FRAME_PULSE_DURATION / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: ANIMATION.FRAME_PULSE_DURATION / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Expose scale animation for detection feedback
  const triggerScanAnimation = useCallback(() => {
    scaleAnim.setValue(1);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.03,
        duration: ANIMATION.SCAN_SCALE_DURATION / 2,
        easing: ANIMATION.EASE_OUT_BACK,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: ANIMATION.SCAN_SCALE_DURATION / 2,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim]);

  return {
    pulseAnim,
    scaleAnim,
    triggerScanAnimation,
  };
}

// ============================================================================
// ANIMATED PRODUCT ROW
// ============================================================================

interface AnimatedProductRowProps {
  productName: string | null;
  barcode: string | null;
  onPress: () => void;
  isRTL: boolean;
}

function AnimatedProductRow({ productName, barcode, onPress, isRTL }: AnimatedProductRowProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.98,
      duration: ANIMATION.PRESS_DURATION,
      easing: ANIMATION.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: ANIMATION.PRESS_DURATION * 1.5,
      easing: ANIMATION.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.productRow, { transform: [{ scale: scaleAnim }] }]}>
        <View style={[styles.productNameRow, isRTL && styles.productNameRowRTL]}>
          <Text style={styles.productName} numberOfLines={1}>{productName}</Text>
          <MaterialCommunityIcons name="pencil-outline" size={16} color="#999" />
        </View>
        <Text style={styles.barcodeSmall}>{barcode}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ============================================================================
// ANIMATED SAVE BUTTON
// ============================================================================

interface AnimatedSaveButtonProps {
  onPress: () => void;
  disabled: boolean;
  isSaving: boolean;
  label: string;
}

function AnimatedSaveButton({ onPress, disabled, isSaving, label }: AnimatedSaveButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: ANIMATION.PRESS_DURATION,
      easing: ANIMATION.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: ANIMATION.PRESS_DURATION * 1.5,
      easing: ANIMATION.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = async () => {
    if (disabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.saveButton,
          disabled && styles.saveButtonDisabled,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <>
            <MaterialCommunityIcons name="check" size={22} color="#FFF" />
            <Text style={styles.saveButtonText}>{label}</Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function FastScanScreen() {
  const { t, isRTL, currentLocale } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { activeOwnerId, isViewer, isOwner: isOwnerFromHook, loading: ownerLoading } = useActiveOwner();
  // Use isOwner directly from hook - it's accurate for both owners and collaborators (editors/viewers)
  const isOwner = isOwnerFromHook;
  const { datePickerStyle } = useDatePickerStyle();
  const { isPro, isFreeTrialActive, loading: subscriptionLoading, subscription } = useSubscription();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  // Free plan limit state
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [loadingItemCount, setLoadingItemCount] = useState(true);
  const FREE_PLAN_LIMIT = 150;
  const PRO_PLAN_LIMIT = 2000;

  // Mode: 'full' for barcode + date, 'date_only' for just date (UPDATE DATE flow)
  const mode = (params.mode as string) || 'full';
  const existingItemId = params.itemId as string | undefined;
  const existingBarcode = params.barcode as string | undefined;
  const existingProductName = params.productName as string | undefined;

  const [permission, requestPermission] = useCameraPermissions();

  // State machine
  const [scanState, setScanState] = useState<ScanState>(mode === 'date_only' ? 'scanned_ready' : 'idle');
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(existingBarcode || null);
  const [productName, setProductName] = useState<string | null>(existingProductName || null);

  // Name entry
  const [nameInput, setNameInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  // Date picker
  const [selectedDate, setSelectedDate] = useState<Date>(getTomorrowDate());
  const [savedDate, setSavedDate] = useState<Date | null>(null);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // Success animation
  const [showSuccess, setShowSuccess] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;

  // Scan control
  const isProcessingRef = useRef(false);
  const lastBarcodeRef = useRef<string | null>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;
  const nameInputRef = useRef<TextInput>(null);
  const cameraRef = useRef<any>(null);

  // Animated scan frame
  const { pulseAnim, scaleAnim: frameScaleAnim, triggerScanAnimation } = AnimatedScanFrame();

  // Bottom sheet animation
  const sheetTranslateY = useRef(new Animated.Value(50)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  // Tap-to-focus
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const focusScale = useRef(new Animated.Value(1.2)).current;

  const handleCameraTap = useCallback(async (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;

    // Show focus indicator at tap location
    setFocusPoint({ x: locationX, y: locationY });

    // Light haptic feedback
    Haptics.selectionAsync();

    // Try to focus the camera at the tapped point
    try {
      if (cameraRef.current) {
        // Get the camera view dimensions
        const layout = event.nativeEvent.target;
        
        // Normalize coordinates (0-1 range)
        // expo-camera expects normalized coordinates
        const normalizedX = locationX / Dimensions.get('window').width;
        const normalizedY = locationY / Dimensions.get('window').height;
        
        console.log('[Fast Scan] Focusing camera at:', { x: normalizedX, y: normalizedY });
        
        // Call focus method if available
        if (typeof cameraRef.current.focus === 'function') {
          await cameraRef.current.focus();
        }
      }
    } catch (error) {
      console.log('[Fast Scan] Camera focus not supported or error:', error);
    }

    // Animate focus indicator
    focusAnim.setValue(1);
    focusScale.setValue(1.2);

    Animated.parallel([
      Animated.timing(focusScale, {
        toValue: 1,
        duration: 200,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(focusAnim, {
          toValue: 0,
          duration: 300,
          easing: ANIMATION.EASE_OUT,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setFocusPoint(null);
    });
  }, [focusAnim, focusScale]);

  // Check for offline save success messages
  useEffect(() => {
    const checkOfflineSuccess = async () => {
      try {
        const offlineSuccess = await AsyncStorage.getItem('offline_save_success');
        if (offlineSuccess) {
          setSnackMessage(offlineSuccess);
          await AsyncStorage.removeItem('offline_save_success');
        }
      } catch { }
    };
    checkOfflineSuccess();
  }, []);

  // Check item count for plan limits
  useEffect(() => {
    // Skip if trial active or loading
    if (isFreeTrialActive || subscriptionLoading) {
      setLoadingItemCount(false);
      return;
    }

    // Skip if no owner
    if (!activeOwnerId) {
      setLoadingItemCount(false);
      return;
    }

    const checkItemCount = async () => {
      setLoadingItemCount(true);
      try {
        const { count, error } = await supabase
          .from('items')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', activeOwnerId)
          .neq('status', 'resolved');

        if (!error && count !== null) {
          setItemCount(count);
        }
      } catch (err) {
        console.error('Error checking item count:', err);
      } finally {
        setLoadingItemCount(false);
      }
    };

    checkItemCount();
  }, [activeOwnerId, isPro, isFreeTrialActive, subscriptionLoading]);

  // Check if user has reached plan limit
  const hasReachedPlanLimit = !isFreeTrialActive && !subscriptionLoading && itemCount !== null && (
    // Pro plan limit (2000 items)
    (isPro && subscription?.plan === 'pro' && subscription?.isPaidActive && itemCount >= PRO_PLAN_LIMIT) ||
    // Free plan limit (150 items) 
    (!isPro && itemCount >= FREE_PLAN_LIMIT)
  );

  const isPlanLimitPro = isPro && subscription?.plan === 'pro' && subscription?.isPaidActive && itemCount !== null && itemCount >= PRO_PLAN_LIMIT;

  // Animate bottom sheet when content changes
  useEffect(() => {
    if (scanState !== 'idle') {
      // Slide up + fade in
      Animated.parallel([
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: ANIMATION.SHEET_SLIDE_DURATION,
          easing: ANIMATION.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: ANIMATION.SHEET_SLIDE_DURATION,
          easing: ANIMATION.EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset for next scan
      sheetTranslateY.setValue(50);
      sheetOpacity.setValue(0);
    }
  }, [scanState, sheetTranslateY, sheetOpacity]);

  // Auto-open name input when product name not found
  useEffect(() => {
    if (scanState === 'scanned_unnamed' && !isEditingName) {
      // Small delay for animations to complete, then open keyboard
      const timer = setTimeout(() => {
        setIsEditingName(true);
        setNameInput('');
        setTimeout(() => nameInputRef.current?.focus(), 100);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [scanState, isEditingName]);

  // ============================================================================
  // FEEDBACK
  // ============================================================================

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

  const flashCamera = useCallback(() => {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start();
  }, [flashAnim]);

  // ============================================================================
  // BARCODE HANDLING
  // ============================================================================

  const handleBarCodeScanned = useCallback(async ({ data }: { type: string; data: string }) => {
    if (mode === 'date_only') return;
    if (scanState !== 'idle' && scanState !== 'date_saved') return;

    const barcode = data?.trim();
    if (!barcode || isProcessingRef.current) return;
    if (lastBarcodeRef.current === barcode) return;

    isProcessingRef.current = true;
    lastBarcodeRef.current = barcode;

    // Trigger scan frame animation + haptic
    triggerScanAnimation();
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    flashCamera();
    setScannedBarcode(barcode);
    setScanState('scanned_loading');
    setProductName(null);
    setSavedDate(null);
    setSelectedDate(getTomorrowDate());
    setNameInput('');
    setIsEditingName(false);

    // Resolve product name
    if (activeOwnerId) {
      try {
        const result = await resolveBarcodeToName(barcode, activeOwnerId, currentLocale);
        if (result.name) {
          setProductName(result.name);
          setScanState('scanned_ready');
        } else {
          setScanState('scanned_unnamed');
        }
      } catch (error) {
        console.error('Error resolving name:', error);
        setScanState('scanned_unnamed');
      }
    } else {
      setScanState('scanned_unnamed');
    }

    setTimeout(() => {
      isProcessingRef.current = false;
      lastBarcodeRef.current = null;
    }, 1000);
  }, [mode, scanState, activeOwnerId, currentLocale, flashCamera, triggerScanAnimation]);

  // ============================================================================
  // NAME HANDLING
  // ============================================================================

  const handleStartNameEdit = useCallback(() => {
    setIsEditingName(true);
    setNameInput(productName || '');
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, [productName]);

  const handleCancelNameEdit = useCallback(() => {
    setIsEditingName(false);
    setNameInput('');
    Keyboard.dismiss();
  }, []);

  const handleSaveName = useCallback(() => {
    const trimmedName = nameInput.trim();
    if (trimmedName.length < 3 || !activeOwnerId) return;

    // Update UI immediately - no loading
    setProductName(trimmedName);
    setIsEditingName(false);
    setNameInput('');
    Keyboard.dismiss();

    // If we were in unnamed state, transition to ready
    if (scanState === 'scanned_unnamed') {
      setScanState('scanned_ready');
    }

    // Save in background - don't block UI
    if (scannedBarcode) {
      (async () => {
        try {
          // Save to store override (per-store custom name)
          await saveStoreOverride(activeOwnerId, scannedBarcode, trimmedName);
          // Submit as suggestion for potential promotion
          await submitBarcodeSuggestion(scannedBarcode, trimmedName, activeOwnerId, currentLocale);
          // Also update barcode_catalog directly with user's chosen name
          // This ensures future scans (even by other users with same locale) get this name
          await updateBarcodeCatalog(scannedBarcode, trimmedName, currentLocale);
        } catch (error) {
          console.error('Error saving name in background:', error);
        }
      })();
    }
  }, [nameInput, activeOwnerId, scannedBarcode, currentLocale, scanState]);

  // ============================================================================
  // DATE HANDLING
  // ============================================================================

  const handleDateChange = useCallback((event: any, date?: Date) => {
    if (date) {
      setSelectedDate(date);
    }
  }, []);

  const handleOpenDatePicker = useCallback(() => {
    // Re-open picker to edit date
    if (savedDate) {
      setSavedDate(null);
      setScanState('scanned_ready');
    }
  }, [savedDate]);

  const handleSaveDate = useCallback(() => {
    if (!activeOwnerId) return;

    // Validate date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      setSnackMessage(t('fastScan.dateInPast') || 'תאריך לא יכול להיות בעבר');
      return;
    }

    // Update UI immediately - no loading
    playSuccessFeedback();
    setSavedDate(selectedDate);

    if (mode === 'date_only') {
      setTimeout(() => router.back(), 400);
    } else {
      setScanState('date_saved');
    }

    // Save in background - don't block UI
    const expiryDateStr = formatDateForDB(selectedDate);
    const barcodeToUse = scannedBarcode || existingBarcode || null;
    const nameToUse = productName || existingProductName || null;

    // CRITICAL: Optimistic update - add item to cache immediately
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const displayName = nameToUse || barcodeToUse || 'מוצר חדש';
    
    const queryKey = ['items', activeOwnerId, 'all'];
    queryClient.setQueryData(queryKey, (old: any[] = []) => {
      console.log('[Fast Scan] Adding optimistic item to cache:', displayName);
      return [
        ...old,
        {
          id: tempId,
          owner_id: activeOwnerId,
          product_name: displayName,
          expiry_date: expiryDateStr,
          barcode_snapshot: barcodeToUse,
          product_barcode: barcodeToUse,
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
    console.log('[Fast Scan] Optimistic item added and cache invalidated');

    (async () => {
      try {
        const locationId = await getOrCreateDefaultLocation(activeOwnerId);

        if (!locationId) {
          console.error('Could not get default location');
          return;
        }

        // Check pending items (supplier flow)
        let matchedPending = false;
        if (barcodeToUse) {
          try {
            const pending = await tryResolvePendingItem(activeOwnerId, barcodeToUse);
            if (pending) {
              matchedPending = true;
              setSnackMessage(t('fastScan.matchedSupplierItem') || 'הותאם לסחורה מהספק');
            }
          } catch { }
        }

        // Get or create product
        let productId: string | null = null;
        if (barcodeToUse && nameToUse) {
          try {
            // Check if product already exists for this barcode
            let existingProduct = await getProductByBarcode(activeOwnerId, barcodeToUse);

            if (existingProduct) {
              productId = existingProduct.id;
              // Update product name if it changed
              if (existingProduct.name !== nameToUse) {
                try {
                  await supabase
                    .from('products')
                    .update({ name: nameToUse })
                    .eq('id', existingProduct.id);
                } catch (updateError) {
                  console.warn('Error updating product name:', updateError);
                }
              }
            } else {
              // Create new product
              const newProduct = await createProduct({
                ownerId: activeOwnerId,
                name: nameToUse,
                barcode: barcodeToUse,
              });
              productId = newProduct?.id || null;
            }
          } catch (error) {
            console.error('Error creating/getting product:', error);
          }
        }

        // Create new batch (item)
        const newItem = await createItem({
          owner_id: activeOwnerId,
          product_id: productId,
          barcode_snapshot: barcodeToUse,
          expiry_date: expiryDateStr,
          location_id: locationId,
        } as any);

        console.log('[Fast Scan] Item created on server:', newItem);

        // CRITICAL: Replace optimistic temp item with real server item
        if (newItem && newItem.id) {
          const queryKey = ['items', activeOwnerId, 'all'];
          queryClient.setQueryData(queryKey, (old: any[] = []) => {
            // Remove ALL temp items
            const withoutTemp = old.filter((item) => !item.id.startsWith('temp_'));
            
            // Check if item already exists
            const existingIndex = withoutTemp.findIndex((item) => item.id === newItem.id);
            
            if (existingIndex >= 0) {
              // Replace existing
              const updated = [...withoutTemp];
              updated[existingIndex] = {
                ...(newItem as any),
                product_name: (newItem as any).product_name || displayName,
                _syncStatus: 'synced'
              };
              return updated;
            } else {
              // Add new
              return [
                ...withoutTemp, 
                { 
                  ...(newItem as any), 
                  product_name: (newItem as any).product_name || displayName,
                  _syncStatus: 'synced' 
                }
              ];
            }
          });
          
          console.log('[Fast Scan] Cache updated with real server item:', newItem.id);
          
          // Invalidate to trigger re-render
          queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
        }

        // Notify other screens that an item was created
        itemEvents.emit();

        // Log event for UPDATE DATE flow
        if (mode === 'date_only' && existingItemId) {
          await logExpiryEvent(activeOwnerId, 'UPDATED_DATE', existingItemId, barcodeToUse, 'user');
        }

      } catch (error) {
        console.error('Error saving in background:', error);
        setSnackMessage(t('common.error') || 'שגיאה');
      }
    })();
  }, [selectedDate, activeOwnerId, scannedBarcode, existingBarcode, productName, existingProductName, mode, existingItemId, playSuccessFeedback, router, t]);

  // ============================================================================
  // RESET
  // ============================================================================

  const resetForNextScan = useCallback(() => {
    setScannedBarcode(null);
    setProductName(null);
    setScanState('idle');
    setSavedDate(null);
    setSelectedDate(getTomorrowDate());
    setNameInput('');
    setIsEditingName(false);
    lastBarcodeRef.current = null;
    isProcessingRef.current = false;
  }, []);

  // ============================================================================
  // PERMISSION HANDLERS
  // ============================================================================

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch { }
  };

  // Permission loading
  if (permission === null) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME_COLORS.primary} />
        </View>
      </View>
    );
  }

  // Permission denied
  if (!permission?.granted && mode !== 'date_only') {
    return (
      <View style={[styles.container, styles.permissionScreen, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons name="camera-off" size={64} color="#999" />
        <Text style={styles.permissionTitle}>{t('screens.scan.permission.title')}</Text>
        <Text style={styles.permissionText}>{t('screens.scan.permission.message')}</Text>
        <Button mode="contained" onPress={permission?.canAskAgain ? requestPermission : handleOpenSettings} style={styles.permissionButton}>
          {permission?.canAskAgain ? (t('screens.scan.permission.grantAccess') || 'Grant Access') : (t('screens.scan.permission.openSettings') || 'Open Settings')}
        </Button>
        <Button mode="text" onPress={() => router.back()} style={{ marginTop: 8 }}>
          {t('common.back') || 'חזרה'}
        </Button>
      </View>
    );
  }

  // Viewer check
  if (!ownerLoading && isViewer) {
    return (
      <View style={[styles.container, styles.permissionScreen, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons name="eye-off" size={64} color="#999" />
        <Text style={styles.permissionTitle}>{t('scan.viewerNotAllowed')}</Text>
        <Button mode="text" onPress={() => router.back()} style={{ marginTop: 16 }}>
          {t('common.back') || 'חזרה'}
        </Button>
      </View>
    );
  }

  // Plan limit reached check (Free or Pro)
  if (!loadingItemCount && hasReachedPlanLimit) {
    return (
      <View style={[styles.container, styles.permissionScreen, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons name="lock-outline" size={64} color="#F97316" />
        <Text style={styles.permissionTitle}>
          {isPlanLimitPro
            ? (t('common.upgradeRequired') || 'שדרוג נדרש')
            : (t('screens.add.limitReached.title') || 'הגעת למגבלת התוכנית החינמית')
          }
        </Text>
        <Text style={styles.permissionText}>
          {isOwner 
            ? (isPlanLimitPro
                ? (t('common.upgradeRequiredMessagePro') || 'הגעת למגבלת 2,000 המוצרים של תוכנית Pro. כדי להמשיך להוסיף מוצרים, שדרג לתוכנית Pro+ שמאפשרת נפח עבודה גבוה יותר.')
                : (t('screens.add.limitReached.message') || 'התוכנית החינמית מאפשרת עד 150 מוצרים בלבד. כדי להמשיך להוסיף מוצרים, שדרג לתוכנית Pro.'))
            : (isPlanLimitPro
                ? (t('screens.add.limitReached.collaboratorMessagePro') || 'הבעלים הגיע למגבלת תוכנית Pro של 2,000 מוצרים. הבעלים צריך לשדרג ל-Pro+ כדי להוסיף מוצרים נוספים.')
                : (t('screens.add.limitReached.collaboratorMessage') || 'הבעלים הגיע למגבלת התוכנית החינמית של 150 מוצרים. הבעלים צריך לשדרג לתוכנית Pro כדי להוסיף מוצרים נוספים.'))
          }
        </Text>
        {/* Only show upgrade button for owners */}
        {isOwner && (
          <Button
            mode="contained"
            onPress={() => router.push('/settings/subscription' as any)}
            style={styles.permissionButton}
            buttonColor={THEME_COLORS.primary}
          >
            {isPlanLimitPro
              ? (t('subscription.proLimitReached.upgrade') || 'שדרג ל-Pro+')
              : (t('screens.add.limitReached.upgrade') || 'שדרג לתוכנית Pro')
            }
          </Button>
        )}
        <Button mode="text" onPress={() => router.back()} style={{ marginTop: 8 }}>
          {isOwner ? (t('common.back') || 'חזרה') : (t('common.ok') || 'הבנתי')}
        </Button>
      </View>
    );
  }

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const canSaveName = nameInput.trim().length >= 3;
  const minDate = new Date();
  minDate.setHours(0, 0, 0, 0);

  const shouldScan = scanState === 'idle' || scanState === 'date_saved';

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <View style={styles.container}>
      {/* ================================================================== */}
      {/* CAMERA - Always visible */}
      {/* ================================================================== */}
      <TouchableWithoutFeedback onPress={handleCameraTap}>
        <View style={[styles.cameraSection, { paddingTop: insets.top }]}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            autofocus="on"
            onBarcodeScanned={shouldScan ? handleBarCodeScanned : undefined}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'codabar', 'itf14'],
            }}
          />

          {/* Flash overlay */}
          <Animated.View style={[styles.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />

          {/* Close button */}
          <View style={[styles.closeButtonContainer, { top: insets.top + 8 }]}>
            <IconButton icon="close" size={24} onPress={() => router.back()} iconColor="#FFF" style={styles.closeButton} />
          </View>

          {/* Animated Barcode frame */}
          <View style={styles.barcodeFrameContainer}>
            <Animated.View
              style={[
                styles.barcodeFrame,
                {
                  opacity: pulseAnim,
                  transform: [{ scale: frameScaleAnim }],
                }
              ]}
            >
              <View style={[styles.barcodeCorner, styles.barcodeCornerTL]} />
              <View style={[styles.barcodeCorner, styles.barcodeCornerTR]} />
              <View style={[styles.barcodeCorner, styles.barcodeCornerBL]} />
              <View style={[styles.barcodeCorner, styles.barcodeCornerBR]} />
            </Animated.View>

            {/* Distance hint - shows when idle */}
            {scanState === 'idle' && (
              <Text style={styles.distanceHint}>
                {t('fastScan.distanceHint') || '15-25 ס״מ מהברקוד'}
              </Text>
            )}
          </View>

          {/* Tap-to-focus indicator */}
          {focusPoint && (
            <Animated.View
              style={[
                styles.focusIndicator,
                {
                  left: focusPoint.x - 30,
                  top: focusPoint.y - 30,
                  opacity: focusAnim,
                  transform: [{ scale: focusScale }],
                },
              ]}
              pointerEvents="none"
            >
              <View style={styles.focusCornerTL} />
              <View style={styles.focusCornerTR} />
              <View style={styles.focusCornerBL} />
              <View style={styles.focusCornerBR} />
            </Animated.View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* ================================================================== */}
      {/* BOTTOM SHEET */}
      {/* ================================================================== */}
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />

        {/* State: Idle */}
        {scanState === 'idle' && (
          <View style={styles.idleContent}>
            <MaterialCommunityIcons name="barcode-scan" size={28} color="#999" />
            <Text style={styles.idleText}>{t('fastScan.pointAtBarcode') || 'כוון לברקוד'}</Text>
          </View>
        )}

        {/* Animated content wrapper for non-idle states */}
        {scanState !== 'idle' && (
          <Animated.View
            style={{
              opacity: sheetOpacity,
              transform: [{ translateY: sheetTranslateY }]
            }}
          >
            {/* State: Loading */}
            {scanState === 'scanned_loading' && (
              <View style={styles.loadingContent}>
                <ActivityIndicator size="small" color={THEME_COLORS.primary} />
                <Text style={styles.barcodeText}>{scannedBarcode}</Text>
              </View>
            )}

            {/* State: Unnamed product - needs name first */}
            {scanState === 'scanned_unnamed' && !isEditingName && (
              <View style={styles.sheetContent}>
                <View style={styles.productRow}>
                  <Text style={[styles.productNameUnknown]} numberOfLines={1}>
                    {t('fastScan.unknownProduct') || 'מוצר לא מזוהה'}
                  </Text>
                  <Text style={styles.barcodeSmall}>{scannedBarcode}</Text>
                </View>
                <TouchableOpacity style={styles.enterNameButton} onPress={handleStartNameEdit} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="pencil" size={20} color="#FFF" />
                  <Text style={styles.enterNameButtonText}>{t('fastScan.enterName') || 'הזן שם'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* State: Ready for date OR editing name */}
            {(scanState === 'scanned_ready' || scanState === 'date_saved') && !isEditingName && (
              <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentInner} bounces={false}>
                {/* Product info - tappable for editing */}
                <AnimatedProductRow
                  productName={productName || existingProductName}
                  barcode={scannedBarcode || existingBarcode}
                  onPress={handleStartNameEdit}
                  isRTL={isRTL}
                />

                {/* Date section */}
                {scanState === 'scanned_ready' && (
                  <>
                    <Text style={styles.dateLabel}>{t('fastScan.selectExpiryDate') || 'בחר תאריך תפוגה'}</Text>

                    {/* Date Picker - respects user's style preference */}
                    <View style={styles.datePickerContainer}>
                      <DateTimePicker
                        value={selectedDate}
                        mode="date"
                        display={
                          datePickerStyle === 'calendar'
                            ? (Platform.OS === 'ios' ? 'compact' : 'default')
                            : (Platform.OS === 'ios' ? 'spinner' : 'default')
                        }
                        minimumDate={minDate}
                        onChange={handleDateChange}
                        locale={currentLocale}
                        style={datePickerStyle === 'calendar' ? styles.datePickerCalendar : styles.datePicker}
                        themeVariant="light"
                        accentColor={datePickerStyle === 'calendar' ? THEME_COLORS.primary : undefined}
                      />
                    </View>

                    {/* Animated Save button */}
                    <AnimatedSaveButton
                      onPress={handleSaveDate}
                      disabled={isSaving}
                      isSaving={isSaving}
                      label={t('common.save') || 'שמור'}
                    />
                  </>
                )}

                {/* Date saved state - show saved date */}
                {scanState === 'date_saved' && savedDate && (
                  <View style={styles.dateSavedSection}>
                    <TouchableOpacity style={styles.savedDateRow} onPress={handleOpenDatePicker} activeOpacity={0.7}>
                      <MaterialCommunityIcons name="calendar-check" size={22} color="#4CAF50" />
                      <Text style={styles.savedDateText}>{formatDateForDisplay(savedDate)}</Text>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#999" />
                    </TouchableOpacity>

                    <View style={styles.readyForNextRow}>
                      <MaterialCommunityIcons name="barcode-scan" size={20} color="#666" />
                      <Text style={styles.readyForNextText}>{t('fastScan.scanAnother') || 'סרוק מוצר הבא'}</Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}

            {/* Inline Name Editor - shows product info while editing */}
            {isEditingName && (
              <View style={styles.nameEditorContent}>
                <Text style={styles.nameEditorTitle}>{t('fastScan.enterProductName') || 'הזן שם מוצר'}</Text>
                {scannedBarcode && <Text style={styles.nameEditorBarcode}>{scannedBarcode}</Text>}

                {/* Live preview of text being entered */}
                <View style={styles.namePreviewContainer}>
                  <Text
                    style={[
                      styles.namePreviewText,
                      isRTL && styles.namePreviewTextRTL,
                      !nameInput && styles.namePreviewPlaceholder
                    ]}
                    numberOfLines={1}
                  >
                    {nameInput || (t('fastScan.productNamePlaceholder') || 'שם המוצר...')}
                  </Text>
                </View>

                {nameInput.length > 0 && nameInput.trim().length < 3 && (
                  <Text style={styles.nameHint}>{t('fastScan.nameTooShort') || 'לפחות 3 תווים'}</Text>
                )}
              </View>
            )}
          </Animated.View>
        )}
      </View>

      {/* Keyboard Input Bar - appears above keyboard when editing name */}
      {isEditingName && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.inputBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
            <TextInput
              ref={nameInputRef}
              style={[styles.inputBarTextInput, isRTL && styles.inputBarTextInputRTL]}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder={t('fastScan.productNamePlaceholder') || 'שם המוצר...'}
              placeholderTextColor="#999"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={canSaveName ? handleSaveName : undefined}
            />
            <TouchableOpacity style={styles.inputBarCancelButton} onPress={handleCancelNameEdit} activeOpacity={0.7}>
              <Text style={styles.inputBarCancelText}>{t('common.cancel') || 'ביטול'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inputBarSaveButton, !canSaveName && styles.inputBarSaveButtonDisabled]}
              onPress={handleSaveName}
              disabled={!canSaveName || isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <MaterialCommunityIcons name="check" size={22} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ================================================================== */}
      {/* SUCCESS ANIMATION */}
      {/* ================================================================== */}
      {showSuccess && (
        <Animated.View style={[styles.successOverlay, { transform: [{ scale: successScale }] }]} pointerEvents="none">
          <View style={styles.successCircle}>
            <MaterialCommunityIcons name="check" size={48} color="#FFF" />
          </View>
        </Animated.View>
      )}

      {/* Snackbar */}
      <Snackbar visible={!!snackMessage} onDismiss={() => setSnackMessage(null)} duration={2000}>
        {snackMessage || ''}
      </Snackbar>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const BARCODE_FRAME_WIDTH = SCREEN_WIDTH * 0.7;
const BARCODE_FRAME_HEIGHT = 90;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#F8F9FA',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  permissionButton: {
    minWidth: 200,
  },

  // Camera section
  cameraSection: {
    flex: 1,
    position: 'relative',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  closeButtonContainer: {
    position: 'absolute',
    left: 8,
    zIndex: 10,
  },
  closeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },

  // Barcode frame
  barcodeFrameContainer: {
    position: 'absolute',
    top: '25%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  barcodeFrame: {
    width: BARCODE_FRAME_WIDTH,
    height: BARCODE_FRAME_HEIGHT,
    position: 'relative',
  },
  barcodeCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  barcodeCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  barcodeCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  barcodeCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  barcodeCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },

  // Distance hint
  distanceHint: {
    marginTop: 16,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Tap-to-focus indicator
  focusIndicator: {
    position: 'absolute',
    width: 60,
    height: 60,
  },
  focusCornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: '#FFD700',
  },
  focusCornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: '#FFD700',
  },
  focusCornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: '#FFD700',
  },
  focusCornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: '#FFD700',
  },

  // Bottom sheet
  bottomSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 20,
    minHeight: 120,
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },

  // Idle state
  idleContent: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  idleText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },

  // Loading state
  loadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  barcodeText: {
    fontSize: 14,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Sheet content
  sheetContent: {
    gap: 16,
    paddingBottom: 8,
  },
  scrollContent: {
    flexGrow: 0,
  },
  scrollContentInner: {
    gap: 12,
    paddingBottom: 8,
  },

  // Product row
  productRow: {
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  productNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productNameRowRTL: {
    flexDirection: 'row-reverse',
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    flex: 1,
  },
  productNameUnknown: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F97316',
  },
  barcodeSmall: {
    fontSize: 13,
    color: '#999',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Enter name button (unnamed state)
  enterNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
  },
  enterNameButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },

  // Date label
  dateLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },

  // Date picker container
  datePickerContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 8,
    paddingVertical: 8,
  },
  datePicker: {
    height: 180,
    width: '100%',
  },
  datePickerCalendar: {
    height: 320,
    width: '100%',
  },

  // Save button
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#CCC',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },

  // Date saved section
  dateSavedSection: {
    gap: 16,
    paddingTop: 8,
  },
  savedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
  },
  savedDateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2E7D32',
    flex: 1,
    textAlign: 'center',
  },
  readyForNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  readyForNextText: {
    fontSize: 14,
    color: '#666',
  },

  // Name editor
  nameEditorContent: {
    gap: 12,
    paddingBottom: 8,
  },
  nameEditorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  nameEditorBarcode: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  nameHint: {
    fontSize: 13,
    color: '#F97316',
    textAlign: 'center',
    marginTop: -4,
  },

  // Success overlay
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

  // Name preview (shows in bottom sheet while editing)
  namePreviewContainer: {
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: THEME_COLORS.primary,
  },
  namePreviewText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  namePreviewTextRTL: {
    textAlign: 'center',
  },
  namePreviewPlaceholder: {
    color: '#999',
    fontWeight: '400',
  },

  // Keyboard input bar
  keyboardAvoidingView: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  inputBarTextInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    maxHeight: 100,
  },
  inputBarTextInputRTL: {
    textAlign: 'right',
  },
  inputBarCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputBarCancelText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  inputBarSaveButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBarSaveButtonDisabled: {
    backgroundColor: '#CCC',
  },
});
