/**
 * Supplier Intake Screen
 * 
 * Scans supplier documents (delivery notes, invoices) and extracts product names + barcodes.
 * NO expiry dates are extracted - those are entered manually in the pending-expiry screen.
 * 
 * Flow:
 * 1. Take photo or pick image of supplier document
 * 2. AI extracts items (name + barcode)
 * 3. Insert into pending_items
 * 4. Ingest names (local override + suggestions + global catalog seeding)
 * 5. Navigate to pending-expiry screen
 */

import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { supabase } from '@/lib/supabase/client';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Dialog,
  IconButton,
  Portal,
  Snackbar,
  Text,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

// ============================================================================
// TYPES
// ============================================================================

interface SupplierItem {
  name: string | null;
  barcode: string;
  barcodeValid?: boolean;
  barcodeIssue?: string; // Why barcode is invalid
  nameSource?: 'override' | 'ai' | 'none';
  confidence?: number;
  qualityIssue?: string; // Why name wasn't saved as override
}

interface SupplierResponse {
  items: SupplierItem[];
  mode: string;
  passMode?: string;
  metrics?: {
    totalItemsReturned: number;
    validBarcodesCount: number;
    missingNameCount: number;
    invalidBarcodeCount: number;
    duplicatesRemoved: number;
    conflictingBarcodes: number;
    duplicateBarcodes: number;
    skippedBarcodes: number;
  };
  quota?: {
    pages_used: number;
    pages_limit: number;
    remaining: number;
    reset_at: string | null;
  };
  warnings?: string[];
  skippedBarcodes?: string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SupplierIntakeScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { activeOwnerId, isViewer, isOwner: isOwnerFromHook, loading: ownerLoading } = useActiveOwner();
  // Use isOwner directly from hook - it's accurate for both owners and collaborators (editors/viewers)
  const isOwner = isOwnerFromHook;
  
  // DEBUG: Log owner status
  console.log('[SupplierIntake] 🔍 Owner Status:', { isViewer, isOwner, activeOwnerId });
  
  const { isPro, isFreeTrialActive, subscription, refresh: refreshSubscription } = useSubscription();
  const styles = createStyles(isRTL);

  const [analyzing, setAnalyzing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [supplierIntakeCount, setSupplierIntakeCount] = useState<number>(0);
  const [isProPlan, setIsProPlan] = useState<boolean>(false);
  const [isInFreeTrial, setIsInFreeTrial] = useState<boolean>(false);
  const [limitDialogVisible, setLimitDialogVisible] = useState(false);
  const [extractedItems, setExtractedItems] = useState<SupplierItem[]>([]);
  const [dateChoiceDialogVisible, setDateChoiceDialogVisible] = useState(false);
  const [lastAddedCount, setLastAddedCount] = useState<number>(0);
  const [nextResetDate, setNextResetDate] = useState<Date | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [planLimitDialogVisible, setPlanLimitDialogVisible] = useState(false);
  
  const PRO_PLAN_LIMIT = 2000;
  const FREE_PLAN_LIMIT = 150;

  // Animation for date choice dialog
  const dialogScaleAnim = useRef(new Animated.Value(0.9)).current;
  const dialogOpacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (dateChoiceDialogVisible) {
      // Animate in
      Animated.parallel([
        Animated.spring(dialogScaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(dialogOpacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset
      dialogScaleAnim.setValue(0.9);
      dialogOpacityAnim.setValue(0);
    }
  }, [dateChoiceDialogVisible]);

  useEffect(() => {
    if (activeOwnerId) {
      loadUsageInfo();
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

  const MAX_FREE_INTAKE_PAGES = 10;
  const MAX_PRO_INTAKE_PAGES = 50;
  const TRIAL_DAYS = 30;
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null);
  const [intakePagesUsed, setIntakePagesUsed] = useState<number>(0);

  // Calculate the next billing cycle reset date based on subscription start
  const calculateNextResetDate = (subscriptionCreatedAt: string): Date => {
    const startDate = new Date(subscriptionCreatedAt);
    const now = new Date();

    // Find the next reset date (same day of month as subscription started)
    const dayOfMonth = startDate.getDate();
    let nextReset = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);

    // If we've passed this month's reset date, move to next month
    if (now >= nextReset) {
      nextReset.setMonth(nextReset.getMonth() + 1);
    }

    // Handle edge cases where day doesn't exist in the month (e.g., 31st)
    if (nextReset.getDate() !== dayOfMonth) {
      // Set to last day of previous month (e.g., Feb 28 for Jan 31 subscription)
      nextReset = new Date(nextReset.getFullYear(), nextReset.getMonth(), 0);
    }

    return nextReset;
  };

  const loadUsageInfo = async () => {
    if (!activeOwnerId) return;
    try {
      const tier = subscriptionTier;
      const isProOrProPlus = tier === 'pro' || tier === 'pro_plus';

      // For Pro/Pro+ users, use the RPC to get current quota status
      if (isProOrProPlus) {
        const { data: quotaData, error: quotaError } = await supabase
          .rpc('get_intake_pages_quota', { p_user_id: activeOwnerId });

        if (quotaError) {
          console.error('Error loading quota from RPC:', quotaError);
        } else if (quotaData) {
          setIntakePagesUsed(quotaData.pages_used ?? 0);
          setSubscriptionTier(quotaData.tier ?? tier);
          setIsProPlan(quotaData.tier === 'pro' || quotaData.tier === 'pro_plus');
          if (quotaData.reset_at) {
            setNextResetDate(new Date(quotaData.reset_at));
          }
          setSupplierIntakeCount(quotaData.pages_used ?? 0); // Keep for backward compat
          setIsInFreeTrial(false);
          return;
        }
      }

      // Fallback: direct profile query for free/trial users
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, supplier_intake_count, supplier_intake_pages_used, created_at, subscription_created_at')
        .eq('id', activeOwnerId)
        .maybeSingle();

      if (error) {
        console.error('Error loading usage info:', error);
        return;
      }

      if (data) {
        const profileTier = (data as any).subscription_tier as string | null;
        // Use pages_used if available, otherwise fallback to supplier_intake_count
        const pagesUsed = ((data as any).supplier_intake_pages_used as number | null) ??
          ((data as any).supplier_intake_count as number | null) ?? 0;
        const createdAt = (data as any).created_at as string | null;
        const subscriptionCreatedAt = (data as any).subscription_created_at as string | null;

        setIntakePagesUsed(pagesUsed);
        setSupplierIntakeCount(pagesUsed); // Keep for backward compat
        setSubscriptionTier(profileTier);
        setIsProPlan(profileTier === 'pro' || profileTier === 'pro_plus');

        // Calculate next reset date for Pro users
        if (profileTier === 'pro' && subscriptionCreatedAt) {
          const resetDate = calculateNextResetDate(subscriptionCreatedAt);
          setNextResetDate(resetDate);
        } else {
          setNextResetDate(null);
        }

        // Check if in free trial (only for free tier)
        if (createdAt && profileTier !== 'pro' && profileTier !== 'pro_plus') {
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
    } catch (e) {
      console.error('Unexpected error loading usage info:', e);
    }
  };

  const checkLimitAndMaybeBlock = (): boolean => {
    // Pro+ users - high volume (fair use)
    if (subscriptionTier === 'pro_plus') return true;
    // Free trial users - unlimited
    if (isInFreeTrial) return true;
    // Pro users - limited to 50 pages/month
    if (subscriptionTier === 'pro') {
      if (intakePagesUsed >= MAX_PRO_INTAKE_PAGES) {
        setLimitDialogVisible(true);
        return false;
      }
      return true;
    }
    // Free plan users - limited to 10 pages
    if (intakePagesUsed >= MAX_FREE_INTAKE_PAGES) {
      setLimitDialogVisible(true);
      return false;
    }
    return true;
  };

  // ============================================================================
  // IMAGE HANDLING
  // ============================================================================

  const handleTakePhoto = async () => {
    if (isViewer) {
      setSnack(t('supplierIntake.viewerCannotImport') || 'צופים לא יכולים לייבא');
      return;
    }

    // Don't check ownerLoading - activeOwnerId is available immediately from cache
    if (!activeOwnerId) {
      setSnack(t('supplierIntake.loading') || 'טוען...');
      return;
    }

    // Check if user has reached plan limit
    // IMPORTANT: Trial users (free tier during trial period) should NOT be limited
    // Only enforce limits for: paid Pro (2000), paid Pro+ (unlimited), and non-trial Free (150)
    console.log('[SupplierIntake] Plan limit check (takePhoto):', {
      isFreeTrialActive,
      isPro,
      itemCount,
      plan: subscription?.plan,
      isTrialActive: subscription?.isTrialActive
    });
    
    if (!isFreeTrialActive && itemCount !== null) {
      // Pro user reached 2000 item limit (only Pro, not Pro Plus or Trial)
      if (isPro && subscription?.plan === 'pro' && subscription?.isPaidActive && itemCount >= PRO_PLAN_LIMIT) {
        console.log('[SupplierIntake] ❌ Pro user hit 2000 limit');
        setPlanLimitDialogVisible(true);
        return;
      }
      // Free user reached 150 item limit (NOT in trial period)
      if (!isPro && itemCount >= FREE_PLAN_LIMIT) {
        console.log('[SupplierIntake] ❌ Free (non-trial) user hit 150 limit');
        setPlanLimitDialogVisible(true);
        return;
      }
    } else {
      console.log('[SupplierIntake] ✅ User is in trial or below limit, allowing add');
    }

    if (!checkLimitAndMaybeBlock()) return;

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('supplierIntake.permissionRequired') || 'נדרשת הרשאה',
          t('supplierIntake.cameraPermissionMessage') || 'יש לאשר גישה למצלמה'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.4,
        base64: true,
      });

      if (!result.canceled && result.assets[0]?.base64) {
        await analyzeImage(result.assets[0].base64);
      }
    } catch (error: any) {
      console.error('Error taking photo:', error);
      setSnack(t('supplierIntake.errorCapturing') || 'שגיאה בצילום');
    }
  };

  const handlePickImage = async () => {
    if (isViewer) {
      setSnack(t('supplierIntake.viewerCannotImport') || 'צופים לא יכולים לייבא');
      return;
    }

    // Don't check ownerLoading - activeOwnerId is available immediately from cache
    if (!activeOwnerId) {
      setSnack(t('supplierIntake.loading') || 'טוען...');
      return;
    }

    // Check if user has reached plan limit
    // IMPORTANT: Trial users (free tier during trial period) should NOT be limited
    // Only enforce limits for: paid Pro (2000), paid Pro+ (unlimited), and non-trial Free (150)
    console.log('[SupplierIntake] Plan limit check (pickImage):', {
      isFreeTrialActive,
      isPro,
      itemCount,
      plan: subscription?.plan,
      isTrialActive: subscription?.isTrialActive
    });
    
    if (!isFreeTrialActive && itemCount !== null) {
      // Pro user reached 2000 item limit (only Pro, not Pro Plus or Trial)
      if (isPro && subscription?.plan === 'pro' && subscription?.isPaidActive && itemCount >= PRO_PLAN_LIMIT) {
        console.log('[SupplierIntake] ❌ Pro user hit 2000 limit');
        setPlanLimitDialogVisible(true);
        return;
      }
      // Free user reached 150 item limit (NOT in trial period)
      if (!isPro && itemCount >= FREE_PLAN_LIMIT) {
        console.log('[SupplierIntake] ❌ Free (non-trial) user hit 150 limit');
        setPlanLimitDialogVisible(true);
        return;
      }
    } else {
      console.log('[SupplierIntake] ✅ User is in trial or below limit, allowing add');
    }

    if (!checkLimitAndMaybeBlock()) return;

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('supplierIntake.permissionRequired') || 'נדרשת הרשאה',
          t('supplierIntake.galleryPermissionMessage') || 'יש לאשר גישה לגלריה'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.4,
        base64: true,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]?.base64) {
        await analyzeImage(result.assets[0].base64);
      }
    } catch (error: any) {
      console.error('Error picking image:', error);
      setSnack(t('supplierIntake.errorPicking') || 'שגיאה בבחירת תמונה');
    }
  };

  // ============================================================================
  // AI ANALYSIS
  // ============================================================================

  const analyzeImage = async (imageBase64: string) => {
    if (!activeOwnerId) return;

    // Check quota BEFORE calling API
    const maxPages = isProPlan ? MAX_PRO_INTAKE_PAGES : MAX_FREE_INTAKE_PAGES;
    const remaining = Math.max(0, maxPages - intakePagesUsed);

    if (remaining <= 0) {
      if (isProPlan) {
        let resetMsg = '';
        if (nextResetDate) {
          resetMsg = ` • איפוס ב-${nextResetDate.toLocaleDateString(isRTL ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}`;
        }
        setSnack(`${t('supplierIntake.quotaExceeded') || 'ניצלת את כל דפי הקליטה החודשיים'}${resetMsg}`);
      } else {
        setSnack(t('supplierIntake.noMoreFreePages') || 'לא נותרו דפי קליטה חינמיים. שדרג לתוכנית Pro');
      }
      return;
    }

    setAnalyzing(true);
    setExtractedItems([]);

    try {
      console.log('[Supplier Intake] Calling Edge Function with mode=supplier, remaining:', remaining);

      const { data, error } = await supabase.functions.invoke('ai-import-table', {
        body: {
          imageBase64,
          ownerId: activeOwnerId,
          mode: 'supplier', // Key: supplier mode returns only name + barcode
          model: 'gemini', // Use Gemini 2.5 Flash-Lite
        },
      });

      if (error) {
        console.error('[Supplier Intake] Edge function error:', error);
        console.log('[Supplier Intake] Error type:', error.constructor?.name);
        console.log('[Supplier Intake] Error message:', error.message);

        // Try to get detailed error from the response
        let errorMessage = t('supplierIntake.aiError') || 'שגיאה בניתוח התמונה';
        let errorCode = '';
        let quotaFromError: any = null;

        // Check if there's context with the error details
        if (error.context) {
          try {
            // Try to parse the response body
            const errorBody = typeof error.context.json === 'function'
              ? await error.context.json()
              : null;

            console.log('[Supplier Intake] Error body:', errorBody);

            if (errorBody) {
              errorCode = errorBody.code || '';
              quotaFromError = errorBody.quota;
              if (errorBody.error) {
                errorMessage = errorBody.error;
              }
            }
          } catch (e) {
            console.log('[Supplier Intake] Could not parse error body:', e);
          }
        }

        if (error.message?.includes('AI_LIMIT_REACHED') || errorCode === 'AI_LIMIT_REACHED') {
          setLimitDialogVisible(true);
          return;
        }

        if (errorCode === 'QUOTA_EXCEEDED' || error.message?.includes('quota')) {
          // Update quota from error response
          if (quotaFromError) {
            setIntakePagesUsed(quotaFromError.pages_used ?? intakePagesUsed);
            if (quotaFromError.reset_at) {
              setNextResetDate(new Date(quotaFromError.reset_at));
            }
          }
          setSnack(t('supplierIntake.quotaExceeded') || 'ניצלת את כל דפי הקליטה החודשיים');
          return;
        }

        // App went to background during request
        if (error.message?.includes('Failed to send a request') ||
          error.name === 'FunctionsFetchError' ||
          error.constructor?.name === 'FunctionsFetchError') {
          setSnack(t('supplierIntake.keepAppOpen') || 'יש להשאיר את האפליקציה פתוחה בזמן העיבוד. נסה שוב.');
          return;
        }

        // Network error
        if (error.message?.includes('Network') || error.message?.includes('fetch')) {
          setSnack(t('common.networkError') || 'שגיאת רשת - בדוק את החיבור לאינטרנט');
          return;
        }

        setSnack(errorMessage);
        return;
      }

      const response = data as SupplierResponse;

      // Update quota info from response
      if (response.quota) {
        setIntakePagesUsed(response.quota.pages_used ?? 0);
        if (response.quota.reset_at) {
          setNextResetDate(new Date(response.quota.reset_at));
        }
        console.log('[Supplier Intake] Quota updated:', response.quota);
      }

      if (!response || !response.items || response.items.length === 0) {
        setSnack(t('supplierIntake.noItemsFound') || 'לא נמצאו פריטים בתמונה');
        return;
      }

      // Log metrics
      if (response.metrics) {
        console.log('[Supplier Intake] AI Metrics:', {
          totalItems: response.metrics.totalItemsReturned,
          validBarcodes: response.metrics.validBarcodesCount,
          missingNames: response.metrics.missingNameCount,
          invalidBarcodes: response.metrics.invalidBarcodeCount,
          duplicatesRemoved: response.metrics.duplicatesRemoved,
          conflicting: response.metrics.conflictingBarcodes,
          duplicates: response.metrics.duplicateBarcodes,
        });
      }

      console.log('[Supplier Intake] Extracted', response.items.length, 'items');

      // Log metrics if available
      if (response.metrics) {
        console.log('[Supplier Intake] Metrics:', JSON.stringify(response.metrics));
      }

      // Show warning if barcodes were skipped
      if (response.warnings && response.warnings.length > 0) {
        console.log('[Supplier Intake] Warnings:', response.warnings);
        // Show first warning to user
        setSnack(response.warnings[0]);
      }

      if (response.skippedBarcodes && response.skippedBarcodes.length > 0) {
        console.log('[Supplier Intake] Skipped barcodes:', response.skippedBarcodes);
      }

      // Count items with and without names
      const itemsWithNames = response.items.filter((i: any) => i.name !== null);
      const itemsWithoutNames = response.items.filter((i: any) => i.name === null);

      if (itemsWithoutNames.length > 0) {
        console.log('[Supplier Intake]', itemsWithoutNames.length, 'items need manual name entry');
      }

      setExtractedItems(response.items);

      // Increment supplier intake count for free plan users (not during trial)
      // Note: For Pro/Pro+ users, the Edge Function already handled quota
      if (!isProPlan && !isInFreeTrial) {
        const newCount = supplierIntakeCount + 1;
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ supplier_intake_count: newCount })
          .eq('id', activeOwnerId);

        if (updateError) {
          console.error('[Supplier Intake] Failed to increment count:', updateError);
        } else {
          setSupplierIntakeCount(newCount);
          console.log('[Supplier Intake] Incremented supplier_intake_count to', newCount);
        }
      }

      // Process the items
      await processExtractedItems(response.items);

    } catch (error: any) {
      console.error('[Supplier Intake] Analysis error:', error);
      setSnack(t('supplierIntake.aiError') || 'שגיאה בניתוח התמונה');
    } finally {
      setAnalyzing(false);
    }
  };

  // ============================================================================
  // PROCESS EXTRACTED ITEMS
  // ============================================================================

  const processExtractedItems = async (items: SupplierItem[]) => {
    if (!activeOwnerId || items.length === 0) return;

    setProcessing(true);

    try {
      // Count items with and without names for logging
      const itemsWithNames = items.filter(i => i.name !== null);
      const itemsWithoutNames = items.filter(i => i.name === null);

      console.log('[Supplier Intake] Processing:', {
        total: items.length,
        withNames: itemsWithNames.length,
        needingNames: itemsWithoutNames.length,
      });

      // 1) Insert into pending_items (all items, including those without names)
      const pendingInserts = items.map(item => ({
        store_id: activeOwnerId,
        barcode: item.barcode,
        raw_name: item.name, // May be null - user will complete later
        quantity: null,
        resolved_at: null,
      }));

      const { error: pendingError } = await supabase
        .from('pending_items')
        .insert(pendingInserts);

      if (pendingError) {
        console.error('[Supplier Intake] Error inserting pending items:', pendingError);
        setSnack(t('supplierIntake.saveError') || 'שגיאה בשמירת הפריטים');
        setProcessing(false);
        return;
      }

      console.log('[Supplier Intake] Inserted', items.length, 'pending items');

      // NOTE: Names are NOT saved to barcode tables (store_barcode_overrides, barcode_catalog, barcode_name_suggestions)
      // in supplier intake mode. OCR names stay only in pending_items.raw_name.
      // Names will be added to overrides only when user manually confirms/edits them.

      setSnack(
        (t('supplierIntake.itemsAdded') || '{count} פריטים נוספו').replace('{count}', String(items.length))
      );

      // 3) Show dialog to let user choose what to do next
      setLastAddedCount(items.length);
      setTimeout(() => {
        setDateChoiceDialogVisible(true);
      }, 500);

    } catch (error: any) {
      console.error('[Supplier Intake] Processing error:', error);
      setSnack(t('supplierIntake.saveError') || 'שגיאה בשמירת הפריטים');
    } finally {
      setProcessing(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const isLoading = analyzing || processing || (ownerLoading && !activeOwnerId);
  const remainingFreePages = Math.max(0, MAX_FREE_INTAKE_PAGES - intakePagesUsed);
  const remainingProPages = Math.max(0, MAX_PRO_INTAKE_PAGES - intakePagesUsed);

  // Format reset date for display
  const formatResetDate = (date: Date): string => {
    return date.toLocaleDateString(isRTL ? 'he-IL' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
  };

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
        <Text style={styles.headerTitle}>
          {t('supplierIntake.title') || 'קבלת סחורה'}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Instructions */}
        <Card style={styles.instructionCard}>
          <Card.Content>
            <View style={styles.instructionHeader}>
              <MaterialCommunityIcons name="truck-delivery" size={32} color={THEME_COLORS.primary} />
              <Text style={styles.instructionTitle}>
                {t('supplierIntake.instructionTitle') || 'סריקת מסמך ספק'}
              </Text>
            </View>
            <Text style={styles.instructionText}>
              {t('supplierIntake.instructionText') || 'צלם את תעודת המשלוח, החשבונית, או רשימת המוצרים. המערכת תזהה את המוצרים והברקודים באופן אוטומטי.'}
            </Text>
            <Text style={styles.instructionNote}>
              {t('supplierIntake.noExpiryNote') || 'תאריכי תפוגה יוזנו בנפרד לאחר הסריקה'}
            </Text>
          </Card.Content>
        </Card>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, isLoading && styles.actionButtonDisabled]}
            onPress={handleTakePhoto}
            disabled={isLoading}
          >
            <MaterialCommunityIcons
              name="camera"
              size={40}
              color={isLoading ? '#999' : THEME_COLORS.primary}
            />
            <Text style={[styles.actionButtonText, isLoading && styles.actionButtonTextDisabled]}>
              {t('supplierIntake.takePhoto') || 'צלם תמונה'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, isLoading && styles.actionButtonDisabled]}
            onPress={handlePickImage}
            disabled={isLoading}
          >
            <MaterialCommunityIcons
              name="image"
              size={40}
              color={isLoading ? '#999' : THEME_COLORS.primary}
            />
            <Text style={[styles.actionButtonText, isLoading && styles.actionButtonTextDisabled]}>
              {t('supplierIntake.pickImage') || 'בחר מגלריה'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Loading state */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME_COLORS.primary} />
            <Text style={styles.loadingText}>
              {ownerLoading && !activeOwnerId
                ? (t('common.loading') || 'טוען...')
                : analyzing
                  ? (t('supplierIntake.analyzing') || 'מנתח את התמונה...')
                  : (t('supplierIntake.processing') || 'שומר פריטים...')}
            </Text>
            {extractedItems.length > 0 && (
              <Text style={styles.loadingSubtext}>
                {(t('supplierIntake.foundItems') || 'נמצאו {count} פריטים').replace('{count}', String(extractedItems.length))}
              </Text>
            )}
          </View>
        )}

        {/* Usage info for Pro users */}
        {subscriptionTier === 'pro' && (
          <View style={[styles.usageInfo, remainingProPages === 0 && styles.usageInfoWarning]}>
            <MaterialCommunityIcons
              name={remainingProPages === 0 ? "alert-circle-outline" : "information-outline"}
              size={18}
              color={remainingProPages === 0 ? "#e74c3c" : "#666"}
            />
            <Text style={[styles.usageText, remainingProPages === 0 && styles.usageTextWarning]}>
              {remainingProPages === 0
                ? (t('supplierIntake.noRemainingPages') || 'לא נותרו דפי קליטה החודש')
                : (t('supplierIntake.proRemainingPages') || 'נותרו {count} דפי קליטה החודש').replace('{count}', String(remainingProPages))}
              {nextResetDate && (
                ` • ${(t('supplierIntake.resetDate') || 'איפוס ב-{date}').replace('{date}', formatResetDate(nextResetDate))}`
              )}
            </Text>
          </View>
        )}

        {/* Usage info for free plan (not during trial) */}
        {!isProPlan && !isInFreeTrial && (
          <View style={[styles.usageInfo, remainingFreePages === 0 && styles.usageInfoWarning]}>
            <MaterialCommunityIcons
              name={remainingFreePages === 0 ? "alert-circle-outline" : "information-outline"}
              size={18}
              color={remainingFreePages === 0 ? "#e74c3c" : "#666"}
            />
            <Text style={[styles.usageText, remainingFreePages === 0 && styles.usageTextWarning]}>
              {remainingFreePages === 0
                ? (t('supplierIntake.noMoreFreePages') || 'לא נותרו דפי קליטה. שדרג לתוכנית Pro')
                : (t('supplierIntake.remainingPages') || 'נותרו {count} דפי קליטה').replace('{count}', String(remainingFreePages))}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Intake Pages Limit Dialog */}
      <Portal>
        <Dialog visible={limitDialogVisible} onDismiss={() => setLimitDialogVisible(false)}>
          <Dialog.Title>{t('supplierIntake.limitReached') || 'הגעת למגבלה'}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {isOwner
                ? (subscriptionTier === 'pro'
                    ? (t('supplierIntake.proLimitMessage') || 'הגעת למגבלת 50 דפי קליטה בחודש. שדרג ל-Pro+ לנפח גבוה יותר.')
                    : (t('supplierIntake.freeLimitMessage') || 'קליטת סחורה מוגבלת ל-10 דפים בחשבון חינמי. שדרג ל-Pro לנפח גבוה יותר.'))
                : (subscriptionTier === 'pro'
                    ? 'הבעלים הגיע למגבלת 50 דפי קליטה בחודש. הבעלים צריך לשדרג ל-Pro+ לנפח גבוה יותר.'
                    : 'הבעלים הגיע למגבלת 10 דפי קליטה בחודש. הבעלים צריך לשדרג ל-Pro לנפח גבוה יותר.')
              }
            </Text>
            {nextResetDate && subscriptionTier === 'pro' && (
              <Text style={{ marginTop: 8, color: '#666' }}>
                {(t('supplierIntake.limitResetInfo') || 'המכסה תתאפס ב-{date}').replace('{date}', formatResetDate(nextResetDate))}
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLimitDialogVisible(false)}>
              {isOwner ? (t('common.close') || 'סגור') : (t('common.ok') || 'הבנתי')}
            </Button>
            {/* Only show upgrade button for owners */}
            {isOwner && (
              <Button onPress={() => { setLimitDialogVisible(false); router.push('/(paywall)/subscribe' as any); }}>
                {t('common.upgrade') || 'שדרג'}
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>

        {/* Plan Item Limit Dialog */}
        <Dialog visible={planLimitDialogVisible} onDismiss={() => setPlanLimitDialogVisible(false)}>
          <Dialog.Title>
            {console.log('[SupplierIntake] 🚨 Plan Limit Dialog shown - isOwner:', isOwner, 'isViewer:', isViewer)}
            {isOwner 
              ? (t('common.upgradeRequired') || 'הגעת למגבלת התכנית')
              : (t('common.upgradeRequired') || 'הגעת למגבלת התכנית')}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
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
                router.push('/(paywall)/subscribe' as any);
              }}>
                {isPro ? (t('subscription.upgradeToProPlus') || 'שדרג ל-Pro+') : (t('screens.add.limitReached.upgrade') || 'שדרוג')}
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Date Choice Dialog - Beautiful Custom Modal */}
      <Modal
        visible={dateChoiceDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateChoiceDialogVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDateChoiceDialogVisible(false)}>
          <View style={styles.dateChoiceBackdrop}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.dateChoiceCard,
                  {
                    opacity: dialogOpacityAnim,
                    transform: [{ scale: dialogScaleAnim }],
                  }
                ]}
              >
                {/* Success Icon */}
                <View style={styles.dateChoiceIconContainer}>
                  <View style={styles.dateChoiceIconCircle}>
                    <MaterialCommunityIcons name="check" size={32} color="#FFF" />
                  </View>
                </View>

                {/* Title */}
                <Text style={styles.dateChoiceTitle}>
                  {t('supplierIntake.dateChoiceTitle') || 'הפריטים נוספו בהצלחה!'}
                </Text>

                {/* Count Badge */}
                <View style={styles.dateChoiceCountBadge}>
                  <MaterialCommunityIcons name="package-variant" size={18} color={THEME_COLORS.primary} />
                  <Text style={styles.dateChoiceCountText}>
                    {lastAddedCount} {t('common.items') || 'פריטים'}
                  </Text>
                </View>

                {/* Message */}
                <Text style={styles.dateChoiceMessage}>
                  {t('supplierIntake.dateChoiceQuestion') || 'האם להזין תאריכי תפוגה עכשיו?'}
                </Text>

                {/* Buttons */}
                <View style={styles.dateChoiceButtons}>
                  <TouchableOpacity
                    style={styles.dateChoiceLaterButton}
                    onPress={() => setDateChoiceDialogVisible(false)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="clock-outline" size={20} color="#666" />
                    <Text style={styles.dateChoiceLaterText}>
                      {t('supplierIntake.enterLater') || 'מאוחר יותר'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dateChoiceNowButton}
                    onPress={() => {
                      setDateChoiceDialogVisible(false);
                      router.replace('/pending-expiry');
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="calendar-edit" size={20} color="#FFF" />
                    <Text style={styles.dateChoiceNowText}>
                      {t('supplierIntake.enterNow') || 'הזן עכשיו'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Snackbar */}
      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={3000}
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
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#333',
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    instructionCard: {
      marginBottom: 24,
      borderRadius: 16,
      backgroundColor: '#FFF',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    instructionHeader: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    instructionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#333',
      textAlign: isRTL ? 'right' : 'left',
    },
    instructionText: {
      fontSize: 15,
      color: '#555',
      lineHeight: 22,
      textAlign: isRTL ? 'right' : 'left',
      marginBottom: 12,
    },
    instructionNote: {
      fontSize: 13,
      color: '#888',
      fontStyle: 'italic',
      textAlign: isRTL ? 'right' : 'left',
    },
    actionButtons: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      gap: 16,
      marginBottom: 24,
    },
    actionButton: {
      flex: 1,
      backgroundColor: '#FFF',
      borderRadius: 16,
      paddingVertical: 24,
      alignItems: 'center',
      gap: 12,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    actionButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#333',
    },
    actionButtonTextDisabled: {
      color: '#999',
    },
    loadingContainer: {
      alignItems: 'center',
      paddingVertical: 32,
      gap: 16,
    },
    loadingText: {
      fontSize: 16,
      color: '#333',
      fontWeight: '500',
    },
    loadingSubtext: {
      fontSize: 14,
      color: '#666',
    },
    usageInfo: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    usageInfoWarning: {
      backgroundColor: '#fef2f2',
      borderRadius: 8,
      marginHorizontal: 16,
      paddingHorizontal: 12,
    },
    usageText: {
      fontSize: 13,
      color: '#666',
    },
    usageTextWarning: {
      color: '#e74c3c',
      fontWeight: '500',
    },
    // Date Choice Modal Styles
    dateChoiceBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    dateChoiceCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      width: '100%',
      maxWidth: 340,
      paddingTop: 32,
      paddingHorizontal: 24,
      paddingBottom: 24,
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.25,
          shadowRadius: 24,
        },
        android: {
          elevation: 16,
        },
      }),
    },
    dateChoiceIconContainer: {
      marginBottom: 20,
    },
    dateChoiceIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#4CAF50',
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#4CAF50',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    dateChoiceTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#1F2937',
      textAlign: 'center',
      marginBottom: 16,
      letterSpacing: 0.3,
    },
    dateChoiceCountBadge: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      backgroundColor: `${THEME_COLORS.primary}15`,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 8,
      marginBottom: 16,
    },
    dateChoiceCountText: {
      fontSize: 15,
      fontWeight: '600',
      color: THEME_COLORS.primary,
    },
    dateChoiceMessage: {
      fontSize: 15,
      color: '#6B7280',
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    dateChoiceButtons: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      gap: 12,
      width: '100%',
    },
    dateChoiceLaterButton: {
      flex: 1,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F3F4F6',
      paddingVertical: 14,
      borderRadius: 14,
      gap: 8,
    },
    dateChoiceLaterText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#4B5563',
    },
    dateChoiceNowButton: {
      flex: 1,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: THEME_COLORS.primary,
      paddingVertical: 14,
      borderRadius: 14,
      gap: 8,
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
    dateChoiceNowText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });

