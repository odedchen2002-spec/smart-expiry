import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, Platform, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, IconButton, Portal, Snackbar, Text } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_SAVE_ERROR_KEY = 'pending_save_error';

export default function ScanScreen() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const { activeOwnerId, loading: ownerLoading, isViewer } = useActiveOwner();
  const insets = useSafeAreaInsets();

  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [errorSnack, setErrorSnack] = useState<string | null>(null);
  const navigatingRef = useRef(false); // Prevent multiple simultaneous navigations
  const lastScannedBarcodeRef = useRef<string | null>(null); // Track last scanned barcode
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showScanConfirmation, setShowScanConfirmation] = useState(false);
  const flashAnimation = useRef(new Animated.Value(0)).current;

  // Check for pending save errors on focus
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const error = await AsyncStorage.getItem(PENDING_SAVE_ERROR_KEY);
          if (error) {
            setErrorSnack(error);
            await AsyncStorage.removeItem(PENDING_SAVE_ERROR_KEY);
          }
        } catch (e) {
          console.error('Error checking pending save error:', e);
        }
      })();
    }, [])
  );

  // Check for pending save errors on focus
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const error = await AsyncStorage.getItem(PENDING_SAVE_ERROR_KEY);
          if (error) {
            setErrorSnack(error);
            await AsyncStorage.removeItem(PENDING_SAVE_ERROR_KEY);
          }
        } catch (e) {
          console.error('Error checking pending save error:', e);
        }
      })();
    }, [])
  );

  const handleBarCodeScanned = useCallback(async ({ type, data }: { type: string; data: string }) => {
    const barcode = data?.trim() || '';
    
    // Prevent multiple scans and navigations - check refs first (synchronous)
    if (navigatingRef.current || isLoading) {
      return;
    }
    
    // Prevent duplicate scans of the same barcode
    if (lastScannedBarcodeRef.current === barcode) {
      return;
    }
    
    if (!barcode) {
      setSnack(t('scan.error') || 'Invalid barcode');
      return;
    }
    
    // Set refs immediately (synchronous) to prevent duplicate processing
    navigatingRef.current = true;
    lastScannedBarcodeRef.current = barcode;
    
    console.log('Barcode scanned:', barcode);
    
    // Haptic feedback on successful scan
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.log('Haptics not available:', error);
    }
    
    // Visual confirmation flash
    setShowScanConfirmation(true);
    Animated.sequence([
      Animated.timing(flashAnimation, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(flashAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowScanConfirmation(false);
    });
    
    // Update state (asynchronous, but refs already set)
    setScanned(true);
    setSnack(`${t('scan.scanned')}: ${barcode}`);
    
    // Navigate immediately without waiting for any fetches
    const params: any = { barcode };
    router.replace({ pathname: '/add', params } as any);
    
    // Run product lookup in background (non-blocking)
    (async () => {
      try {
        // Wait for owner to be ready (with timeout)
        let currentOwnerId = activeOwnerId;
        let attempts = 0;
        const maxAttempts = 15; // 15 * 200ms = 3 seconds max
        
        while (!currentOwnerId && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 200));
          attempts++;
        }
        
        if (!currentOwnerId) {
          console.warn('[Scan] No owner available for background product lookup');
          return;
        }
        
        // Lookup product by barcode in background (for cache/prefill)
        const { getProductByBarcode } = await import('@/lib/supabase/queries/products');
        await getProductByBarcode(currentOwnerId, barcode);
        // The add screen will handle using this data
      } catch (error: any) {
        console.warn('[Scan] Background product lookup failed (non-critical):', error);
        // Don't show error to user - navigation already happened
      }
    })();
    
    // Reset refs after a short delay to allow navigation
    setTimeout(() => {
      navigatingRef.current = false;
      lastScannedBarcodeRef.current = null;
    }, 1000);
  }, [isLoading, t, router, activeOwnerId]);

  const resetScan = () => {
    setScanned(false);
    setIsLoading(false);
    navigatingRef.current = false; // Reset navigation flag
    lastScannedBarcodeRef.current = null; // Reset last scanned barcode
  };

  // Check permission status and show appropriate UI
  React.useEffect(() => {
    if (permission && !permission.granted) {
      // If permission is denied but can ask again, show dialog
      if (permission.canAskAgain) {
        setShowPermissionDialog(true);
      }
      // For permanent denial, the card is shown inline (no modal needed)
    } else if (permission?.granted) {
      // Permission granted, hide any dialogs
      setShowPermissionDialog(false);
    }
  }, [permission]);

  const handleRequestPermission = async () => {
    setShowPermissionDialog(false);
    await requestPermission();
    // Permission status will be updated automatically, triggering useEffect
  };

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('Error opening settings:', error);
      setSnack(t('screens.scan.cannotOpenSettings'));
    }
  };


  if (permission === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: THEME_COLORS.primaryGradient[0] }]} edges={[]}>
        <LinearGradient
          colors={THEME_COLORS.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerOverlay, { paddingTop: Math.max(insets.top, 12) }]}
        >
          <View style={styles.headerTop}>
            <IconButton
              icon="arrow-right"
              size={24}
              onPress={() => router.back()}
              iconColor="#FFFFFF"
              style={styles.headerIcon}
            />
            <View style={styles.headerCenter}>
              <Text style={styles.headerDate}>
                {new Date().toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </View>
            <View style={styles.headerIcon} />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.headerLabel}>{t('screens.scan.title')}</Text>
          </View>
        </LinearGradient>
        <View style={styles.center}>
          <Text>{t('screens.scan.requestingPermission')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Don't show scanner if permission is not granted
  if (!permission?.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: THEME_COLORS.primaryGradient[0] }]} edges={[]}>
        <LinearGradient
          colors={THEME_COLORS.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerOverlay, { paddingTop: Math.max(insets.top, 12) }]}
        >
          <View style={styles.headerTop}>
            <IconButton
              icon="arrow-right"
              size={24}
              onPress={() => router.back()}
              iconColor="#FFFFFF"
              style={styles.headerIcon}
            />
            <View style={styles.headerCenter}>
              <Text style={styles.headerDate}>
                {new Date().toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </View>
            <View style={styles.headerIcon} />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.headerLabel}>{t('screens.scan.title')}</Text>
          </View>
        </LinearGradient>
        <View style={styles.center}>
          {!permission?.canAskAgain ? (
            // Permanent denial - show full card with instructions
            <Card style={styles.permissionCard}>
              <Card.Content>
                <MaterialCommunityIcons 
                  name="camera-off" 
                  size={64} 
                  color="#757575" 
                  style={styles.permissionCardIcon}
                />
                <Text style={[styles.permissionCardTitle, rtlText]}>
                  {t('screens.scan.permission.title')}
                </Text>
                <Text style={[styles.permissionCardSubtitle, rtlText]}>
                  {t('screens.scan.permission.message')}
                </Text>
                
                <View style={styles.instructionsContainer}>
                  {Platform.OS === 'ios' ? (
                    <>
                      <Text style={[styles.instructionsTitle, rtlText]}>
                        {t('screens.scan.permission.iosTitle')}
                      </Text>
                      <Text style={[styles.instructionsText, rtlText]}>
                        {t('screens.scan.permission.iosSteps')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.instructionsTitle, rtlText]}>
                        {t('screens.scan.permission.androidTitle')}
                      </Text>
                      <Text style={[styles.instructionsText, rtlText]}>
                        {t('screens.scan.permission.androidSteps')}
                      </Text>
                    </>
                  )}
                </View>

                <Button
                  mode="contained"
                  onPress={handleOpenSettings}
                  style={styles.settingsButton}
                  contentStyle={styles.settingsButtonContent}
                  labelStyle={styles.settingsButtonLabel}
                  icon="cog"
                >
                  {t('screens.scan.permission.openSettings')}
                </Button>

                <Button
                  mode="text"
                  onPress={() => router.back()}
                  style={styles.backButton}
                  labelStyle={styles.backButtonLabel}
                >
                  {t('common.back')}
                </Button>
              </Card.Content>
            </Card>
          ) : (
            // Temporary denial - show simple empty state (dialog will appear)
            <>
              <MaterialCommunityIcons 
                name="camera-off" 
                size={80} 
                color="#757575" 
                style={styles.permissionIcon}
              />
              <Text style={styles.permissionTitle}>{t('screens.scan.permission.noAccess')}</Text>
              <Text style={styles.permissionText}>
                {t('screens.scan.permission.noAccessMessage')}
              </Text>
            </>
          )}
        </View>

        {/* Dialog for temporary denial (can ask again) */}
        <Portal>
          <Dialog
            visible={showPermissionDialog}
            onDismiss={() => setShowPermissionDialog(false)}
            style={styles.dialog}
          >
            <Dialog.Title style={rtlText}>
              {t('screens.scan.permission.dialogTitle')}
            </Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium" style={[styles.dialogText, rtlText]}>
                {t('screens.scan.permission.dialogMessage')}
              </Text>
            </Dialog.Content>
            <Dialog.Actions style={rtlContainer}>
              <Button onPress={() => setShowPermissionDialog(false)}>
                {t('screens.scan.resetScan')}
              </Button>
              <Button mode="contained" onPress={handleRequestPermission}>
                {t('screens.scan.permission.grantAccess')}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

      </SafeAreaView>
    );
  }

  // Show viewer message instead of camera
  if (!ownerLoading && isViewer) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: THEME_COLORS.primaryGradient[0] }]} edges={[]}>
        <LinearGradient
          colors={THEME_COLORS.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerOverlay, { paddingTop: Math.max(insets.top, 12) }]}
        >
          <View style={styles.headerTop}>
            <IconButton
              icon="arrow-right"
              size={24}
              onPress={() => router.back()}
              iconColor="#FFFFFF"
              style={styles.headerIcon}
            />
            <View style={styles.headerCenter}>
              <Text style={styles.headerDate}>
                {new Date().toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </View>
            <View style={styles.headerIcon} />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.headerLabel}>{t('screens.scan.title')}</Text>
          </View>
        </LinearGradient>
        <View style={styles.center}>
          <Card style={styles.permissionCard}>
            <Card.Content>
              <MaterialCommunityIcons 
                name="eye-off" 
                size={64} 
                color="#757575" 
                style={styles.permissionCardIcon}
              />
              <Text style={[styles.permissionCardTitle, rtlText]}>
                {t('scan.viewerNotAllowed') || 'Viewers cannot add products'}
              </Text>
              <Text style={[styles.permissionCardSubtitle, rtlText]}>
                {t('scan.viewerNotAllowedDesc') || 'As a viewer, you have read-only access. You cannot scan or add products.'}
              </Text>
              <Button
                mode="contained"
                onPress={() => router.back()}
                style={styles.settingsButton}
                contentStyle={styles.settingsButtonContent}
                labelStyle={styles.settingsButtonLabel}
              >
                {t('common.back')}
              </Button>
            </Card.Content>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.scannerWrapper}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          autofocus="off"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code128',
              'code39',
              'code93',
              'codabar',
              'itf14',
            ],
          }}
        />
        {/* Soft overlay over camera */}
        <View style={styles.cameraOverlay} />
        {/* Scan frame in center */}
        <View style={styles.scanFrame} />
        {/* Visual confirmation flash */}
        {showScanConfirmation && (
          <Animated.View
            style={[
              styles.scanConfirmationFlash,
              {
                opacity: flashAnimation,
              },
            ]}
          />
        )}
        {/* Green check confirmation */}
        {showScanConfirmation && (
          <Animated.View
            style={[
              styles.scanConfirmationCheck,
              {
                opacity: flashAnimation,
              },
            ]}
          >
            <MaterialCommunityIcons name="check-circle" size={64} color="#4CAF50" />
          </Animated.View>
        )}
        {scanned && !isLoading && (
          <View style={styles.overlayActions}>
            <Button mode="contained" onPress={resetScan}>
              {t('scan.scanAgain')}
            </Button>
            <Button mode="outlined" onPress={() => router.back()} style={styles.mt8}>
              {t('common.back')}
            </Button>
          </View>
        )}
      </View>

      {/* Modern transparent header overlay */}
      <View style={[styles.headerOverlay, { paddingTop: Math.max(insets.top, 12) }]} pointerEvents="box-none">
        {/* Enhanced gradient behind header for better readability */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.55)', 'rgba(0, 0, 0, 0.00)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        
        <View style={styles.headerTop}>
          <IconButton
            icon="arrow-right"
            size={18}
            onPress={() => router.back()}
            iconColor="rgba(255, 255, 255, 0.9)"
            style={styles.modernBackButton}
          />
          <View style={styles.headerCenter}>
            <Text style={styles.headerDate}>
              {new Date().toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.headerContent}>
          <Text style={styles.modernHeaderLabel}>{t('screens.scan.title')}</Text>
          <Text style={styles.guidanceText}>{t('screens.scan.guidance')}</Text>
        </View>
      </View>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={2000}
      >
        {snack || ''}
      </Snackbar>
      <Snackbar
        visible={!!errorSnack}
        onDismiss={() => setErrorSnack(null)}
        duration={5000}
        style={{ backgroundColor: '#B00020' }}
        action={{
          label: t('common.close') || 'Close',
          onPress: () => setErrorSnack(null),
        }}
      >
        {errorSnack || ''}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  scannerWrapper: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.13)',
  },
  scanFrame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 250,
    height: 250,
    marginTop: -125, // Half of height to center vertically
    marginLeft: -125, // Half of width to center horizontally
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 20,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  modernBackButton: {
    margin: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center', // Ensure vertical centering
    opacity: 0.75, // Increased from 0.5 for better visibility
  },
  headerIcon: {
    margin: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    width: 40,
    height: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  headerDate: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
    marginBottom: 4, // Add spacing between date and title below
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerContent: {
    alignItems: 'center',
    marginTop: -16, // Raise title by ~16px
    paddingTop: 4, // Add spacing between date and title
  },
  modernHeaderLabel: {
    color: '#FFFFFF',
    fontSize: 26, // Increased by ~37% (19 * 1.37)
    fontWeight: '700', // Slightly bolder
    textShadowColor: 'rgba(0, 0, 0, 0.7)', // Enhanced shadow for better readability
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6, // Increased radius for better visibility
  },
  guidanceText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
    opacity: 0.9,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  info: {
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 16,
    color: '#212121',
  },
  button: {
    marginTop: 16,
    backgroundColor: '#42A5F5',
  },
  overlayActions: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    width: '80%',
    gap: 8,
  },
  mt8: {
    marginTop: 8,
  },
  permissionIcon: {
    marginBottom: 24,
    opacity: 0.6,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  dialogText: {
    color: '#424242',
    lineHeight: 22,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  permissionCardIcon: {
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.6,
  },
  permissionCardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionCardSubtitle: {
    fontSize: 15,
    color: '#757575',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  instructionsContainer: {
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 16,
    color: '#424242',
    lineHeight: 26,
  },
  settingsButton: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: THEME_COLORS.primary,
    marginBottom: 12,
  },
  settingsButtonContent: {
    paddingVertical: 8,
  },
  settingsButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    width: '100%',
  },
  backButtonLabel: {
    fontSize: 16,
    color: '#757575',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  scanConfirmationFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 5,
  },
  scanConfirmationCheck: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -32,
    marginLeft: -32,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

