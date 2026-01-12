import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { itemEvents } from '@/lib/events/itemEvents';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useDatePickerStyle } from '@/lib/hooks/useDatePickerStyle';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { addToOfflineQueue } from '@/lib/offline/offlineQueue';
import { supabase } from '@/lib/supabase/client';
import { createItem } from '@/lib/supabase/mutations/items';
import { createProduct } from '@/lib/supabase/mutations/products';
import { getCategories } from '@/lib/supabase/queries/categories';
import { getOrCreateDefaultLocation } from '@/lib/supabase/queries/locations';
import { getProductByBarcode } from '@/lib/supabase/queries/products';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Dialog, IconButton, Portal, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

const PENDING_SAVE_SUCCESS_KEY = 'pending_ai_import_success';
const PENDING_SAVE_ERROR_KEY = 'pending_save_error';

export type AiImportedItem = {
  id: string; // UI only
  name: string;
  expiryDate: string; // ISO string
  barcode?: string | null;
};

export default function AiImportScreen() {
  const router = useRouter();
  const { t, locale, isRTL } = useLanguage();
  const theme = useTheme();
  const { activeOwnerId, isViewer, isOwner: isOwnerFromHook, loading: ownerLoading } = useActiveOwner();
  // Use isOwner directly from hook - it's accurate for both owners and collaborators (editors/viewers)
  const isOwner = isOwnerFromHook;
  
  // DEBUG: Log owner status
  console.log('[AiImport] 🔍 Owner Status:', { isViewer, isOwner, activeOwnerId });
  
  const { isPro, isFreeTrialActive, subscription, refresh: refreshSubscription } = useSubscription();
  const { datePickerStyle, loading: datePickerStyleLoading } = useDatePickerStyle();
  const queryClient = useQueryClient();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const styles = createStyles(isRTL);
  const [items, setItems] = useState<AiImportedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [datePickerVisible, setDatePickerVisible] = useState<string | null>(null);
  const [datePickerDate, setDatePickerDate] = useState<Date>(new Date());
  const [aiAnalysisCount, setAiAnalysisCount] = useState<number>(0);
  const [isProPlan, setIsProPlan] = useState<boolean>(false);
  const [aiLimitDialogVisible, setAiLimitDialogVisible] = useState(false);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [planLimitDialogVisible, setPlanLimitDialogVisible] = useState(false);
  
  const PRO_PLAN_LIMIT = 2000;
  const FREE_PLAN_LIMIT = 150;

  useEffect(() => {
    if (activeOwnerId) {
      loadCategories();
      loadAiUsage();
      loadItemCount();
    }
  }, [activeOwnerId]);

  const loadItemCount = async () => {
    if (!activeOwnerId) return;
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
    }
  };

  const loadCategories = async () => {
    if (!activeOwnerId) return;
    try {
      const cats = await getCategories(activeOwnerId);
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const MAX_FREE_ANALYSES = 5;

  const loadAiUsage = async () => {
    if (!activeOwnerId) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, ai_analysis_count')
        .eq('id', activeOwnerId)
        .maybeSingle();

      if (error) {
        console.error('Error loading AI usage info:', error);
        return;
      }

      if (data) {
        const tier = (data as any).subscription_tier as string | null;
        const count = ((data as any).ai_analysis_count as number | null) ?? 0;
        setAiAnalysisCount(count);
        setIsProPlan(tier === 'pro' || tier === 'pro_plus');
      }
    } catch (e) {
      console.error('Unexpected error loading AI usage info:', e);
    }
  };

  const checkAiLimitAndMaybeBlock = (): boolean => {
    if (isProPlan) {
      return true;
    }

    if (aiAnalysisCount >= MAX_FREE_ANALYSES) {
      setAiLimitDialogVisible(true);
      return false;
    }

    return true;
  };

  // SPLIT & SCAN: Helper to split tall images into overlapping vertical slices
  const splitImageVertically = async (uri: string, width: number, height: number) => {
    console.log('[AI Import] Splitting image into 2 overlapping slices...');

    // Slice 1: Top 0%-60%
    const topSlice = await ImageManipulator.manipulateAsync(
      uri,
      [{
        crop: {
          originX: 0,
          originY: 0,
          width,
          height: Math.round(height * 0.6),
        },
      }],
      {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    // Slice 2: Bottom 40%-100% (20% overlap)
    const bottomSlice = await ImageManipulator.manipulateAsync(
      uri,
      [{
        crop: {
          originX: 0,
          originY: Math.round(height * 0.4),
          width,
          height: Math.round(height * 0.6),
        },
      }],
      {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    return [
      { base64: topSlice.base64!, sliceNum: 1 },
      { base64: bottomSlice.base64!, sliceNum: 2 },
    ];
  };

  // SPLIT & SCAN: Merge and deduplicate results
  const mergeSliceResults = (slice1Items: any[], slice2Items: any[]) => {
    const merged = [...slice1Items];
    const seen = new Set(slice1Items.map(item => `${item.name}|${item.expiryDate}`));

    let duplicatesRemoved = 0;
    for (const item of slice2Items) {
      const key = `${item.name}|${item.expiryDate}`;
      if (!seen.has(key)) {
        merged.push(item);
      } else {
        duplicatesRemoved++;
      }
    }

    console.log('[AI Import] Merged result:', merged.length, 'rows (removed', duplicatesRemoved, 'duplicates)');
    return merged;
  };

  const handlePickImage = async () => {
    if (isViewer) {
      setSnack(t('screens.aiImport.errors.viewerCannotImport'));
      return;
    }

    // Wait for activeOwnerId to be loaded if it's still loading
    if (ownerLoading) {
      setSnack(t('screens.aiImport.errors.loadingOwner') || 'טוען נתונים...');
      return;
    }

    // Check if activeOwnerId is available
    if (!activeOwnerId) {
      setSnack(t('screens.aiImport.errors.noOwner'));
      return;
    }

    // Check if user has reached plan limit
    // IMPORTANT: Trial users (free tier during trial period) should NOT be limited
    // Only enforce limits for: paid Pro (2000), paid Pro+ (unlimited), and non-trial Free (150)
    console.log('[AiImport] Plan limit check:', {
      isFreeTrialActive,
      isPro,
      itemCount,
      plan: subscription?.plan,
      isTrialActive: subscription?.isTrialActive
    });
    
    if (!isFreeTrialActive && itemCount !== null) {
      // Pro user reached 2000 item limit (only Pro, not Pro Plus or Trial)
      if (isPro && subscription?.plan === 'pro' && subscription?.isPaidActive && itemCount >= PRO_PLAN_LIMIT) {
        console.log('[AiImport] ❌ Pro user hit 2000 limit');
        setPlanLimitDialogVisible(true);
        return;
      }
      // Free user reached 150 item limit (NOT in trial period)
      if (!isPro && itemCount >= FREE_PLAN_LIMIT) {
        console.log('[AiImport] ❌ Free (non-trial) user hit 150 limit');
        setPlanLimitDialogVisible(true);
        return;
      }
    } else {
      console.log('[AiImport] ✅ User is in trial or below limit, allowing add');
    }

    if (!checkAiLimitAndMaybeBlock()) {
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('screens.aiImport.errors.permissionRequired'), t('screens.aiImport.errors.permissionMessage'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], // Use array format to avoid deprecation warning
        allowsEditing: true, // ENABLED: Allow user to crop to focus on table area
        aspect: [1, 1.25], // Height:Width ratio = 1:1.25 (slightly taller than square)
        quality: 1.0, // Keep original quality
        base64: false, // We'll get base64 after manipulation
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        // DETAILED DEBUG LOGGING - Original image
        const originalWidth = asset.width || 0;
        const originalHeight = asset.height || 0;
        const originalAspectRatio = originalHeight / originalWidth;
        const isTallDocument = originalAspectRatio > 1.4; // Tall table/list

        console.log('[AI Import] ===== ORIGINAL IMAGE (NO RESIZE/COMPRESS) =====');
        console.log('[AI Import] URI:', asset.uri?.substring(0, 50) + '...');
        console.log('[AI Import] Dimensions:', { width: originalWidth, height: originalHeight });
        console.log('[AI Import] File size:', asset.fileSize ? (asset.fileSize / 1024).toFixed(1) + ' KB' : 'unknown');
        console.log('[AI Import] Aspect ratio (H/W):', originalAspectRatio.toFixed(3));
        console.log('[AI Import] Is tall document:', isTallDocument);

        // Light resize to reduce OpenAI time while maintaining quality
        const maxSide = 2400;  // Reduced from no limit (was causing 90s+ calls)
        const currentMaxSide = Math.max(originalWidth, originalHeight);

        let resize: { width?: number; height?: number } | undefined;
        if (currentMaxSide > maxSide) {
          const scale = maxSide / currentMaxSide;
          resize = {
            width: Math.round(originalWidth * scale),
            height: Math.round(originalHeight * scale),
          };
          console.log('[AI Import] Resize:', { scale: scale.toFixed(3), target: `${resize.width}x${resize.height}` });
        } else {
          console.log('[AI Import] No resize needed (within maxSide)');
        }

        // Convert to base64 with light compression
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          asset.uri,
          resize ? [{ resize }] : [],  // Resize if needed
          {
            compress: 0.92,  // Light compression for balance between quality and speed
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );

        const base64 = manipulatedImage.base64;
        if (!base64) {
          setSnack(t('screens.aiImport.errors.errorLoadingImage'));
          return;
        }

        // LOGGING - Base64 size before sending
        const base64Length = base64.length;
        const estimatedSizeKB = ((base64Length * 3) / 4 / 1024).toFixed(1);

        console.log('[AI Import] ===== BEFORE SENDING TO AI =====');
        console.log('[AI Import] Base64 length:', base64Length);
        console.log('[AI Import] Estimated size (KB):', estimatedSizeKB);
        console.log('[AI Import] Image sent AS-IS (no resize/compress)');
        console.log('[AI Import] ========================================');

        // Double-check activeOwnerId before analyzing
        if (!activeOwnerId) {
          setSnack(t('screens.aiImport.errors.noOwner'));
          return;
        }

        // SPLIT & SCAN only for TALL documents (not square crops)
        const needsSplitScan = originalAspectRatio > 1.4;

        if (needsSplitScan) {
          console.log('[AI Import] 🔪 SPLIT & SCAN MODE - Aspect ratio:', originalAspectRatio.toFixed(2));
          setAnalyzing(true);
          setItems([]);

          try {
            // Split image
            const slices = await splitImageVertically(manipulatedImage.uri, manipulatedImage.width, manipulatedImage.height);
            console.log('[AI Import] Created', slices.length, 'slices');

            // Analyze each slice
            const allItems: AiImportedItem[][] = [];

            for (const slice of slices) {
              console.log('[AI Import] Analyzing slice', slice.sliceNum, '...');
              const { data, error } = await supabase.functions.invoke('ai-import-table', {
                body: { imageBase64: slice.base64, ownerId: activeOwnerId, mode: 'table_import', model: 'gemini' },
              });

              if (error) {
                console.error('[AI Import] Slice', slice.sliceNum, 'error:', error);
                throw error;
              }

              if (data?.items && Array.isArray(data.items)) {
                const sliceItems: AiImportedItem[] = data.items.map((item: any, index: number) => ({
                  id: `item-s${slice.sliceNum}-${Date.now()}-${index}`,
                  name: item.name || '',
                  expiryDate: item.expiryDate || '',
                  barcode: item.barcode || null,
                  needsBarcode: !item.barcode,
                  rowIndex: item.rowIndex || index + 1,
                }));

                allItems.push(sliceItems);
                console.log('[AI Import] Slice', slice.sliceNum, 'returned', sliceItems.length, 'items');
              }
            }

            // Merge results
            if (allItems.length === 2) {
              const mergedItems = mergeSliceResults(allItems[0], allItems[1]);

              // Filter out items without names (same as analyzeImage does)
              const itemsWithNames = mergedItems.filter(item => item.name && item.name.trim());

              console.log('[AI Import] ✅ SPLIT & SCAN complete:', itemsWithNames.length, 'total rows (filtered', mergedItems.length - itemsWithNames.length, 'empty names)');

              setItems(itemsWithNames);
              setAnalyzing(false);

              // Record AI usage
              await loadAiUsage();

              setSnack(t('screens.aiImport.success', { count: itemsWithNames.length }));
            } else {
              throw new Error('Expected 2 slices');
            }
          } catch (error: any) {
            console.error('[AI Import] SPLIT & SCAN error:', error);
            setAnalyzing(false);
            setSnack(t('screens.aiImport.errors.analysisError', { error: error.message }));
          }
        } else {
          // Normal single-pass OCR with Gemini
          await analyzeImage(base64, 'gemini');
        }
      }
    } catch (error: any) {
      console.error('Error picking/processing image:', error);
      setSnack(t('screens.aiImport.errors.errorPickingImage'));
    }
  };

  const analyzeImage = async (imageBase64: string, model?: string) => {
    if (!activeOwnerId) {
      setSnack(t('screens.aiImport.errors.noOwner'));
      return;
    }

    if (!checkAiLimitAndMaybeBlock()) {
      return;
    }

    setAnalyzing(true);
    setItems([]);

    console.log('[AI Import] Starting image analysis, base64 length:', imageBase64.length, 'Model:', model || 'default');
    console.log('[AI Import] Calling Edge Function: ai-import-table');

    try {
      const { data, error } = await supabase.functions.invoke('ai-import-table', {
        body: { imageBase64, ownerId: activeOwnerId, mode: 'table_import', model },
      });

      console.log('[AI Import] Edge Function response - has data:', !!data, 'has error:', !!error);

      if (error) {
        const status = (error as any).context?.status;

        if (status === 403) {
          console.log('[AI Import] Quota exceeded (403), handling gracefully.');
        } else {
          console.error('AI import error:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
        }

        // Extract error message
        let errorMessage = t('screens.aiImport.errors.unknownError');

        // Try to get error from context response
        try {
          const context = (error as any).context;
          // Allow parsing details for any error status (400, 403, 500, etc)
          if (context) {
            // Default 403 to quota exceeded if we can't parse the body
            if (context.status === 403) {
              errorMessage = 'quota_exceeded';
            }

            // The response body might be available, but Supabase client may have consumed it
            // Check if there's any error data in the error object itself
            if ((error as any).data) {
              const errorData = (error as any).data;
              if (typeof errorData === 'string') {
                try {
                  const parsed = JSON.parse(errorData);
                  if (parsed.error) {
                    errorMessage = parsed.error;
                    if (parsed.details) {
                      console.error('Edge Function error details:', parsed.details);
                    }
                  }
                } catch (e) {
                  // Keep the 403 quota_exceeded default if parsing fails and no other message
                  if (context.status !== 403) {
                    errorMessage = errorData;
                  }
                }
              } else if (errorData && errorData.error) {
                errorMessage = errorData.error;
              }
            }
          }
        } catch (e) {
          console.error('Error extracting error details:', e);
        }

        // Fallback to error.message or other properties
        if (errorMessage === t('screens.aiImport.errors.unknownError')) {
          if ((error as any).message) {
            errorMessage = (error as any).message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if ((error as any).error) {
            errorMessage = (error as any).error;
          }
        }

        // Check for specific error types and provide user-friendly messages
        if (errorMessage.includes('quota_exceeded') || errorMessage.includes('QUOTA_EXCEEDED')) {
          // Use the existing limitReached message or fall back to a generic one
          errorMessage = t('screens.aiImport.errors.limitReached') || 'מכסת השימוש החודשית שלך ב-AI הסתיימה.';
        } else if (errorMessage.includes('OPENAI_API_KEY not configured') || errorMessage.includes('AI service not configured')) {
          errorMessage = t('screens.aiImport.errors.aiNotConfigured');
        } else if (errorMessage.includes('maximum context length') || errorMessage.includes('context length') || errorMessage.includes('too large')) {
          errorMessage = t('screens.aiImport.errors.imageTooLargeError');
        } else if (errorMessage.includes('non-2xx status code')) {
          errorMessage = t('screens.aiImport.errors.functionError');
        } else if (errorMessage.includes('AI service error') || errorMessage.includes('AI request failed')) {
          errorMessage = t('screens.aiImport.errors.aiServiceError');
        } else if (errorMessage.includes('Invalid JSON from AI') || errorMessage.includes('did not return valid product data')) {
          errorMessage = t('screens.aiImport.errors.invalidResponse');
        } else if (errorMessage.includes('refused to process') || errorMessage.includes('content moderation')) {
          errorMessage = t('screens.aiImport.errors.refusedToProcess');
        } else if (errorMessage.includes('Internal server error')) {
          errorMessage = t('screens.aiImport.errors.internalError');
        }

        setSnack(t('screens.aiImport.errors.analysisError', { error: errorMessage }));
        return;
      }

      if (data?.items && Array.isArray(data.items)) {
        const importedItems: AiImportedItem[] = data.items.map((item: any, index: number) => ({
          id: `item-${Date.now()}-${index}`,
          name: item.name || '',
          expiryDate: item.expiryDate || '',
          barcode: item.barcode || null,
        }));

        // Filter out items with no name (only keep items that have names)
        const itemsWithNames = importedItems.filter(item => item.name.trim());

        if (itemsWithNames.length === 0) {
          // No items with names found
          setSnack(t('screens.aiImport.errors.noProductsFound'));
          setItems([]);
        } else {
          // CHANGED: Don't filter out items without dates - show ALL items
          // This allows user to see and fix problematic rows
          const itemsWithDates = itemsWithNames.filter(item => item.expiryDate);
          const itemsWithoutDates = itemsWithNames.filter(item => !item.expiryDate);

          // Always show ALL items (even those without dates)
          setItems(itemsWithNames);

          // Notify user about items that need attention
          if (itemsWithoutDates.length > 0) {
            setSnack(t('screens.aiImport.success.itemsNeedReview', {
              total: itemsWithNames.length,
              needReview: itemsWithoutDates.length
            }) || `נמצאו ${itemsWithNames.length} פריטים, ${itemsWithoutDates.length} דורשים תיקון תאריך`);
          } else {
            // All items have dates
            setSnack(t('screens.aiImport.success.allItemsComplete', { count: itemsWithNames.length }) || `נמצאו ${itemsWithNames.length} פריטים`);
          }
        }

        // Refresh usage count after successful analysis for free users
        if (!isProPlan) {
          setAiAnalysisCount((prev) => prev + 1);
        }
      } else {
        setSnack(t('screens.aiImport.errors.noProductsFound'));
      }
    } catch (error: any) {
      console.error('Error analyzing image:', error);
      setSnack(t('screens.aiImport.errors.analysisError', { error: t('screens.aiImport.errors.unknownError') }));
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (id: string, updates: Partial<AiImportedItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const openDatePicker = (itemId: string, currentDate: string) => {
    const date = currentDate ? new Date(currentDate) : new Date();
    setDatePickerDate(date);
    setDatePickerVisible(itemId);
  };

  const handleDateConfirm = (itemId: string) => {
    updateItem(itemId, { expiryDate: datePickerDate.toISOString().split('T')[0] });
    setDatePickerVisible(null);
  };

  const handleSaveAll = async () => {
    if (isViewer) {
      setSnack(t('screens.aiImport.errors.viewerCannotSave'));
      return;
    }

    if (!activeOwnerId) {
      setSnack(t('screens.aiImport.errors.noOwner'));
      return;
    }

    if (items.length === 0) {
      setSnack(t('screens.aiImport.errors.noItemsToSave'));
      return;
    }

    // Validate: only name is required, expiryDate is optional
    // Items without dates will be flagged but can still be saved
    const invalidItems = items.filter((item) => !item.name.trim());
    if (invalidItems.length > 0) {
      setSnack(t('screens.aiImport.errors.validationError') || 'יש פריטים ללא שם');
      return;
    }

    // Warn about items without dates but allow save
    const itemsWithoutDates = items.filter((item) => !item.expiryDate);
    if (itemsWithoutDates.length > 0) {
      console.log(`[AI Import] Saving ${itemsWithoutDates.length} items without expiry dates - will skip creating inventory items for them`);
    }

    // Check free-plan limit synchronously before navigating
    // IMPORTANT: Trial users should NOT be limited
    if (!isProPlan && !isFreeTrialActive) {
      try {
        const { count, error: countError } = await supabase
          .from('items')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', activeOwnerId)
          .eq('is_plan_locked', false as any);

        if (!countError) {
          const MAX_FREE_PRODUCTS = 150;
          const unlockedCount = (count as number | null) ?? 0;
          console.log('[AI Import] Save limit check:', { unlockedCount, MAX_FREE_PRODUCTS, isFreeTrialActive });
          if (unlockedCount >= MAX_FREE_PRODUCTS) {
            console.log('[AI Import] ❌ Free (non-trial) user hit 150 limit on save');
            Alert.alert(
              t('screens.aiImport.errors.limitReached'),
              t('screens.aiImport.errors.limitReachedMessage')
            );
            return;
          }
        }
      } catch (limitError) {
        console.error('[AI Import] Exception while enforcing free-plan product limit:', limitError);
      }
    } else {
      console.log('[AI Import] ✅ Save allowed (Pro or Trial user)');
    }

    // Capture data for background save
    const itemsToSave = [...items];
    const ownerId = activeOwnerId;
    const isPro = isProPlan;

    // Store "saving in progress" message for immediate display on scanner screen
    await AsyncStorage.setItem(PENDING_SAVE_SUCCESS_KEY, 'saving');

    // Navigate back immediately
    router.back();

    // Run save in background
    (async () => {
      try {
        const defaultLocationId = await getOrCreateDefaultLocation(ownerId);

        let savedCount = 0;
        let failedCount = 0;
        let offlineCount = 0;

        for (const item of itemsToSave) {
          try {
            // Skip items without valid names (defensive check)
            if (!item.name || !item.name.trim()) {
              console.warn('[AI Import] Skipping item without name:', item);
              failedCount++;
              continue;
            }

            // Skip items without expiry date (database requires it)
            if (!item.expiryDate || !item.expiryDate.trim()) {
              console.warn('[AI Import] Skipping item without expiry date:', item.name);
              failedCount++;
              continue;
            }

            // Find or create product
            let productId: string | null = null;

            if (item.barcode) {
              const existing = await getProductByBarcode(ownerId, item.barcode);
              if (existing) {
                productId = existing.id;
              } else {
                const created = await createProduct({
                  ownerId: ownerId,
                  name: item.name.trim(),
                  barcode: item.barcode,
                  category: null,
                });
                productId = created?.id ?? null;
              }
            } else {
              const created = await createProduct({
                ownerId: ownerId,
                name: item.name.trim(),
                barcode: null,
                category: null,
              });
              productId = created?.id ?? null;
            }

            if (!productId) {
              console.warn('Failed to create product for:', item.name);
              failedCount++;
              continue;
            }

            // Create item - convert empty expiry date to null
            await createItem({
              owner_id: ownerId,
              product_id: productId,
              expiry_date: item.expiryDate as any,
              note: null,
              status: undefined as any,
              barcode_snapshot: item.barcode || null,
              location_id: defaultLocationId,
            } as any);

            savedCount++;
          } catch (error: any) {
            const errorMessage = error?.message || '';
            const isNetworkError = errorMessage.includes('Network request failed') || errorMessage.includes('Failed to fetch');

            if (isNetworkError) {
              // Save to offline queue for later sync
              try {
                await addToOfflineQueue({
                  type: 'add_item',
                  data: {
                    name: item.name.trim(),
                    barcode: item.barcode || null,
                    expiry_date: item.expiryDate,
                    quantity: 1,
                    owner_id: ownerId,
                    location_id: null,
                    category_name: null,
                    notes: null,
                  },
                });
                offlineCount++;
                console.log('[AI Import] Item saved to offline queue:', item.name);
              } catch (offlineError) {
                console.error('[AI Import] Failed to save to offline queue:', item.name, offlineError);
                failedCount++;
              }
            } else {
              console.error('Error saving item:', item.name, error);
              failedCount++;
            }
          }
        }

        // CRITICAL: Invalidate TanStack Query cache to refresh All screen
        // This ensures the newly saved items appear immediately in the All screen
        if (savedCount > 0 || offlineCount > 0) {
          console.log('[AI Import] Invalidating items cache after saving', savedCount, 'items');
          // Invalidate both 'all' and 'expired' scopes to ensure fresh data
          if (ownerId) {
            queryClient.invalidateQueries({ queryKey: ['items', ownerId, 'all'] });
            queryClient.invalidateQueries({ queryKey: ['items', ownerId, 'expired'] });
            queryClient.invalidateQueries({ queryKey: ['stats', ownerId] });
          }
          
          // Refresh subscription to update activeItemsCount and canAddItems
          // This prevents collaborators from exceeding the owner's plan limit
          if (refreshSubscription) {
            await refreshSubscription();
            console.log('[AI Import] Subscription refreshed after adding items');
          }
        }

        // Store result for scanner screen to display
        const totalSuccess = savedCount + offlineCount;
        if (failedCount === 0) {
          // All succeeded (either online or queued for offline)
          if (offlineCount > 0 && savedCount === 0) {
            // All saved to offline queue
            await AsyncStorage.setItem(PENDING_SAVE_SUCCESS_KEY, `offline:${offlineCount}`);
          } else if (offlineCount > 0) {
            // Some online, some offline
            await AsyncStorage.setItem(PENDING_SAVE_SUCCESS_KEY, `mixed:${savedCount}:${offlineCount}`);
          } else {
            // All online
            await AsyncStorage.setItem(PENDING_SAVE_SUCCESS_KEY, 'all');
          }
        } else if (totalSuccess === 0) {
          // All failed
          await AsyncStorage.setItem(PENDING_SAVE_ERROR_KEY, t('screens.aiImport.errors.allFailed'));
        } else {
          // Partial success
          await AsyncStorage.setItem(PENDING_SAVE_SUCCESS_KEY, `partial:${totalSuccess}:${itemsToSave.length}`);
        }
      } catch (error: any) {
        console.error('Error saving items:', error);
        await AsyncStorage.setItem(PENDING_SAVE_ERROR_KEY, t('screens.aiImport.errors.networkError'));
      }
    })();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
      >
        {/* Back Button */}
        <View style={styles.backButtonContainer}>
          <IconButton
            icon={isRTL ? "arrow-right" : "arrow-left"}
            size={24}
            iconColor={THEME_COLORS.primary}
            onPress={() => router.back()}
            style={styles.backButton}
          />
        </View>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name="table-search" size={32} color={THEME_COLORS.primary} />
          </View>
          <Text style={[styles.heroTitle, rtlTextCenter]}>{t('screens.aiImport.title')}</Text>
          <Text
            style={[
              styles.heroSubtitle,
              rtlTextCenter,
              { writingDirection: isRTL ? 'rtl' : 'ltr', textAlign: 'center' },
            ]}
          >
            {t('screens.aiImport.subtitle')}
          </Text>
          <Text
            style={[
              styles.heroTip,
              rtlTextCenter,
              { writingDirection: isRTL ? 'rtl' : 'ltr', textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: 'bold', color: '#6B7280' },
            ]}
          >
            {t('screens.aiImport.imageQualityHint')}
          </Text>
        </View>

        {/* AI usage info */}
        <View style={styles.aiUsageContainer}>
          {isProPlan ? (
            <Text
              style={[
                styles.aiUsageText,
                rtlTextCenter,
                { writingDirection: isRTL ? 'rtl' : 'ltr', textAlign: 'center' },
              ]}
            >
              {t('screens.aiImport.usagePro')}
            </Text>
          ) : (
            <Text style={[styles.aiUsageText, rtlTextCenter]}>
              {t('screens.aiImport.usageFree', { remaining: Math.max(0, MAX_FREE_ANALYSES - aiAnalysisCount), total: MAX_FREE_ANALYSES })}
            </Text>
          )}
        </View>

        {/* Pick Image Button */}
        <Card style={styles.pickButtonCard} elevation={0}>
          <Card.Content style={styles.pickButtonContent}>
            <Button
              mode="contained"
              onPress={handlePickImage}
              disabled={analyzing || ownerLoading || !activeOwnerId}
              style={styles.pickButton}
              buttonColor={THEME_COLORS.primary}
              contentStyle={styles.pickButtonContentStyle}
              labelStyle={styles.pickButtonLabel}
              icon="image-plus"
            >
              {ownerLoading ? t('common.loading') : t('screens.aiImport.selectImage')}
            </Button>
          </Card.Content>
        </Card>

        {/* Analyzing State */}
        {analyzing && (
          <Card style={styles.analyzingCard}>
            <Card.Content style={styles.analyzingContent}>
              <ActivityIndicator size="large" color={THEME_COLORS.primary} />
              <Text style={[styles.analyzingText, rtlText]}>{t('screens.aiImport.analyzing')}</Text>
              <Text style={[styles.analyzingSubtext, rtlText]}>
                {t('screens.aiImport.analyzingSubtext')}
              </Text>
            </Card.Content>
          </Card>
        )}

        {items.length > 0 && (
          <View style={styles.itemsContainer}>
            <View style={styles.itemsHeader}>
              <MaterialCommunityIcons name="check-circle" size={24} color={THEME_COLORS.primary} />
              <Text style={[styles.itemsTitle, rtlText]}>
                {(t('screens.aiImport.itemsFound', { count: items.length }) || 'מוצרים שנמצאו').replace('%{count}', items.length.toString()).replace('{count}', items.length.toString())}
              </Text>
            </View>

            {items.map((item, index) => (
              <Card key={item.id} style={styles.itemCard} elevation={2}>
                <Card.Content style={styles.itemCardContent}>

                  <View style={styles.itemRow}>
                    <TextInput
                      label={t('screens.aiImport.productName')}
                      value={item.name}
                      onChangeText={(text) => updateItem(item.id, { name: text })}
                      style={[styles.itemInput, rtlText]}
                      mode="outlined"
                      contentStyle={styles.inputContent}
                    />
                  </View>

                  <View style={styles.itemRow}>
                    <TouchableOpacity
                      style={[styles.dateRow, rtlContainer]}
                      onPress={() => openDatePicker(item.id, item.expiryDate)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.dateIconContainer}>
                        <MaterialCommunityIcons name="calendar" size={22} color={THEME_COLORS.primary} />
                      </View>
                      <View style={styles.dateInfo}>
                        <Text variant="labelSmall" style={[styles.dateLabel, rtlText]}>
                          {t('screens.aiImport.expiryDate')}
                        </Text>
                        <Text variant="bodyLarge" style={[styles.dateValue, rtlText]}>
                          {item.expiryDate
                            ? new Date(item.expiryDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')
                            : t('screens.aiImport.selectDate')}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name={isRTL ? "chevron-left" : "chevron-right"}
                        size={20}
                        color="#9E9E9E"
                      />
                    </TouchableOpacity>
                  </View>



                  <View style={styles.deleteButtonContainer}>
                    <Button
                      mode="text"
                      onPress={() => deleteItem(item.id)}
                      textColor="#E57373"
                      icon="delete-outline"
                      style={styles.deleteButton}
                      labelStyle={styles.deleteButtonLabel}
                    >
                      {t('screens.aiImport.delete')}
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Fixed Save Button at Bottom */}
      {items.length > 0 && (
        <View style={styles.fixedSaveButtonContainer}>
          <Card style={styles.saveButtonCard} elevation={4}>
            <Card.Content style={styles.saveButtonCardContent}>
              <Button
                mode="contained"
                onPress={handleSaveAll}
                disabled={items.length === 0}
                style={styles.saveButton}
                buttonColor={THEME_COLORS.primary}
                contentStyle={styles.saveButtonContent}
                labelStyle={styles.saveButtonLabel}
                icon="content-save"
              >
                {t('screens.aiImport.saveAll')}
              </Button>
            </Card.Content>
          </Card>
        </View>
      )}

      {datePickerVisible && Platform.OS === 'android' && (
        <DateTimePicker
          value={datePickerDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (event.type === 'set' && date) {
              setDatePickerDate(date);
              handleDateConfirm(datePickerVisible);
            } else if (event.type === 'dismissed') {
              setDatePickerVisible(null);
            }
          }}
        />
      )}
      {datePickerVisible && Platform.OS === 'ios' && (
        <Modal
          visible={!!datePickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setDatePickerVisible(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Button onPress={() => setDatePickerVisible(null)}>{t('screens.aiImport.datePicker.cancel')}</Button>
                <Button onPress={() => handleDateConfirm(datePickerVisible)}>{t('screens.aiImport.datePicker.confirm')}</Button>
              </View>
              <DateTimePicker
                value={datePickerDate}
                mode="date"
                display={
                  datePickerStyle === 'calendar'
                    ? (Platform.OS === 'ios' ? 'compact' : 'default')
                    : (Platform.OS === 'ios' ? 'spinner' : 'default')
                }
                onChange={(event, date) => {
                  if (date) {
                    setDatePickerDate(date);
                  }
                }}
                style={styles.iosDatePicker}
                locale={locale}
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      )}

      <Portal>
        <Dialog
          visible={aiLimitDialogVisible}
          onDismiss={() => setAiLimitDialogVisible(false)}
        >
          <Dialog.Title style={rtlText}>{t('screens.aiImport.limitDialog.title')}</Dialog.Title>
          <Dialog.Content>
            <Text style={rtlText}>
              {t('screens.aiImport.limitDialog.message')}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAiLimitDialogVisible(false)}>{t('screens.aiImport.limitDialog.understood')}</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={planLimitDialogVisible}
          onDismiss={() => setPlanLimitDialogVisible(false)}
        >
          <Dialog.Title style={rtlText}>
            {isOwner 
              ? (t('common.upgradeRequired') || 'הגעת למגבלת התכנית')
              : (t('common.upgradeRequired') || 'הגעת למגבלת התכנית')}
          </Dialog.Title>
          <Dialog.Content>
            <Text style={rtlText}>
              {isOwner 
                ? (isPro 
                    ? (t('common.upgradeRequiredMessagePro') || 'הגעת למגבלה של 2,000 מוצרים בתכנית Pro. כדי להוסיף מוצרים נוספים, שדרג לתכנית Pro Plus.')
                    : (t('screens.add.limitReached.message') || 'התוכנית החינמית מאפשרת עד 150 מוצרים בלבד. כדי להמשיך להוסיף מוצרים, יש לשדרג לתוכנית פרו.'))
                : (isPro
                    ? (t('screens.add.limitReached.collaboratorMessagePro') || 'הבעלים הגיע למגבלת תוכנית Pro של 2,000 מוצרים. הבעלים צריך לשדרג ל-Pro+ כדי להוסיף מוצרים נוספים.')
                    : (t('screens.add.limitReached.collaboratorMessage') || 'הבעלים הגיע למגבלת התוכנית החינמית של 150 מוצרים. הבעלים צריך לשדרג לתוכנית Pro כדי להוסיף מוצרים נוספים.'))}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPlanLimitDialogVisible(false)}>
              {isOwner ? (t('common.cancel') || 'ביטול') : (t('common.ok') || 'הבנתי')}
            </Button>
            {/* Only show upgrade button for owners */}
            {isOwner && (
              <Button onPress={() => {
                setPlanLimitDialogVisible(false);
                router.push('/(paywall)/subscribe');
              }}>
                {isPro ? (t('subscription.upgradeToProPlus') || 'שדרג ל-Pro+') : (t('screens.add.limitReached.upgrade') || 'שדרוג')}
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={3000}
        action={{
          label: t('common.close'),
          onPress: () => setSnack(null),
        }}
      >
        {snack || ''}
      </Snackbar>
    </SafeAreaView>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 60,
      paddingBottom: 32,
    },
    backButtonContainer: {
      position: 'absolute',
      top: 8,
      left: 8,
      zIndex: 10,
    },
    backButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      margin: 0,
    },
    // Hero Section
    heroSection: {
      alignItems: 'center',
      marginBottom: 20,
      paddingTop: 4,
      width: '100%',
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: `${THEME_COLORS.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: '#1A1A1A',
      marginBottom: 8,
      textAlign: 'center',
      letterSpacing: 0.15,
      width: '100%',
    },
    heroSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: '#757575',
      textAlign: 'center',
      paddingHorizontal: 8,
      width: '100%',
    },
    heroTip: {
      fontSize: 13,
      color: '#EF4444', // Softer red
      textAlign: 'center',
      width: '100%',
      marginTop: 8,
      fontWeight: '500',
    },
    aiUsageContainer: {
      marginBottom: 16,
    },
    aiUsageText: {
      fontSize: 13,
      color: '#4B5563',
    },
    // Pick Button
    pickButtonCard: {
      marginBottom: 24,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    pickButtonContent: {
      padding: 0,
    },
    pickButton: {
      margin: 0,
    },
    pickButtonContentStyle: {
      paddingVertical: 12,
    },
    pickButtonLabel: {
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    trialHint: {
      fontSize: 13,
      color: '#757575',
      marginTop: 8,
      textAlign: 'center',
      lineHeight: 18,
    },
    // Analyzing State
    analyzingCard: {
      marginBottom: 24,
      borderRadius: 16,
      backgroundColor: '#F8F9FA',
    },
    analyzingContent: {
      alignItems: 'center',
      paddingVertical: 32,
      paddingHorizontal: 24,
    },
    analyzingText: {
      marginTop: 16,
      fontSize: 18,
      fontWeight: '600',
      color: '#1A1A1A',
    },
    analyzingSubtext: {
      marginTop: 8,
      fontSize: 14,
      color: '#757575',
    },
    // Items Container
    itemsContainer: {
      marginTop: 8,
    },
    itemsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
      gap: 8,
    },
    itemsTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: '#1A1A1A',
      letterSpacing: 0.15,
    },
    // Item Card
    itemCard: {
      marginBottom: 16,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      position: 'relative',
      overflow: 'visible',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        android: {
          elevation: 3,
        },
      }),
    },
    itemCardContent: {
      padding: 20,
    },
    itemRow: {
      marginBottom: 16,
    },
    itemInput: {
      backgroundColor: '#FAFAFA',
    },
    inputContent: {
      fontSize: 16,
    },
    // Date Row
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: '#F8F9FA',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E0E0E0',
    },
    dateIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${THEME_COLORS.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
      ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }),
    },
    dateInfo: {
      flex: 1,
    },
    dateLabel: {
      fontSize: 12,
      color: '#757575',
      marginBottom: 4,
      fontWeight: '500',
    },
    dateValue: {
      fontSize: 16,
      color: '#1A1A1A',
      fontWeight: '600',
    },
    // Delete Button
    deleteButtonContainer: {
      marginTop: 8,
      alignItems: 'flex-start',
    },
    deleteButton: {
      margin: 0,
      padding: 0,
    },
    deleteButtonLabel: {
      fontSize: 14,
      fontWeight: '500',
    },
    // Fixed Save Button Container
    fixedSaveButtonContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      paddingBottom: 20,
      paddingTop: 12,
      backgroundColor: 'transparent',
    },
    // Save Button
    saveButtonCard: {
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      ...Platform.select({
        ios: {
          shadowColor: THEME_COLORS.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
        },
        android: {
          elevation: 4,
        },
      }),
    },
    saveButtonCardContent: {
      padding: 0,
    },
    saveButton: {
      margin: 0,
    },
    saveButtonContent: {
      paddingVertical: 10,
    },
    saveButtonLabel: {
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end', // Modal positioning at bottom - not RTL dependent
    },
    modalContent: {
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#E0E0E0',
    },
    iosDatePicker: {
      width: '100%',
      height: 200,
    },
  });
}

