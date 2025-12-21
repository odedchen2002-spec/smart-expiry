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
import { supabase } from '@/lib/supabase/client';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
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
  name: string;
  barcode: string | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SupplierIntakeScreen() {
  const router = useRouter();
  const { t, locale, isRTL, currentLocale } = useLanguage();
  const { activeOwnerId, isViewer, loading: ownerLoading } = useActiveOwner();
  const styles = createStyles(isRTL);
  
  const [analyzing, setAnalyzing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [aiAnalysisCount, setAiAnalysisCount] = useState<number>(0);
  const [isProPlan, setIsProPlan] = useState<boolean>(false);
  const [aiLimitDialogVisible, setAiLimitDialogVisible] = useState(false);
  const [extractedItems, setExtractedItems] = useState<SupplierItem[]>([]);

  useEffect(() => {
    if (activeOwnerId) {
      loadAiUsage();
    }
  }, [activeOwnerId]);

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
        setIsProPlan(tier === 'pro');
      }
    } catch (e) {
      console.error('Unexpected error loading AI usage info:', e);
    }
  };

  const checkAiLimitAndMaybeBlock = (): boolean => {
    if (isProPlan) return true;
    if (aiAnalysisCount >= MAX_FREE_ANALYSES) {
      setAiLimitDialogVisible(true);
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

    if (ownerLoading || !activeOwnerId) {
      setSnack(t('supplierIntake.loading') || 'טוען...');
      return;
    }

    if (!checkAiLimitAndMaybeBlock()) return;

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

    if (ownerLoading || !activeOwnerId) {
      setSnack(t('supplierIntake.loading') || 'טוען...');
      return;
    }

    if (!checkAiLimitAndMaybeBlock()) return;

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

    setAnalyzing(true);
    setExtractedItems([]);

    try {
      console.log('[Supplier Intake] Calling Edge Function with mode=supplier');
      
      const { data, error } = await supabase.functions.invoke('ai-import-table', {
        body: {
          imageBase64,
          ownerId: activeOwnerId,
          mode: 'supplier', // Key: supplier mode returns only name + barcode
        },
      });

      if (error) {
        console.error('[Supplier Intake] Edge function error:', error);
        
        if (error.message?.includes('AI_LIMIT_REACHED')) {
          setAiLimitDialogVisible(true);
          return;
        }
        
        setSnack(t('supplierIntake.aiError') || 'שגיאה בניתוח התמונה');
        return;
      }

      if (!data || !data.items || data.items.length === 0) {
        setSnack(t('supplierIntake.noItemsFound') || 'לא נמצאו פריטים בתמונה');
        return;
      }

      console.log('[Supplier Intake] Extracted', data.items.length, 'items');
      setExtractedItems(data.items);
      
      // Reload AI usage count
      await loadAiUsage();
      
      // Process the items
      await processExtractedItems(data.items);

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
      // 1) Insert into pending_items
      const pendingInserts = items.map(item => ({
        store_id: activeOwnerId,
        barcode: item.barcode || null,
        raw_name: item.name,
        quantity: null, // Not used
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

      // 2) Name ingestion for items with barcode + name
      const itemsWithBarcode = items.filter(item => item.barcode && item.name);
      
      for (const item of itemsWithBarcode) {
        if (!item.barcode) continue;
        
        try {
          // 2a) Check and insert store_barcode_overrides (if not exists)
          const { data: existingOverride } = await supabase
            .from('store_barcode_overrides')
            .select('barcode')
            .eq('store_id', activeOwnerId)
            .eq('barcode', item.barcode)
            .maybeSingle();

          if (!existingOverride) {
            await supabase
              .from('store_barcode_overrides')
              .insert({
                store_id: activeOwnerId,
                barcode: item.barcode,
                custom_name: item.name,
                updated_at: new Date().toISOString(),
              });
            console.log('[Supplier Intake] Created store override for:', item.barcode);
          }

          // 2b) Insert suggestion (always)
          await supabase
            .from('barcode_name_suggestions')
            .insert({
              store_id: activeOwnerId,
              barcode: item.barcode,
              suggested_name: item.name,
              locale: currentLocale || null,
            });

          // 2c) Seed global catalog via Edge Function (if missing)
          try {
            await supabase.functions.invoke('seed-global-catalog', {
              body: {
                barcode: item.barcode,
                name: item.name,
                locale: currentLocale || null,
              },
            });
          } catch (seedError) {
            // Non-critical, log and continue
            console.warn('[Supplier Intake] Failed to seed global catalog:', seedError);
          }

        } catch (nameError) {
          console.warn('[Supplier Intake] Name ingestion error for', item.barcode, ':', nameError);
          // Continue with other items
        }
      }

      console.log('[Supplier Intake] Name ingestion complete');
      
      setSnack(
        (t('supplierIntake.itemsAdded') || '{count} פריטים נוספו').replace('{count}', String(items.length))
      );

      // 3) Navigate to pending-expiry screen
      setTimeout(() => {
        router.replace('/pending-expiry');
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

  const isLoading = analyzing || processing;
  const remainingAnalyses = Math.max(0, MAX_FREE_ANALYSES - aiAnalysisCount);

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
              {analyzing
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

        {/* AI usage info */}
        {!isProPlan && (
          <View style={styles.usageInfo}>
            <MaterialCommunityIcons name="information-outline" size={18} color="#666" />
            <Text style={styles.usageText}>
              {(t('supplierIntake.remainingAnalyses') || 'נותרו {count} ניתוחים').replace('{count}', String(remainingAnalyses))}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* AI Limit Dialog */}
      <Portal>
        <Dialog visible={aiLimitDialogVisible} onDismiss={() => setAiLimitDialogVisible(false)}>
          <Dialog.Title>{t('supplierIntake.limitReached') || 'הגעת למגבלה'}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {t('supplierIntake.limitMessage') || 'ניתוחי AI מוגבלים בחשבון חינמי. שדרג לפרו לניתוחים ללא הגבלה.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAiLimitDialogVisible(false)}>
              {t('common.close') || 'סגור'}
            </Button>
            <Button onPress={() => { setAiLimitDialogVisible(false); router.push('/subscribe'); }}>
              {t('common.upgrade') || 'שדרג'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
    usageText: {
      fontSize: 13,
      color: '#666',
    },
  });

