import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { supabase } from '@/lib/supabase/client';
import { createItem } from '@/lib/supabase/mutations/items';
import { createProduct } from '@/lib/supabase/mutations/products';
import { getCategories } from '@/lib/supabase/queries/categories';
import { getOrCreateDefaultLocation } from '@/lib/supabase/queries/locations';
import { getProductByBarcode } from '@/lib/supabase/queries/products';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Dialog, IconButton, Portal, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const { activeOwnerId, isViewer, loading: ownerLoading } = useActiveOwner();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const styles = createStyles(isRTL);
  const [items, setItems] = useState<AiImportedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [datePickerVisible, setDatePickerVisible] = useState<string | null>(null);
  const [datePickerDate, setDatePickerDate] = useState<Date>(new Date());
  const [aiAnalysisCount, setAiAnalysisCount] = useState<number>(0);
  const [isProPlan, setIsProPlan] = useState<boolean>(false);
  const [aiLimitDialogVisible, setAiLimitDialogVisible] = useState(false);

  useEffect(() => {
    if (activeOwnerId) {
      loadCategories();
      loadAiUsage();
    }
  }, [activeOwnerId]);

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
        setIsProPlan(tier === 'pro');
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
        allowsEditing: true, // Enable editing to allow cropping/resizing
        quality: 0.3, // Reduced quality to reduce file size while maintaining readability
        base64: true,
        allowsMultipleSelection: false,
        // Note: OpenAI GPT-4o can handle large images (up to 20MB), but we compress to reduce upload time
      });

      if (!result.canceled && result.assets[0]) {
        const base64 = result.assets[0].base64;
        if (!base64) {
          setSnack(t('screens.aiImport.errors.errorLoadingImage'));
          return;
        }

        // Check base64 size - OpenAI GPT-4o can handle up to 20MB, but we'll warn if over 5MB
        // Base64 is ~33% larger than binary
        const base64SizeKB = (base64.length * 3) / 4 / 1024; // Approximate size in KB
        const base64SizeMB = base64SizeKB / 1024;
        
        if (base64SizeMB > 5) {
          Alert.alert(
            t('screens.aiImport.errors.imageTooLarge'),
            t('screens.aiImport.errors.imageTooLargeMessage', { size: Math.round(base64SizeMB * 10) / 10 }),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('screens.aiImport.errors.tryAnyway'), onPress: () => analyzeImage(base64) },
            ]
          );
          return;
        }
        
        // Warn if image is large but still processable
        if (base64SizeMB > 2) {
          console.log(`[AI Import] Large image detected: ${Math.round(base64SizeMB * 10) / 10}MB, processing anyway...`);
        }

        // Double-check activeOwnerId before analyzing (it might have changed during image selection)
        if (!activeOwnerId) {
          setSnack(t('screens.aiImport.errors.noOwner'));
          return;
        }

        await analyzeImage(base64);
      }
    } catch (error: any) {
      console.error('Error picking image:', error);
      setSnack(t('screens.aiImport.errors.errorPickingImage'));
    }
  };

  const analyzeImage = async (imageBase64: string) => {
    if (!activeOwnerId) {
      setSnack(t('screens.aiImport.errors.noOwner'));
      return;
    }

    if (!checkAiLimitAndMaybeBlock()) {
      return;
    }

    setAnalyzing(true);
    setItems([]);

    console.log('[AI Import] Starting image analysis, base64 length:', imageBase64.length);
    console.log('[AI Import] Calling Edge Function: ai-import-table');

    try {
      const { data, error } = await supabase.functions.invoke('ai-import-table', {
        body: { imageBase64, ownerId: activeOwnerId },
      });

      console.log('[AI Import] Edge Function response - has data:', !!data, 'has error:', !!error);

      if (error) {
        console.error('AI import error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        
        // Extract error message
        let errorMessage = t('screens.aiImport.errors.unknownError');
        
        // Try to get error from context response
        try {
          const context = (error as any).context;
          if (context && context.status === 500) {
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
                  errorMessage = errorData;
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
        if (errorMessage.includes('OPENAI_API_KEY not configured') || errorMessage.includes('AI service not configured')) {
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
        setItems(importedItems);
        if (importedItems.length === 0) {
          setSnack(t('screens.aiImport.errors.noProductsFound'));
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

    // Validate all items
    const invalidItems = items.filter((item) => !item.name.trim() || !item.expiryDate);
    if (invalidItems.length > 0) {
      setSnack(t('screens.aiImport.errors.validationError'));
      return;
    }

    setSaving(true);

    try {
      // Enforce free-plan product limit for AI import based on unlocked items
      // Skip this check entirely for Pro users
      if (!isProPlan) {
        try {
          const { count, error: countError } = await supabase
            .from('items')
            .select('id', { count: 'exact', head: true })
            .eq('owner_id', activeOwnerId)
            .eq('is_plan_locked', false as any);

          if (countError) {
            console.error('[AI Import] Error counting existing items for free-plan limit:', countError);
          } else {
            const MAX_FREE_PRODUCTS = 150;
            const unlockedCount = (count as number | null) ?? 0;
            if (unlockedCount >= MAX_FREE_PRODUCTS) {
              Alert.alert(
                t('screens.aiImport.errors.limitReached'),
                t('screens.aiImport.errors.limitReachedMessage')
              );
              setSaving(false);
              return;
            }
          }
        } catch (limitError) {
          console.error('[AI Import] Exception while enforcing free-plan product limit:', limitError);
        }
      }

      const defaultLocationId = await getOrCreateDefaultLocation(activeOwnerId);

      for (const item of items) {
        try {
          // Find or create product
          let productId: string | null = null;

          if (item.barcode) {
            const existing = await getProductByBarcode(activeOwnerId, item.barcode);
            if (existing) {
              productId = existing.id;
            } else {
              const created = await createProduct({
                ownerId: activeOwnerId,
                name: item.name.trim(),
                barcode: item.barcode,
                category: null,
              });
              productId = created?.id ?? null;
            }
          } else {
            const created = await createProduct({
              ownerId: activeOwnerId,
              name: item.name.trim(),
              barcode: null,
              category: null,
            });
            productId = created?.id ?? null;
          }

          if (!productId) {
            console.warn('Failed to create product for:', item.name);
            continue;
          }

          // Create item
          await createItem({
            owner_id: activeOwnerId,
            product_id: productId,
            expiry_date: item.expiryDate as any,
            note: null,
            status: undefined as any,
            barcode_snapshot: item.barcode || null,
            location_id: defaultLocationId,
          } as any);
        } catch (error: any) {
          console.error('Error saving item:', item.name, error);
          // Continue with next item
        }
      }

      setSnack(t('screens.aiImport.errors.saveSuccess'));
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error('Error saving items:', error);
      setSnack(t('screens.aiImport.errors.saveError', { error: error.message || t('screens.aiImport.errors.unknownError') }));
    } finally {
      setSaving(false);
    }
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
              disabled={analyzing || saving}
              style={styles.pickButton}
              buttonColor={THEME_COLORS.primary}
              contentStyle={styles.pickButtonContentStyle}
              labelStyle={styles.pickButtonLabel}
              icon="image-plus"
            >
              {t('screens.aiImport.selectImage')}
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

                  <View style={styles.itemRow}>
                    <TextInput
                      label={t('screens.aiImport.barcode')}
                      value={item.barcode || ''}
                      onChangeText={(text) => updateItem(item.id, { barcode: text || null })}
                      style={[styles.itemInput, rtlText]}
                      mode="outlined"
                      keyboardType="numeric"
                      contentStyle={styles.inputContent}
                    />
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
                disabled={saving || items.length === 0}
                loading={saving}
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
                display="spinner"
                onChange={(event, date) => {
                  if (date) {
                    setDatePickerDate(date);
                  }
                }}
                style={styles.iosDatePicker}
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

