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
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
} from 'react-native';
import { IconButton, Text, Button, Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { resolveBarcodeToName, saveStoreOverride, submitBarcodeSuggestion } from '@/lib/supabase/services/barcodeNameService';
import { tryResolvePendingItem } from '@/lib/supabase/services/pendingItemsService';
import { createItem } from '@/lib/supabase/mutations/items';
import { createProduct } from '@/lib/supabase/mutations/products';
import { getProductByBarcode } from '@/lib/supabase/queries/products';
import { logExpiryEvent } from '@/lib/supabase/services/expiryEventsService';
import { getOrCreateDefaultLocation } from '@/lib/supabase/queries/locations';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
// COMPONENT
// ============================================================================

export default function FastScanScreen() {
  const { t, isRTL, currentLocale } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { activeOwnerId, loading: ownerLoading, isViewer } = useActiveOwner();
  const insets = useSafeAreaInsets();

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
    
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    
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
  }, [mode, scanState, activeOwnerId, currentLocale, flashCamera]);

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

  const handleSaveName = useCallback(async () => {
    const trimmedName = nameInput.trim();
    if (trimmedName.length < 3 || !activeOwnerId) return;
    
    setIsSaving(true);
    try {
      if (scannedBarcode) {
        await saveStoreOverride(activeOwnerId, scannedBarcode, trimmedName);
        await submitBarcodeSuggestion(scannedBarcode, trimmedName, activeOwnerId, currentLocale);
      }
      setProductName(trimmedName);
      setIsEditingName(false);
      setNameInput('');
      Keyboard.dismiss();
      
      // If we were in unnamed state, transition to ready
      if (scanState === 'scanned_unnamed') {
        setScanState('scanned_ready');
      }
    } catch (error) {
      console.error('Error saving name:', error);
    } finally {
      setIsSaving(false);
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

  const handleSaveDate = useCallback(async () => {
    if (!activeOwnerId) return;
    
    // Validate date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      setSnackMessage(t('fastScan.dateInPast') || 'תאריך לא יכול להיות בעבר');
      return;
    }
    
    setIsSaving(true);
    
    try {
      const expiryDateStr = formatDateForDB(selectedDate);
      const locationId = await getOrCreateDefaultLocation(activeOwnerId);
      
      if (!locationId) {
        console.error('Could not get default location');
        setIsSaving(false);
        return;
      }

      const barcodeToUse = scannedBarcode || existingBarcode || null;
      const nameToUse = productName || existingProductName || null;
      
      // Check pending items (supplier flow)
      let matchedPending = false;
      if (barcodeToUse) {
        try {
          const pending = await tryResolvePendingItem(activeOwnerId, barcodeToUse);
          if (pending) {
            matchedPending = true;
          }
        } catch {}
      }
      
      // Get or create product
      let productId: string | null = null;
      if (barcodeToUse && nameToUse) {
        try {
          // Check if product already exists for this barcode
          let existingProduct = await getProductByBarcode(activeOwnerId, barcodeToUse);
          
          if (existingProduct) {
            productId = existingProduct.id;
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
      await createItem({
        owner_id: activeOwnerId,
        product_id: productId,
        barcode_snapshot: barcodeToUse,
        expiry_date: expiryDateStr,
        location_id: locationId,
      } as any);
      
      // Log event for UPDATE DATE flow
      if (mode === 'date_only' && existingItemId) {
        await logExpiryEvent(activeOwnerId, 'UPDATED_DATE', existingItemId, barcodeToUse, 'user');
      }
      
      await playSuccessFeedback();
      
      if (matchedPending) {
        setSnackMessage(t('fastScan.matchedSupplierItem') || 'הותאם לסחורה מהספק');
      }
      
      // Save date and update state
      setSavedDate(selectedDate);
      
      if (mode === 'date_only') {
        setTimeout(() => router.back(), 400);
      } else {
        setScanState('date_saved');
      }
      
    } catch (error) {
      console.error('Error saving:', error);
      setSnackMessage(t('common.error') || 'שגיאה');
    } finally {
      setIsSaving(false);
    }
  }, [selectedDate, activeOwnerId, scannedBarcode, existingBarcode, mode, existingItemId, playSuccessFeedback, router, t]);

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
    } catch {}
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

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const canSaveName = nameInput.trim().length >= 3;
  const minDate = new Date();
  minDate.setHours(0, 0, 0, 0);
  
  const shouldScan = scanState === 'idle' || scanState === 'date_saved';
  const showBottomSheet = scanState !== 'idle';

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <View style={styles.container}>
      {/* ================================================================== */}
      {/* CAMERA - Always visible */}
      {/* ================================================================== */}
      <View style={[styles.cameraSection, { paddingTop: insets.top }]}>
        <CameraView
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
        
        {/* Barcode frame */}
        <View style={styles.barcodeFrameContainer}>
          <View style={styles.barcodeFrame}>
            <View style={[styles.barcodeCorner, styles.barcodeCornerTL]} />
            <View style={[styles.barcodeCorner, styles.barcodeCornerTR]} />
            <View style={[styles.barcodeCorner, styles.barcodeCornerBL]} />
            <View style={[styles.barcodeCorner, styles.barcodeCornerBR]} />
          </View>
        </View>
      </View>

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
            <TouchableOpacity style={styles.enterNameButton} onPress={handleStartNameEdit}>
              <MaterialCommunityIcons name="pencil" size={20} color="#FFF" />
              <Text style={styles.enterNameButtonText}>{t('fastScan.enterName') || 'הזן שם'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* State: Ready for date OR editing name */}
        {(scanState === 'scanned_ready' || scanState === 'date_saved') && !isEditingName && (
          <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentInner} bounces={false}>
            {/* Product info - tappable for editing */}
            <TouchableOpacity style={styles.productRow} onPress={handleStartNameEdit} activeOpacity={0.7}>
              <View style={[styles.productNameRow, isRTL && styles.productNameRowRTL]}>
                <Text style={styles.productName} numberOfLines={1}>{productName || existingProductName}</Text>
                <MaterialCommunityIcons name="pencil-outline" size={16} color="#999" />
              </View>
              <Text style={styles.barcodeSmall}>{scannedBarcode || existingBarcode}</Text>
            </TouchableOpacity>

            {/* Date section */}
            {scanState === 'scanned_ready' && (
              <>
                <Text style={styles.dateLabel}>{t('fastScan.selectExpiryDate') || 'בחר תאריך תפוגה'}</Text>
                
                {/* Date Picker - inline spinner */}
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

                {/* Save button */}
                <TouchableOpacity
                  style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                  onPress={handleSaveDate}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check" size={22} color="#FFF" />
                      <Text style={styles.saveButtonText}>{t('common.save') || 'שמור'}</Text>
                    </>
                  )}
                </TouchableOpacity>
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
            <TouchableOpacity style={styles.inputBarCancelButton} onPress={handleCancelNameEdit}>
              <Text style={styles.inputBarCancelText}>{t('common.cancel') || 'ביטול'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inputBarSaveButton, !canSaveName && styles.inputBarSaveButtonDisabled]}
              onPress={handleSaveName}
              disabled={!canSaveName || isSaving}
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
    borderColor: 'rgba(255, 255, 255, 0.8)',
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
    paddingVertical: 4,
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
