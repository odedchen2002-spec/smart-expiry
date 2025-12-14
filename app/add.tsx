import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, StyleSheet, Platform, Keyboard, Modal, TouchableWithoutFeedback, ScrollView, TouchableOpacity, Animated, Alert } from 'react-native';
import { Appbar, Button, HelperText, Text, TextInput, Snackbar, Portal, Dialog, List, Chip, useTheme, Card, IconButton, ActivityIndicator } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/lib/hooks/useProfile';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useDatePickerStyle } from '@/lib/hooks/useDatePickerStyle';
import { createItem, updateItem } from '@/lib/supabase/mutations/items';
import { getItemById } from '@/lib/supabase/queries/items';
import { getProductByBarcode } from '@/lib/supabase/queries/products';
import { createProduct } from '@/lib/supabase/mutations/products';
import { getCategories, getDefaultCategory } from '@/lib/supabase/queries/categories';
import { getOrCreateDefaultLocation } from '@/lib/supabase/queries/locations';
import { supabase } from '@/lib/supabase/client';
import { loadItemsFromCache } from '@/lib/storage/itemsCache';
import { getRtlTextStyles, getRtlContainerStyles, getRTLMargin } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const PENDING_SAVE_ERROR_KEY = 'pending_save_error';

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
  const { t, isRTL } = useLanguage();
  const theme = useTheme();
  const { user } = useAuth();
  const { activeOwnerId, isOwner, loading: ownerLoading, isViewer } = useActiveOwner();
  const { profile } = useProfile();
  const { datePickerStyle } = useDatePickerStyle();
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
  const [originalItem, setOriginalItem] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [snackType, setSnackType] = useState<'success' | 'error'>('success');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    // Initialize from params if available (instant display)
    if (params?.category) return params.category;
    return null;
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
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
  const fadeAnim = useMemo(() => new Animated.Value(0), []);

  // No longer needed - we use activeOwnerId directly

  // Animate on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);



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
            if (item.product_category) {
              setSelectedCategory(item.product_category);
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

  // Load categories when owner is available
  useEffect(() => {
    if (!activeOwnerId) return;
    (async () => {
      try {
        const cats = await getCategories(activeOwnerId);
        setCategories(cats);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    })();
  }, [activeOwnerId]);

  // Auto-load product name by barcode when available (only for scan flow, not manual entry)
  // First check cache, then fetch from Supabase in background
  useEffect(() => {
    if (isEditing) return;
    if (!activeOwnerId || !barcode) return;
    // Skip this effect for manual entry (add without barcode) - no barcode lookup needed
    if (isManualEntry) return;
    
    let mounted = true;
    let foundInCache = false;
    
    (async () => {
      // Step 1: Try to find in cached items first (fast, synchronous-like)
      try {
        const cached = await loadItemsFromCache(activeOwnerId);
        if (cached && cached.items && mounted) {
          // Look for item with matching barcode
          const matchingItem = cached.items.find(
            (item) => 
              (item.barcode_snapshot === barcode || item.product_barcode === barcode) &&
              item.product_name
          );
          
          if (matchingItem && matchingItem.product_name) {
            setProductName(matchingItem.product_name);
            if (matchingItem.product_category) {
              setSelectedCategory(matchingItem.product_category);
            }
            foundInCache = true;
            // Don't set loading - we found it in cache
          }
        }
      } catch (cacheError) {
        console.warn('[Add] Error loading from cache:', cacheError);
      }
      
      // Step 2: Fetch from Supabase in background (even if found in cache, to get latest data)
      setLoadingProduct(true);
      try {
        const existing = await getProductByBarcode(activeOwnerId, barcode);
        if (mounted && existing?.name) {
          // Update with fresh data from Supabase
          setProductName(existing.name);
          if (existing.category) {
            setSelectedCategory(existing.category);
          }
        }
      } catch (error) {
        console.warn('[Add] Error fetching product by barcode:', error);
        // Keep cached data if available
      } finally {
        if (mounted) {
          setLoadingProduct(false);
        }
      }
    })();
    
    return () => { mounted = false };
  }, [activeOwnerId, barcode, isEditing]);

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
  }, [expiryDate, minDate, shouldPromptDate]);

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
    
    if (!productName || productName.trim() === '') {
      showSnack(t('add.nameRequired') || 'Please enter a product name', 'error');
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
        // Item is locked - show upgrade prompt
        Alert.alert(
          t('common.upgradeRequired') || 'שדרוג נדרש',
          t('common.upgradeRequiredMessage') || 'חרגת מכמות המוצרים המותרת בתוכנית החינמית. כדי לערוך את כל המוצרים ולקבל התראות ללא הגבלה, שדרג לתוכנית Pro.'
        );
        return;
      }
      // Item is not locked - allow edit to proceed
    } else {
      // Adding a new item - check if user can add more items
      try {
        const { canAddItem } = await import('@/lib/subscription/subscription');
        // Use account created date from profiles or user.created_at for trial calculation
        const accountCreatedAt = profile?.created_at || user?.created_at;
        const profileTier = profile?.subscription_tier || null;
        const { canAdd, reason } = await canAddItem(
          activeOwnerId,
          profileTier,
          accountCreatedAt,
          profile?.subscription_tier || null,
          profile?.subscription_valid_until || null
        );
        
        if (!canAdd) {
          if (reason === 'free_limit' || reason?.includes('Free plan limit') || reason?.includes('free_limit')) {
            // Free plan limit reached
            setLimitModalTitle(t('screens.add.limitReached.title') || t('common.upgradeRequired') || 'Free Plan Limit Reached');
            setLimitModalText(t('screens.add.limitReached.message') || t('common.upgradeRequiredMessage') || 'In the free plan, you can manage up to 100 unlocked products. You are currently managing the first 100 products you added. To unlock all products, upgrade to the Pro plan.');
            setLimitModalAction('pro');
            setShowLimitModal(true);
            return;
          } else if (reason?.includes('subscription has expired') || reason?.includes('המנוי שלך הסתיים')) {
            // Subscription expired
            setLimitModalTitle(t('screens.add.subscriptionExpired.title'));
            setLimitModalText(t('screens.add.subscriptionExpired.message'));
            setLimitModalAction('expired');
            setShowLimitModal(true);
            return;
          } else {
            // Other error
            showSnack(reason || t('screens.add.error'), 'error');
            return;
          }
        }
      } catch (error) {
        // If subscription check fails, allow the save to proceed (fail open)
        console.error('Error checking subscription:', error);
        // Don't block the save - let it proceed
      }
    }

    // Prepare save data (synchronous, no DB calls)
    const categoryToUse = selectedCategory || null;
    const saveData = {
      productName,
      barcode,
      categoryToUse,
      dbDate,
      isEditing,
      itemId: params?.itemId,
      originalItem,
      activeOwnerId,
    };

    // Navigate immediately (don't wait for DB)
    setSaving(false); // Reset saving state immediately
    
    // Determine navigation target
    if (isEditing) {
      // When editing, go back to the previous screen (where user came from)
      router.back();
    } else if (params?.barcode) {
      // New item added via scanning - go to camera scan screen
      router.replace('/scan' as any);
    } else {
      // New item added manually - go to scanner tab
      router.replace('/(tabs)/scanner' as any);
    }

    // Save in background (fire-and-forget)
    (async () => {
      try {
        let productId: string | null = null;
        let defaultLocationId: string | null = null;
        
        if (saveData.isEditing && saveData.originalItem) {
          productId = saveData.originalItem.product_id || null;
          
          const productUpdates: any = {};
          if (saveData.productName && saveData.productName !== saveData.originalItem.product_name) {
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
          await createItem({
            owner_id: saveData.activeOwnerId,
            product_id: productId,
            expiry_date: saveData.dbDate as any,
            note: null,
            status: undefined as any,
            barcode_snapshot: saveData.barcode || null,
            location_id: defaultLocationId!,
          } as any);
        }

        // Success - clear any pending errors
        await AsyncStorage.removeItem(PENDING_SAVE_ERROR_KEY);
      } catch (e: any) {
        console.error('Background save error:', e);
        const errorMessage = e?.message || e?.error?.message || t('add.saveError') || 'Failed to save product';
        
        // Store error in AsyncStorage for destination screen to display
        try {
          await AsyncStorage.setItem(PENDING_SAVE_ERROR_KEY, errorMessage);
        } catch (storageError) {
          console.error('Error storing save error:', storageError);
        }
      }
    })();
  };

  const canSave = !saving && !showDatePicker && !!productName?.trim() && isValid && activeOwnerId && !isViewer;

  // Block viewers from accessing the add/edit screen
  if (!ownerLoading && isViewer) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
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
        <Appbar.Header>
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
      <Appbar.Header>
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

          {/* Category Selector */}
          <Card 
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            onPress={() => setShowCategoryDialog(true)}
          >
            <Card.Content style={styles.cardContent}>
              <TouchableOpacity 
                style={[styles.row, rtlContainer, styles.categoryRow]}
                onPress={() => setShowCategoryDialog(true)}
                activeOpacity={0.7}
              >
                <IconButton 
                  icon="folder" 
                  size={24} 
                  iconColor={selectedCategory ? THEME_COLORS.primary : theme.colors.onSurfaceVariant} 
                />
                <View style={styles.categoryInfo}>
                  <Text variant="labelSmall" style={[rtlText, { color: theme.colors.onSurfaceVariant }]}>
                    {t('item.category') || 'קטגוריה'}
                  </Text>
                  <Text
                    variant="bodyLarge" 
                    style={[
                      rtlText,
                      { 
                        color: selectedCategory ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                        fontWeight: selectedCategory ? '500' : '400'
                      }
                    ]}
                  >
                    {selectedCategory || t('categories.uncategorized') || getDefaultCategory()}
                  </Text>
                </View>
                <IconButton 
                  icon={isRTL ? "chevron-left" : "chevron-right"} 
                  size={24} 
                  iconColor={theme.colors.onSurfaceVariant} 
                />
              </TouchableOpacity>
              {!selectedCategory && categories.length === 0 && (
                <HelperText type="info" visible style={styles.helperText}>
                  {t('add.defaultCategoryInfo') || 'המוצר יועבר לקטגוריה ברירת מחדל'}
                </HelperText>
              )}
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

      {/* Date Picker Modal - Always rendered so it can be shown even when form is hidden */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDate}
      >
        <TouchableWithoutFeedback onPress={handleCancelDate}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
                <View style={[styles.modalHeader, { borderBottomColor: theme.colors.surfaceVariant }]}>
                  <View style={[styles.modalHeaderContent, rtlContainer]}>
                    <View style={[styles.modalIconContainer, { backgroundColor: THEME_COLORS.primary + '15' }]}>
                      <MaterialCommunityIcons 
                        name="calendar-check" 
                        size={24} 
                        color={THEME_COLORS.primary} 
                      />
                    </View>
                    <View style={styles.modalTitleContainer}>
                      <Text style={[styles.modalTitle, rtlText, { color: theme.colors.onSurface }]}>
                        {t('add.chooseExpiryDate') || 'Choose expiry date'}
                      </Text>
                      <Text style={[styles.modalSubtitle, rtlText, { color: theme.colors.onSurfaceVariant }]}>
                        {t('add.dateDesc') || 'בחר מתי המוצר הזה יפוג'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                  <View style={[styles.datePickerContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <DateTimePicker
                      value={selectedDate < minDate ? minDate : selectedDate}
                      mode="date"
                      display={
                        datePickerStyle === 'calendar' 
                          ? (Platform.OS === 'ios' ? 'inline' : 'default')
                          : (Platform.OS === 'ios' ? 'spinner' : 'default')
                      }
                      minimumDate={minDate}
                      onChange={(event, date) => {
                        if (Platform.OS === 'android') {
                          if (event.type === 'set' && date && date >= minDate) {
                            setSelectedDate(date);
                            setExpiryDate(formatDateDDMMYYYY(date));
                            setShowDatePicker(false);
                            // If form was hidden (barcode scan flow), show it now and focus product name
                            if (!showForm && !isEditing && (Boolean(barcode) || isManualEntry)) {
                              setShowForm(true);
                              setTimeout(() => {
                                productNameInputRef.current?.focus();
                              }, 100);
                            }
                          } else if (event.type === 'dismissed') {
                            setShowDatePicker(false);
                            // If form was hidden and user dismisses date picker, show form anyway
                            if (!showForm && !isEditing && (Boolean(barcode) || isManualEntry)) {
                              setShowForm(true);
                            }
                          } else if (date && date >= minDate) {
                            setSelectedDate(date);
                          }
                        } else {
                          // iOS
                          if (date && date >= minDate) {
                            setSelectedDate(date);
                          }
                        }
                      }}
                      style={styles.datePicker}
                      textColor={theme.colors.onSurface}
                      accentColor={datePickerStyle === 'calendar' ? THEME_COLORS.primary : "white"}
                      themeVariant="light"
                      locale="he_IL"
                    />
                  </View>
                </View>

                <View style={[styles.modalFooter, { borderTopColor: theme.colors.surfaceVariant }]}>
                  <Button
                    mode="outlined"
                    onPress={handleCancelDate}
                    style={styles.modalCancelButton}
                    labelStyle={[styles.modalCancelLabel, { color: theme.colors.onSurfaceVariant }]}
                    contentStyle={styles.modalButtonContent}
                  >
                    {t('common.cancel') || 'Cancel'}
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleConfirmDate}
                    style={styles.modalConfirmButton}
                    labelStyle={styles.modalConfirmLabel}
                    buttonColor={THEME_COLORS.primary}
                    contentStyle={styles.modalButtonContent}
                    icon="check"
                  >
                    {t('common.confirm') || 'Confirm'}
                  </Button>
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
        <Dialog 
          visible={showCategoryDialog} 
          onDismiss={() => setShowCategoryDialog(false)}
          style={[styles.categoryDialog, { backgroundColor: theme.colors.surface }]}
        >
          <Dialog.Title style={rtlText}>
            {t('add.selectCategory') || 'בחר קטגוריה'}
          </Dialog.Title>
          <Dialog.Content>
            <List.Section>
              <List.Item
                title={t('categories.defaultCategory') || 'Default Category'}
                description={t('categories.uncategorized') || getDefaultCategory()}
                left={(props) => <List.Icon {...props} icon="folder-outline" />}
                onPress={() => {
                  setSelectedCategory(null);
                  setShowCategoryDialog(false);
                }}
                style={selectedCategory === null ? [styles.selectedItem, { backgroundColor: theme.colors.primaryContainer }] : undefined}
                titleStyle={rtlText}
                descriptionStyle={rtlText}
              />
              {categories.map((category) => (
                <List.Item
                  key={category}
                  title={category}
                  left={(props) => <List.Icon {...props} icon="folder" />}
                  onPress={() => {
                    setSelectedCategory(category);
                    setShowCategoryDialog(false);
                  }}
                  style={selectedCategory === category ? [styles.selectedItem, { backgroundColor: theme.colors.primaryContainer }] : undefined}
                  titleStyle={rtlText}
                />
              ))}
              {categories.length === 0 && (
                <HelperText type="info" visible style={styles.emptyCategoriesHelp}>
                  {t('add.noCategories') || 'No categories. Product will be added to default category'}
                </HelperText>
              )}
            </List.Section>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCategoryDialog(false)}>
              {t('common.close') || 'Close'}
            </Button>
          </Dialog.Actions>
        </Dialog>

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
            {limitModalAction === 'pro' && (
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
            {limitModalAction === 'expired' && (
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
  // Date Picker Modal Styles
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
    minWidth: 100,
    borderRadius: 12,
  },
  modalCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmButton: {
    minWidth: 120,
    borderRadius: 12,
  },
  modalConfirmLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalCancelButton: {
    minWidth: 100,
    borderRadius: 12,
  },
  modalCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmButton: {
    minWidth: 100,
    borderRadius: 12,
  },
  modalConfirmLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
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
