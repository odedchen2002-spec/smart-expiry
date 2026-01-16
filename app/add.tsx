import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { itemEvents } from '@/lib/events/itemEvents';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useDatePickerStyle } from '@/lib/hooks/useDatePickerStyle';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import { useProfile } from '@/lib/hooks/useProfile';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { addToOfflineQueue } from '@/lib/offline/offlineQueue';
import { addItemToCache, loadItemsFromCache } from '@/lib/storage/itemsCache';
import { supabase } from '@/lib/supabase/client';
import { createItem, updateItem } from '@/lib/supabase/mutations/items';
import { createProduct } from '@/lib/supabase/mutations/products';
import { getItemById, type ItemWithDetails } from '@/lib/supabase/queries/items';
import { getOrCreateDefaultLocation } from '@/lib/supabase/queries/locations';
import { getProductByBarcode } from '@/lib/supabase/queries/products';
import { saveStoreOverride, submitBarcodeSuggestion } from '@/lib/supabase/services/barcodeNameService';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Keyboard, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Card, Dialog, HelperText, IconButton, Portal, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';

const PENDING_SAVE_ERROR_KEY = 'pending_save_error';

// Helper function to save item to offline queue and local cache
async function saveToOfflineQueue(saveData: {
  productName: string;
  barcode: string;
  dbDate: string;
  categoryToUse: string | null;
  activeOwnerId: string;
}, t: (key: string) => string) {
  try {
    // addToOfflineQueue returns the generated ID
    const offlineItemId = await addToOfflineQueue({
      type: 'add_item',
      data: {
        name: saveData.productName,
        barcode: saveData.barcode || null,
        expiry_date: saveData.dbDate,
        quantity: 1,
        owner_id: saveData.activeOwnerId,
        location_id: null,
        category_name: saveData.categoryToUse,
        notes: null,
      },
    });

    // Also add to local cache so it appears immediately in the UI
    await addItemToCache(saveData.activeOwnerId, {
      id: offlineItemId,
      name: saveData.productName,
      barcode: saveData.barcode || null,
      expiry_date: saveData.dbDate,
      category_name: saveData.categoryToUse,
    });

    // Notify UI to refresh
    itemEvents.emit();

    console.log('[Add] Item saved to offline queue and local cache');
    // Store success message for destination screen to display
    await AsyncStorage.setItem('offline_save_success', t('offline.savedLocally') || 'Saved locally - will sync when online');
  } catch (offlineError) {
    console.error('[Add] Error saving to offline queue:', offlineError);
    await AsyncStorage.setItem(PENDING_SAVE_ERROR_KEY, t('offline.syncFailed') || 'Failed to save offline');
    throw offlineError;
  }
}

// Format Date object to DD/MM/YYYY
function formatDateDDMMYYYY(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Parse DD/MM/YYYY to Date object
function parseDDMMYYYY(dateStr: string): Date | null {
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateStr.match(ddmmyyyy);
  if (!match) return null;
  const [, day, month, year] = match;
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return null;
  return date;
}

export default function AddScreen() {
  const router = useRouter();
  const { t, isRTL, locale } = useLanguage();
  const theme = useTheme();
  const { user } = useAuth();
  const { activeOwnerId, isOwner, loading: ownerLoading, isViewer } = useActiveOwner();
  const { profile } = useProfile();
  const { subscription, refresh: refreshSubscription } = useSubscription();
  const { datePickerStyle, loading: datePickerStyleLoading } = useDatePickerStyle();
  const { isOffline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    barcode?: string;
    itemId?: string;
    noBarcode?: string;
    productName?: string;
    expiryDate?: string;
    category?: string;
    isPlanLocked?: string;
    productId?: string;
  }>();

  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);

  const isManualEntry = params?.noBarcode === 'true';

  // Initialize form fields from route params for instant display (when editing)
  const hasInitialEditData = !!(params?.productName || params?.expiryDate);

  // Detect different flows for loading behavior
  const isScanFlow = !!params?.barcode && !params?.itemId;
  const isAddWithoutBarcode = isManualEntry && !params?.itemId;
  const isEditFlow = !!params?.itemId;

  const [barcode, setBarcode] = useState(() => {
    if (params?.barcode) return String(params.barcode);
    // If editing and barcode is in params, use it
    if (params?.itemId && params?.barcode) return params.barcode;
    return '';
  });
  const [productName, setProductName] = useState(() => {
    // Initialize from params if available (instant display)
    if (params?.productName) return params.productName;
    return '';
  });
  const [expiryDate, setExpiryDate] = useState(() => {
    // Initialize from params if available (instant display)
    if (params?.expiryDate) {
      // Convert YYYY-MM-DD to DD/MM/YYYY
      const dateParts = params.expiryDate.split('-');
      if (dateParts.length === 3) {
        return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
      }
      return params.expiryDate;
    }
    return ''; // DD/MM/YYYY format
  });
  const [isEditing, setIsEditing] = useState(!!params?.itemId);
  const [originalItem, setOriginalItem] = useState<ItemWithDetails | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [snackType, setSnackType] = useState<'success' | 'error'>('success');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitModalTitle, setLimitModalTitle] = useState('');
  const [limitModalText, setLimitModalText] = useState('');
  const [limitModalAction, setLimitModalAction] = useState<'pro' | 'expired' | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);


  const shouldDelayForm =
    !isEditing && ((!!params?.barcode && !isManualEntry) || isManualEntry);
  // When editing with initial data, always show form immediately
  const [showForm, setShowForm] = useState(() => {
    if (isEditing && hasInitialEditData) return true; // Always show form when editing with params
    return !shouldDelayForm; // Control form visibility when barcode or manual add requires date first
  });

  // Ref for product name input to enable programmatic focus
  const productNameInputRef = useRef<any>(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // No longer needed - we use activeOwnerId directly

  // Animate on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  // Refresh subscription when screen comes into focus
  // This ensures collaborators always see up-to-date plan limits
  useFocusEffect(
    useCallback(() => {
      if (activeOwnerId && refreshSubscription) {
        console.log('[Add] Screen focused - refreshing subscription');
        refreshSubscription().catch(err => {
          console.error('[Add] Error refreshing subscription on focus:', err);
        });
      }
    }, [activeOwnerId, refreshSubscription])
  );

  // Initialize selectedDate from params if available
  useEffect(() => {
    if (params?.expiryDate) {
      // Convert YYYY-MM-DD to DD/MM/YYYY and parse
      const dateParts = params.expiryDate.split('-');
      if (dateParts.length === 3) {
        const dateStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        const parsedDate = parseDDMMYYYY(dateStr);
        if (parsedDate) {
          setSelectedDate(parsedDate);
        }
      }
    }
  }, [params?.expiryDate]); // Only run once on mount if params exist

  // Track if we have initial data from params
  const hasInitialDataRef = useRef(hasInitialEditData);

  // Background fetch for additional item data if editing (only if we don't have initial data)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isEditing || !params?.itemId || !activeOwnerId || isViewer) return;

      // If we have initial data from params, fetch in background to get any missing fields
      // Otherwise, do a full fetch (fallback)
      try {
        const item = await getItemById(params.itemId, activeOwnerId);
        if (mounted && item) {
          setOriginalItem(item);

          // Only update fields if we don't have initial data from params
          if (!hasInitialDataRef.current) {
            setProductName(item.product_name || '');
            if (item.barcode_snapshot || item.product_barcode) {
              setBarcode(item.barcode_snapshot || item.product_barcode || '');
            }
            const dateParts = item.expiry_date.split('-');
            if (dateParts.length === 3) {
              const dateStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
              setExpiryDate(dateStr);
              const parsedDate = parseDDMMYYYY(dateStr);
              if (parsedDate) {
                setSelectedDate(parsedDate);
              }
            }
          } else {
            // We have initial data, just update originalItem for save logic
            // Form fields are already set from params
          }
        }
      } catch (error) {
        console.error('Error loading item for edit:', error);
        // Don't show error if we have initial data - form is already usable
      }
    })();
    return () => { mounted = false };
  }, [isEditing, params?.itemId, activeOwnerId]);

  // Auto-load product name by barcode when available (only for scan flow, not manual entry)
  // First check cache, then fetch from Supabase in background
  // Uses cancellation pattern to prevent race conditions when barcode changes quickly
  useEffect(() => {
    if (isEditing) return;
    if (!activeOwnerId || !barcode) return;
    // Skip this effect for manual entry (add without barcode) - no barcode lookup needed
    if (isManualEntry) return;

    let mounted = true;
    let cancelled = false;

    (async () => {
      const currentBarcode = barcode; // Capture current barcode value
      
      // Step 1: Try to find in cached items first (fast, synchronous-like)
      try {
        const cached = await loadItemsFromCache(activeOwnerId);
        if (cancelled || !mounted) return; // Check cancellation before updating state
        
        if (cached && cached.items) {
          // Look for item with matching barcode
          const matchingItem = cached.items.find(
            (item) =>
              (item.barcode_snapshot === currentBarcode || item.product_barcode === currentBarcode) &&
              item.product_name
          );

          if (matchingItem && matchingItem.product_name) {
            setProductName(matchingItem.product_name);
            // Don't set loading - we found it in cache
          }
        }
      } catch (cacheError) {
        console.warn('[Add] Error loading from cache:', cacheError);
      }

      // Step 2: Fetch from Supabase in background (even if found in cache, to get latest data)
      if (cancelled || !mounted) return;
      setLoadingProduct(true);
      
      try {
        const existing = await getProductByBarcode(activeOwnerId, currentBarcode);
        if (cancelled || !mounted) return; // Check cancellation before updating state
        
        if (existing?.name) {
          // Update with fresh data from Supabase (only if this is still the active barcode)
          setProductName(existing.name);
        }
      } catch (error) {
        console.warn('[Add] Error fetching product by barcode:', error);
        // Keep cached data if available
      } finally {
        if (mounted && !cancelled) {
          setLoadingProduct(false);
        }
      }
    })();

    return () => { 
      mounted = false;
      cancelled = true; // Cancel any pending updates when barcode changes
    };
  }, [activeOwnerId, barcode, isEditing, isManualEntry]);

  // Get minimum date (today) - no past dates allowed for expiry
  const minDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const shouldPromptDate = useMemo(
    () => !isEditing && !showForm && (Boolean(barcode) || isManualEntry),
    [barcode, isEditing, isManualEntry, showForm]
  );

  // Auto-open date picker when barcode is scanned or manual-add button is used
  // Only runs once when shouldPromptDate becomes true (not on every expiryDate change)
  useEffect(() => {
    if (!shouldPromptDate) return;
    // Small delay to ensure screen is mounted
    const timer = setTimeout(() => {
      const parsed = parseDDMMYYYY(expiryDate);
      if (parsed && parsed >= minDate) {
        setSelectedDate(parsed);
      } else {
        setSelectedDate(minDate);
      }
      Keyboard.dismiss();
      setShowDatePicker(true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPromptDate]); // Only trigger when shouldPromptDate changes (intentionally omit expiryDate and minDate)

  // Validate DD/MM/YYYY format and convert to YYYY-MM-DD for database
  const { isValid, dbDate } = useMemo(() => {
    if (!expiryDate) {
      return { isValid: false, dbDate: null };
    }
    const date = parseDDMMYYYY(expiryDate);
    if (!date) {
      return { isValid: false, dbDate: null };
    }
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const dbDateStr = `${y}-${m}-${d}`;
    return { isValid: true, dbDate: dbDateStr };
  }, [expiryDate]);

  const openPicker = () => {
    const parsed = parseDDMMYYYY(expiryDate);
    if (parsed && parsed >= minDate) {
      setSelectedDate(parsed);
    } else {
      setSelectedDate(minDate);
    }
    Keyboard.dismiss();
    setShowDatePicker(true);
  };

  const handleConfirmDate = () => {
    const dateToUse = selectedDate < minDate ? minDate : selectedDate;
    setExpiryDate(formatDateDDMMYYYY(dateToUse));
    setSelectedDate(dateToUse);
    setShowDatePicker(false);

    // If form was hidden (barcode scan flow), show it now and focus product name
    if (!showForm && !isEditing && (Boolean(barcode) || isManualEntry)) {
      setShowForm(true);
      // Focus product name input after a short delay to ensure form is rendered
      setTimeout(() => {
        productNameInputRef.current?.focus();
      }, 100);
    }
  };

  const handleCancelDate = () => {
    setShowDatePicker(false);
    // If form was hidden and user cancels date picker, show form anyway
    if (!showForm && !isEditing && (Boolean(barcode) || isManualEntry)) {
      setShowForm(true);
    }
  };

  const showSnack = (message: string, type: 'success' | 'error' = 'success') => {
    setSnackType(type);
    setSnack(message);
  };


  const handleSave = async () => {
    if (isViewer) {
      setSnack(t('add.viewerNotAllowed') || 'Viewers cannot add or edit products.');
      return;
    }
    // Owner must be ready before saving
    if (!activeOwnerId) {
      console.error('Save failed: No owner ID');
      showSnack(t('screens.add.noOwner'), 'error');
      return;
    }

    if (!isValid || !dbDate) {
      const errorMsg = expiryDate
        ? (t('common.error') || 'Invalid date format. Use DD/MM/YYYY')
        : (t('add.dateRequired') || 'Please select an expiry date');
      showSnack(errorMsg, 'error');
      return;
    }

    // Validate product name
    const trimmedName = productName?.trim() || '';
    if (!trimmedName) {
      showSnack(t('add.nameRequired') || 'Please enter a product name', 'error');
      return;
    }
    
    // Validate product name length (max 200 characters)
    if (trimmedName.length > 200) {
      showSnack(t('add.nameTooLong') || 'Product name is too long (max 200 characters)', 'error');
      return;
    }
    
    // Validate against dangerous patterns (basic XSS prevention)
    if (/<script|javascript:|onerror=/i.test(trimmedName)) {
      showSnack(t('add.nameInvalid') || 'Product name contains invalid characters', 'error');
      return;
    }

    // Check subscription limits before adding item (only for new items, not edits)
    if (!user?.id) {
      showSnack(t('screens.add.mustSignIn'), 'error');
      return;
    }

    // If editing an existing item, check if it's locked instead of checking add limits
    if (isEditing && originalItem) {
      if (originalItem.is_plan_locked) {
        // Item is locked - show upgrade prompt based on CURRENT plan (not why it's locked)
        // This ensures users see the right message for their current subscription tier
        const isPro = subscription?.plan === 'pro' && subscription?.isPaidActive;
        const isProPlus = subscription?.plan === 'pro_plus' && subscription?.isPaidActive;
        
        if (isProPlus) {
          // Pro+ user - shouldn't happen, but show fair use message
          Alert.alert(
            t('common.upgradeRequired') || 'שדרוג נדרש',
            t('common.upgradeRequiredMessageProPlus') || 'הגעת למגבלת השימוש ההוגן. אנא פנה לתמיכה.'
          );
        } else if (isPro) {
          // Pro user with locked item - must be over 2000 limit
          Alert.alert(
            t('common.upgradeRequired') || 'שדרוג נדרש',
            t('common.upgradeRequiredMessagePro') || 'הגעת למגבלת 2,000 המוצרים של תוכנית Pro. כדי להמשיך להוסיף מוצרים, שדרג לתוכנית Pro+ שמאפשרת נפח עבודה גבוה יותר.'
          );
        } else {
          // Free/trial user with locked item - show upgrade to Pro message
          Alert.alert(
            t('common.upgradeRequired') || 'שדרוג נדרש',
            t('common.upgradeRequiredMessage') || 'חרגת מכמות המוצרים המותרת בתוכנית החינמית. כדי לערוך את כל המוצרים ולקבל התראות ללא הגבלה, שדרג לתוכנית Pro.'
          );
        }
        return;
      }
      // Item is not locked - allow edit to proceed
    } else {
      // Adding a new item - CRITICAL: Real-time DB check for plan limits
      // This prevents collaborators from bypassing limits even if cached subscription is stale
      
      if (!subscription) {
        showSnack(t('screens.add.loading') || 'טוען מידע תוכנית...', 'error');
        return;
      }
      
      // Check subscription expiry
      if (subscription.status === 'expired') {
        setLimitModalTitle(t('screens.add.subscriptionExpired.title'));
        setLimitModalText(t('screens.add.subscriptionExpired.message'));
        setLimitModalAction('expired');
        setShowLimitModal(true);
        return;
      }
      
      // SECURITY: Real-time DB count check (MOVED TO BACKGROUND - non-blocking)
      // Check limits in background and show dialog if exceeded, but allow UI to continue
      const checkLimitsInBackground = async () => {
        try {
          console.log('[Add] Background: Performing real-time item count check for owner:', activeOwnerId);
          
          // Count items directly from DB
          const { count, error } = await supabase
            .from('items')
            .select('*', { count: 'exact', head: true })
            .eq('owner_id', activeOwnerId)
            .neq('status', 'resolved');
          
          if (error) {
            // Only log non-network errors (network errors are expected when offline)
            const errorMessage = error.message?.toLowerCase() || '';
            const isNetworkError = 
              errorMessage.includes('network') ||
              errorMessage.includes('connection') ||
              errorMessage.includes('fetch');
            
            if (!isNetworkError) {
              console.error('[Add] Background: Error checking item count:', error);
            }
            return; // Silent fail - don't block user
          }
          
          const currentItemCount = count || 0;
          console.log('[Add] Background: Current item count from DB:', currentItemCount);
          
          // Determine plan limits based on OWNER's subscription (not collaborator's)
          const isPro = subscription.plan === 'pro' && subscription.isPaidActive;
          const isProPlus = subscription.plan === 'pro_plus' && subscription.isPaidActive;
          const isTrial = subscription.isTrialActive;
          
          const PRO_PLAN_LIMIT = 2000;
          const FREE_PLAN_LIMIT = 150;
          
          const isTrialEffective = isTrial && !isPro && currentItemCount < FREE_PLAN_LIMIT;
          const hasUnlimitedAccess = isProPlus || isTrialEffective;
          
          console.log('[Add] Background: Plan limit check:', {
            currentItemCount,
            isPro,
            isProPlus,
            isTrial,
            isTrialEffective,
            hasUnlimitedAccess,
            FREE_PLAN_LIMIT,
            PRO_PLAN_LIMIT,
          });
          
          // Note: This runs in background, so we don't block the save
          // Server-side enforcement will still prevent exceeding limits
          if (!hasUnlimitedAccess) {
            if (isPro && currentItemCount >= PRO_PLAN_LIMIT) {
              console.log('[Add] Background: ⚠️ Pro plan limit reached (will be enforced server-side)');
            } else if (!isPro && currentItemCount >= FREE_PLAN_LIMIT) {
              console.log('[Add] Background: ⚠️ Free plan limit reached (will be enforced server-side)');
            }
          }
          
          console.log('[Add] Background: ✅ Plan limit check completed');
        } catch (err) {
          console.error('[Add] Background: Exception during item count check:', err);
          // Silent fail - don't block user
        }
      };
      
      // Start background check (fire and forget)
      void checkLimitsInBackground();
    }

    // Prepare save data (synchronous, no DB calls)
    const categoryToUse = null; // Categories removed from app
    const saveData = {
      productName,
      barcode,
      categoryToUse,
      dbDate,
      isEditing,
      itemId: params?.itemId,
      originalItem,
      activeOwnerId,
      locale,
    };

    // CRITICAL: Update TanStack Query cache IMMEDIATELY for instant UI
    if (isEditing && params?.itemId && activeOwnerId) {
      // EDITING: Update existing item in cache
      console.log('[Add] Optimistically updating cache for item:', params.itemId);
      
      // Update ALL relevant caches where this item might appear
      const scopes: Array<'all' | 'expired'> = ['all', 'expired'];
      
      scopes.forEach((scope) => {
        const queryKey = ['items', activeOwnerId, scope];
        queryClient.setQueryData(queryKey, (old: any[] = []) => {
          return old.map((item) => {
            if (item.id === params.itemId) {
              // Return updated item with new values
              return {
                ...item,
                product_name: productName,
                expiry_date: dbDate,
                barcode_snapshot: barcode || item.barcode_snapshot,
                product_barcode: barcode || item.product_barcode,
                updated_at: new Date().toISOString(),
              };
            }
            return item;
          });
        });
        
        // CRITICAL: Invalidate to trigger re-render
        queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      });
      
      console.log('[Add] Cache updated optimistically for scopes:', scopes);
    } else if (!isEditing && activeOwnerId) {
      // CREATING: Add new item to cache optimistically
      console.log('[Add] Optimistically adding new item to cache, productName:', productName, 'barcode:', barcode);
      
      // Generate temp ID for optimistic item
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Ensure we have a valid product name (fallback to barcode or placeholder)
      const displayName = productName?.trim() || barcode || 'מוצר חדש';
      
      // Add to 'all' cache (new items always go to 'all' scope first)
      const queryKey = ['items', activeOwnerId, 'all'];
      queryClient.setQueryData(queryKey, (old: any[] = []) => {
        return [
          ...old,
          {
            id: tempId,
            owner_id: activeOwnerId,
            product_name: displayName, // CRITICAL: Always have a valid display name
            expiry_date: dbDate,
            barcode_snapshot: barcode || null,
            product_barcode: barcode || null,
            product_category: null,
            product_id: null,
            location_id: null,
            location_name: null,
            location_order: null,
            product_image_url: null,
            note: null,
            status: 'ok', // Default status for new items
            resolved_reason: null,
            is_plan_locked: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            _optimistic: true, // Mark as optimistic
            _syncStatus: 'pending',
          },
        ];
      });
      
      console.log('[Add] New item added to cache optimistically:', { tempId, displayName, dbDate });
      
      // CRITICAL: Invalidate the query to force the All screen to re-render with optimistic data
      // This ensures the new item is visible immediately when navigating
      queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      console.log('[Add] Invalidated query to trigger re-render:', queryKey);
    }

    // Navigate immediately (don't wait for DB)
    setSaving(false); // Reset saving state immediately

    // Small delay to ensure cache update is processed before navigation
    await new Promise(resolve => setTimeout(resolve, 50));

    // Determine navigation target
    if (isEditing) {
      // When editing, go back to the previous screen (where user came from)
      // The optimistic cache update above ensures the list screen shows updated data immediately
      router.back();
    } else if (params?.barcode) {
      // New item added via scanning - go to "All" screen to see the new item immediately
      console.log('[Add] Navigating to All screen to show new scanned item');
      router.replace('/(tabs)/all' as any);
    } else {
      // New item added manually - go to All screen to see the new item
      console.log('[Add] Navigating to All screen to show new manual item');
      router.replace('/(tabs)/all' as any);
    }

    // Save in background (fire-and-forget with improved error handling)
    (async () => {
      // Capture queryClient in closure for cache updates
      const qc = queryClient;
      
      // If offline and adding new item (not editing), save to offline queue
      if (isOffline && !saveData.isEditing) {
        try {
          await saveToOfflineQueue({
            productName: saveData.productName,
            barcode: saveData.barcode,
            dbDate: saveData.dbDate!,
            categoryToUse: saveData.categoryToUse,
            activeOwnerId: saveData.activeOwnerId,
          }, t);
        } catch (err) {
          console.error('[Add] Error saving offline:', err);
        }
        return;
      }

      // If offline and editing, store error (edits require online)
      if (isOffline && saveData.isEditing) {
        console.log('[Add] Cannot edit while offline');
        try {
          await AsyncStorage.setItem(PENDING_SAVE_ERROR_KEY, t('offline.youAreOffline') || 'Cannot edit while offline');
        } catch { }
        return;
      }

      try {
        let productId: string | null = null;
        let defaultLocationId: string | null = null;

        if (saveData.isEditing && saveData.originalItem) {
          productId = saveData.originalItem.product_id || null;

          const productUpdates: any = {};
          const nameChanged = saveData.productName && saveData.productName !== saveData.originalItem.product_name;

          if (nameChanged) {
            productUpdates.name = saveData.productName;
          }
          if (saveData.categoryToUse !== saveData.originalItem.product_category) {
            productUpdates.category = saveData.categoryToUse;
          }

          if (productId && Object.keys(productUpdates).length > 0) {
            const { error: updateError } = await supabase
              .from('products')
              .update(productUpdates)
              .eq('id', productId);

            if (updateError) {
              console.warn('Error updating product:', updateError);
            }
          }

          // If name changed and product has a barcode, update barcode-related tables
          const productBarcode = saveData.barcode || saveData.originalItem.barcode_snapshot || saveData.originalItem.product_barcode;
          if (nameChanged && productBarcode && saveData.productName) {
            try {
              // Update store override (per-owner custom name)
              await saveStoreOverride(saveData.activeOwnerId, productBarcode, saveData.productName);
              // Submit as suggestion for potential promotion to barcode_catalog
              await submitBarcodeSuggestion(productBarcode, saveData.productName, saveData.activeOwnerId, saveData.locale);
            } catch (barcodeError) {
              console.warn('Error updating barcode name tables:', barcodeError);
            }
          }

          if (saveData.barcode && saveData.barcode !== (saveData.originalItem.barcode_snapshot || saveData.originalItem.product_barcode)) {
            const existing = await getProductByBarcode(saveData.activeOwnerId, saveData.barcode);
            if (existing) {
              productId = existing.id;
              if (saveData.productName && saveData.productName !== existing.name) {
                const { error: updateError } = await supabase
                  .from('products')
                  .update({ name: saveData.productName } as any)
                  .eq('id', productId);
                if (updateError) {
                  console.warn('Error updating product name:', updateError);
                }
              }
            } else {
              const created = await createProduct({
                ownerId: saveData.activeOwnerId,
                name: saveData.productName || saveData.barcode,
                barcode: saveData.barcode,
                category: saveData.categoryToUse,
              });
              productId = created?.id ?? null;
            }
          } else if (!saveData.barcode && saveData.productName && saveData.productName !== saveData.originalItem.product_name && productId) {
            const productUpdates: any = { name: saveData.productName };
            if (saveData.categoryToUse !== saveData.originalItem.product_category) {
              productUpdates.category = saveData.categoryToUse;
            }
            const { error: updateError } = await supabase
              .from('products')
              .update(productUpdates)
              .eq('id', productId);
            if (updateError) {
              console.warn('Error updating product:', updateError);
            }
          }

          if (productId && saveData.categoryToUse !== saveData.originalItem.product_category) {
            const { error: updateError } = await supabase
              .from('products')
              .update({ category: saveData.categoryToUse } as any)
              .eq('id', productId);
            if (updateError) {
              console.warn('Error updating product category:', updateError);
            }
          }
        } else {
          defaultLocationId = await getOrCreateDefaultLocation(saveData.activeOwnerId);

          if (saveData.barcode) {
            const existing = await getProductByBarcode(saveData.activeOwnerId, saveData.barcode);
            if (existing) {
              productId = existing.id;
              if (saveData.categoryToUse !== existing.category) {
                const { error: updateError } = await supabase
                  .from('products')
                  .update({ category: saveData.categoryToUse } as any)
                  .eq('id', productId);
                if (updateError) {
                  console.warn('Error updating product category:', updateError);
                }
              }
            } else {
              const created = await createProduct({
                ownerId: saveData.activeOwnerId,
                name: saveData.productName || saveData.barcode,
                barcode: saveData.barcode,
                category: saveData.categoryToUse,
              });
              productId = created?.id ?? null;
            }
          } else if (saveData.productName) {
            const created = await createProduct({
              ownerId: saveData.activeOwnerId,
              name: saveData.productName,
              barcode: null,
              category: saveData.categoryToUse,
            });
            productId = created?.id ?? null;
          }
        }

        if (saveData.isEditing && saveData.itemId) {
          // Update existing item
          const updateData: any = {
            expiry_date: saveData.dbDate as any,
            barcode_snapshot: saveData.barcode || null,
          };

          if (productId !== saveData.originalItem?.product_id) {
            updateData.product_id = productId;
          }

          await updateItem(saveData.itemId, updateData);
        } else {
          // Create new item
          const newItem = await createItem({
            owner_id: saveData.activeOwnerId,
            product_id: productId,
            expiry_date: saveData.dbDate as any,
            note: null,
            status: undefined as any,
            barcode_snapshot: saveData.barcode || null,
            location_id: defaultLocationId!,
          } as any);

          console.log('[Add] Item created on server:', newItem);

          // Refresh subscription to update activeItemsCount and canAddItems
          // This prevents collaborators from exceeding the owner's plan limit
          if (refreshSubscription) {
            await refreshSubscription();
            console.log('[Add] Subscription refreshed after adding item');
          }

          // NOTE: No need for itemEvents.emit() - we update cache directly below
          // itemEvents.emit() would cause a refetch which creates duplicates
          
          // CRITICAL: Update cache to replace temp item with real server item
          // This ensures the optimistic item gets replaced with the real ID and full data
          if (newItem && newItem.id) {
            console.log('[Add] Replacing optimistic item in cache with server item, id:', newItem.id);
            const queryKey = ['items', saveData.activeOwnerId, 'all'];
            
            // Capture the product name from saveData before entering closure
            const fallbackName = saveData.productName;
            
            qc.setQueryData(queryKey, (old: any[] = []) => {
              console.log('[Add] Cache before replace:', old.length, 'items');
              
              // Find the optimistic item to preserve its name if server doesn't have it yet
              const optimisticItem = old.find((item) => item.id.startsWith('temp_'));
              const preservedName = optimisticItem?.product_name || fallbackName;
              
              console.log('[Add] Optimistic item found:', !!optimisticItem, 'preserved name:', preservedName);
              
              // Remove ALL temp items (not just one)
              const withoutTemp = old.filter((item) => !item.id.startsWith('temp_'));
              
              console.log('[Add] Cache after removing temp items:', withoutTemp.length, 'items (removed:', old.length - withoutTemp.length, ')');
              
              // Cast newItem to any to access product_name (it might not be in the type yet)
              const serverItem = newItem as any;
              
              // Check if item already exists (to avoid duplicates)
              const existingIndex = withoutTemp.findIndex((item) => item.id === serverItem.id);
              
              if (existingIndex >= 0) {
                // Replace existing item with fresh server data
                console.log('[Add] Replacing existing item at index:', existingIndex);
                const updated = [...withoutTemp];
                updated[existingIndex] = {
                  ...serverItem,
                  // CRITICAL: Preserve optimistic name if server doesn't have it yet
                  product_name: serverItem.product_name || preservedName,
                  _syncStatus: 'synced'
                };
                return updated;
              } else {
                // Add new item to cache with preserved name
                console.log('[Add] Adding new server item to cache');
                return [
                  ...withoutTemp, 
                  { 
                    ...serverItem, 
                    // CRITICAL: Preserve optimistic name if server doesn't have it yet
                    product_name: serverItem.product_name || preservedName,
                    _syncStatus: 'synced' 
                  }
                ];
              }
            });
            
            console.log('[Add] Cache updated with real server item:', newItem.id);
          }
        }

        // Success - clear any pending errors
        await AsyncStorage.removeItem(PENDING_SAVE_ERROR_KEY);
      } catch (e: any) {
        console.error('Background save error:', e);
        const errorMessage = e?.message || e?.error?.message || '';

        // Check if this is a network error - if so, save to offline queue
        const isNetworkError =
          errorMessage.toLowerCase().includes('network') ||
          errorMessage.toLowerCase().includes('failed to fetch') ||
          errorMessage.toLowerCase().includes('timeout') ||
          e?.code === 'NETWORK_ERROR';

        if (isNetworkError && !saveData.isEditing) {
          // Network error on new item - save to offline queue
          console.log('[Add] Network error detected, saving to offline queue');
          try {
            await saveToOfflineQueue({
              productName: saveData.productName,
              barcode: saveData.barcode,
              dbDate: saveData.dbDate!,
              categoryToUse: saveData.categoryToUse,
              activeOwnerId: saveData.activeOwnerId,
            }, t);
            return;
          } catch (offlineError) {
            console.error('[Add] Failed to save to offline queue:', offlineError);
            // Error already stored by saveToOfflineQueue
          }
        }

        // Store error in AsyncStorage for destination screen to display
        try {
          await AsyncStorage.setItem(PENDING_SAVE_ERROR_KEY, errorMessage || t('add.saveError') || 'Failed to save product');
        } catch (storageError) {
          console.error('Error storing save error:', storageError);
        }
      }
    })().catch((err) => {
      // Final safety net for unhandled promise rejections
      console.error('[Add] Unhandled error in save promise:', err);
      // Store error message for user
      AsyncStorage.setItem(PENDING_SAVE_ERROR_KEY, t('add.saveError') || 'Failed to save product').catch(() => {});
    });
  };

  const canSave = !saving && !showDatePicker && !!productName?.trim() && isValid && activeOwnerId && !isViewer;

  // Block viewers from accessing the add/edit screen
  if (!ownerLoading && isViewer) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content
            title={isEditing ? t('item.edit') : t('screens.add.title')}
          />
        </Appbar.Header>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <MaterialCommunityIcons
            name="eye-off"
            size={64}
            color="#757575"
            style={{ marginBottom: 16 }}
          />
          <Text style={[styles.loadingText, rtlText, { color: theme.colors.onSurface, marginBottom: 8, fontSize: 18, fontWeight: '600' }]}>
            {t('add.viewerNotAllowed') || 'Viewers cannot add or edit products'}
          </Text>
          <Text style={[styles.loadingText, rtlText, { color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 24 }]}>
            {t('add.viewerNotAllowedDesc') || 'As a viewer, you have read-only access. You cannot add or edit products.'}
          </Text>
          <Button
            mode="contained"
            onPress={() => router.back()}
            buttonColor={THEME_COLORS.primary}
          >
            {t('common.back')}
          </Button>
        </View>
      </View>
    );
  }

  // Block the screen until owner is ready, UNLESS:
  // 1. We have initial edit data from params (editing with prefilled data)
  // 2. We're in scan flow (barcode scan - form should show immediately)
  // 3. We're in "add without barcode" flow (manual entry - form should show immediately)
  // For scan flow and add-without-barcode flow: always show form, use inline loading indicators only
  // For edit flow: full-screen loading is allowed until data is fetched
  if ((ownerLoading || !activeOwnerId) && !(isEditing && hasInitialEditData) && !isScanFlow && !isAddWithoutBarcode) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
          <Appbar.Content
            title={isEditing ? t('item.edit') : t('screens.add.title')}
          />
        </Appbar.Header>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" color={THEME_COLORS.primary} />
          <Text style={[styles.loadingText, rtlText, { color: theme.colors.onSurface, marginTop: 16 }]}>
            {t('common.loading')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={isEditing ? (t('item.edit') || 'עריכה') : (t('add.title') || 'הוסף מוצר חדש')}
        />
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Show form once allowed (after date selection) or when editing */}
          {(showForm || isEditing) && (
            <>
              {/* Barcode Display */}
              {!!barcode && (
                <Card style={[styles.card, styles.barcodeCard, { backgroundColor: theme.colors.surface }]}>
                  <Card.Content style={styles.cardContent}>
                    <View style={[styles.row, rtlContainer]}>
                      <IconButton icon="barcode" size={24} iconColor={THEME_COLORS.primary} />
                      <View style={styles.barcodeInfo}>
                        <Text variant="labelSmall" style={[rtlText, { color: theme.colors.onSurfaceVariant }]}>
                          {t('item.barcode')}
                        </Text>
                        <Text variant="bodyLarge" style={[rtlText, { color: theme.colors.onSurface }]}>
                          {barcode}
                        </Text>
                      </View>
                    </View>
                  </Card.Content>
                </Card>
              )}
              {!barcode && isManualEntry && (
                <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                  <Card.Content style={styles.cardContent}>
                    <Text style={[styles.manualEntryLabel, rtlText, { color: theme.colors.onSurfaceVariant }]}>
                      {t('add.manualEntry') || 'Added without barcode'}
                    </Text>
                    <Text style={[styles.manualEntryValue, rtlText, { color: theme.colors.onSurface }]}>
                      {t('item.noBarcode') || 'No barcode'}
                    </Text>
                  </Card.Content>
                </Card>
              )}


              {/* Product Name Input */}
              <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Card.Content style={styles.cardContent}>
                  <View style={styles.inputContainer}>
                    <TextInput
                      ref={productNameInputRef}
                      label={t('item.name') || 'שם'}
                      placeholder={t('item.name') || 'שם'}
                      value={productName}
                      onChangeText={setProductName}
                      mode="outlined"
                      left={<TextInput.Icon icon="tag" iconColor={theme.colors.primary} />}
                      right={
                        loadingProduct && !productName ? (
                          <TextInput.Icon
                            icon={() => <ActivityIndicator size="small" color={theme.colors.primary} />}
                          />
                        ) : undefined
                      }
                      style={styles.input}
                      contentStyle={rtlText}
                      outlineStyle={styles.inputOutline}
                    />
                  </View>
                </Card.Content>
              </Card>

              {/* Expiry Date Picker */}
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
                onPress={openPicker}
              >
                <Card.Content style={styles.cardContent}>
                  <TouchableOpacity
                    style={[styles.row, rtlContainer, styles.dateRow]}
                    onPress={openPicker}
                    activeOpacity={0.7}
                  >
                    <IconButton
                      icon="calendar"
                      size={24}
                      iconColor={expiryDate ? THEME_COLORS.primary : theme.colors.onSurfaceVariant}
                    />
                    <View style={styles.dateInfo}>
                      <Text variant="labelSmall" style={[rtlText, { color: theme.colors.onSurfaceVariant }]}>
                        {t('item.expiry') || 'תאריך תפוגה'}
                      </Text>
                      <Text
                        variant="bodyLarge"
                        style={[
                          rtlText,
                          {
                            color: expiryDate ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                            fontWeight: expiryDate ? '500' : '400'
                          }
                        ]}
                      >
                        {expiryDate || (t('common.selectDate') || 'בחר תאריך')}
                      </Text>
                    </View>
                    <IconButton
                      icon={isRTL ? "chevron-left" : "chevron-right"}
                      size={24}
                      iconColor={theme.colors.onSurfaceVariant}
                    />
                  </TouchableOpacity>
                  {!isValid && expiryDate && (
                    <HelperText type="error" visible style={styles.helperText}>
                      Format: DD/MM/YYYY
                    </HelperText>
                  )}
                </Card.Content>
              </Card>

              {/* Save Button */}
              <Button
                mode="contained"
                onPress={handleSave}
                loading={saving}
                disabled={!canSave}
                style={[styles.saveButton, { backgroundColor: canSave ? THEME_COLORS.primary : theme.colors.disabled }]}
                labelStyle={styles.saveButtonLabel}
                contentStyle={styles.saveButtonContent}
                icon={saving ? undefined : "check"}
              >
                {saving
                  ? (t('common.loading') || 'שומר...')
                  : (isEditing ? (t('add.update') || 'עדכן') : (t('add.save') || 'שמור'))
                }
              </Button>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* Date Picker Modal - Premium inline spinner style */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDate}
      >
        <TouchableWithoutFeedback onPress={handleCancelDate}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.datePickerCard}>
                {/* Header */}
                <View style={styles.datePickerHeader}>
                  <MaterialCommunityIcons
                    name="calendar-clock"
                    size={22}
                    color={THEME_COLORS.primary}
                  />
                  <Text style={[styles.datePickerTitle, rtlText]}>
                    {t('add.chooseExpiryDate') || 'בחר תאריך תפוגה'}
                  </Text>
                </View>

                {/* Selected Date Preview */}
                <View style={styles.selectedDatePreview}>
                  <Text style={styles.selectedDateText}>
                    {formatDateDDMMYYYY(selectedDate < minDate ? minDate : selectedDate)}
                  </Text>
                </View>

                {/* Date Picker - respects user's style preference */}
                <View style={styles.spinnerContainer}>
                  {!datePickerStyleLoading && (
                    <DateTimePicker
                      value={selectedDate < minDate ? minDate : selectedDate}
                      mode="date"
                      display={
                        datePickerStyle === 'calendar'
                          ? (Platform.OS === 'ios' ? 'compact' : 'default')
                          : (Platform.OS === 'ios' ? 'spinner' : 'default')
                      }
                      minimumDate={minDate}
                      onChange={(event, date) => {
                        if (Platform.OS === 'android') {
                          if (event.type === 'set' && date && date >= minDate) {
                            setSelectedDate(date);
                            setExpiryDate(formatDateDDMMYYYY(date));
                            setShowDatePicker(false);
                            if (!showForm && !isEditing && (Boolean(barcode) || isManualEntry)) {
                              setShowForm(true);
                              setTimeout(() => {
                                productNameInputRef.current?.focus();
                              }, 100);
                            }
                          } else if (event.type === 'dismissed') {
                            setShowDatePicker(false);
                            if (!showForm && !isEditing && (Boolean(barcode) || isManualEntry)) {
                              setShowForm(true);
                            }
                          } else if (date && date >= minDate) {
                            setSelectedDate(date);
                          }
                        } else {
                          if (date && date >= minDate) {
                            setSelectedDate(date);
                          }
                        }
                      }}
                      locale={locale}
                      style={datePickerStyle === 'calendar' ? styles.calendarDatePicker : styles.spinnerDatePicker}
                      themeVariant="light"
                      accentColor={datePickerStyle === 'calendar' ? THEME_COLORS.primary : undefined}
                    />
                  )}
                </View>

                {/* Action Buttons */}
                <View style={styles.datePickerActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancelDate}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelButtonText}>
                      {t('common.cancel') || 'ביטול'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={handleConfirmDate}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="check" size={20} color="#FFF" />
                    <Text style={styles.confirmButtonText}>
                      {t('common.confirm') || 'אישור'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={3000}
        style={snackType === 'error' ? styles.errorSnackbar : styles.successSnackbar}
        action={{
          label: t('common.close') || 'Close',
          onPress: () => setSnack(null),
        }}
      >
        {snack || ''}
      </Snackbar>

      <Portal>
        {/* Limit Reached Modal */}
        <Dialog
          visible={showLimitModal}
          onDismiss={() => setShowLimitModal(false)}
          style={[styles.categoryDialog, { backgroundColor: theme.colors.surface }]}
        >
          <Dialog.Title style={rtlText}>
            {limitModalTitle}
          </Dialog.Title>
          <Dialog.Content>
            <Text style={[rtlText, { marginBottom: 16 }]}>
              {limitModalText}
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={rtlContainer}>
            {/* Only show upgrade button if user is the owner (not a collaborator) */}
            {isOwner && limitModalAction === 'pro' && (
              <Button
                mode="contained"
                onPress={() => {
                  setShowLimitModal(false);
                  router.push('/(paywall)/subscribe' as any);
                }}
                style={styles.upgradeButton}
              >
                {t('screens.add.limitReached.upgrade')}
              </Button>
            )}
            {isOwner && limitModalAction === 'expired' && (
              <Button
                mode="contained"
                onPress={() => {
                  setShowLimitModal(false);
                  router.push('/(paywall)/subscribe' as any);
                }}
                style={styles.upgradeButton}
              >
                {t('screens.add.subscriptionExpired.renew')}
              </Button>
            )}
            <Button onPress={() => setShowLimitModal(false)}>
              {t('common.cancel')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 32,
    },
    card: {
      marginBottom: 12,
      borderRadius: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    cardContent: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    barcodeCard: {
      backgroundColor: '#E3F2FD',
    },
    row: {
      alignItems: 'center',
    },
    barcodeInfo: {
      flex: 1,
      ...(isRTL ? { marginRight: 8 } : { marginLeft: 8 }),
    },
    manualEntryLabel: {
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 4,
    },
    manualEntryValue: {
      fontSize: 18,
      fontWeight: '600',
    },
    categoryRow: {
      paddingVertical: 4,
    },
    categoryInfo: {
      flex: 1,
      marginHorizontal: 8,
    },
    dateRow: {
      paddingVertical: 4,
    },
    dateInfo: {
      flex: 1,
      marginHorizontal: 8,
    },
    inputContainer: {
      position: 'relative',
    },
    input: {
      backgroundColor: 'transparent',
    },
    inputOutline: {
      borderRadius: 12,
    },
    helperText: {
      marginTop: 8,
      marginHorizontal: 0,
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    loadingText: {
      ...(isRTL ? { marginRight: 12 } : { marginLeft: 12 }),
    },
    saveButton: {
      marginTop: 8,
      borderRadius: 16,
      paddingVertical: 4,
      ...Platform.select({
        ios: {
          shadowColor: THEME_COLORS.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 4,
        },
      }),
    },
    saveButtonLabel: {
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0.5,
      color: '#FFFFFF',
      paddingVertical: 8,
    },
    saveButtonContent: {
      paddingVertical: 12,
    },
    errorSnackbar: {
      backgroundColor: '#B00020',
    },
    successSnackbar: {
      backgroundColor: '#4CAF50',
    },
    // Date Picker Modal Styles - Premium Inline Spinner
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    datePickerCard: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
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
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 20,
      paddingHorizontal: 24,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#F3F4F6',
    },
    datePickerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#1F2937',
      letterSpacing: 0.2,
    },
    selectedDatePreview: {
      alignItems: 'center',
      paddingVertical: 16,
      backgroundColor: `${THEME_COLORS.primary}08`,
    },
    selectedDateText: {
      fontSize: 28,
      fontWeight: '700',
      color: THEME_COLORS.primary,
      letterSpacing: 1,
    },
    spinnerContainer: {
      backgroundColor: '#F8F9FA',
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    spinnerDatePicker: {
      height: 180,
      width: '100%',
    },
    calendarDatePicker: {
      height: 320,
      width: '100%',
    },
    datePickerActions: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: '#F3F4F6',
      backgroundColor: '#FAFAFA',
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: '#F3F4F6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#6B7280',
    },
    confirmButton: {
      flex: 1,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: '#4CAF50',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      ...Platform.select({
        ios: {
          shadowColor: '#4CAF50',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 4,
        },
      }),
    },
    confirmButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    categoryDialog: {
      borderRadius: 16,
    },
    selectedItem: {
      borderRadius: 8,
    },
    emptyCategoriesHelp: {
      marginTop: 8,
    },
    upgradeButton: {
      marginStart: isRTL ? 0 : 8,
      marginEnd: isRTL ? 8 : 0,
      borderRadius: 8,
    },
  });
}
