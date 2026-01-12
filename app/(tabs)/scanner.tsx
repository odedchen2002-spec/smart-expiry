import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Snackbar, Text } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const PENDING_SAVE_ERROR_KEY = 'pending_save_error';
const PENDING_SAVE_SUCCESS_KEY = 'pending_ai_import_success';
const OFFLINE_SAVE_SUCCESS_KEY = 'offline_save_success';

// Animation constants - fast and confident
const ANIMATION = {
  PRESS_DURATION: 100,
  EASE_OUT: Easing.bezier(0.25, 0.1, 0.25, 1),
};

// ============================================================================
// ANIMATED PRIMARY CTA BUTTON
// ============================================================================

interface PrimaryCTAProps {
  label: string;
  onPress: () => void;
  isRTL: boolean;
}

function PrimaryCTA({ label, onPress, isRTL }: PrimaryCTAProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconTranslate = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.97,
        duration: ANIMATION.PRESS_DURATION,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(iconTranslate, {
        toValue: isRTL ? 2 : -2,
        duration: ANIMATION.PRESS_DURATION,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: ANIMATION.PRESS_DURATION * 1.5,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(iconTranslate, {
        toValue: 0,
        duration: ANIMATION.PRESS_DURATION * 1.5,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View
        style={[
          styles.scanButtonOuter,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={styles.scanButtonInner}>
          <View style={[styles.scanButtonContent, isRTL && styles.scanButtonContentRTL]}>
            <Animated.View style={{ transform: [{ translateX: iconTranslate }] }}>
              <MaterialCommunityIcons name="barcode-scan" size={26} color="#FFFFFF" />
            </Animated.View>
            <Text style={styles.scanButtonLabel}>{label}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ============================================================================
// ACTION LIST ROW
// ============================================================================

interface ActionRowProps {
  icon: string;
  label: string;
  onPress: () => void;
  isRTL: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

function ActionRow({ icon, label, onPress, isRTL, isFirst, isLast }: ActionRowProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.98,
        duration: ANIMATION.PRESS_DURATION,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: ANIMATION.PRESS_DURATION,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: ANIMATION.PRESS_DURATION * 1.5,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(bgOpacity, {
        toValue: 0,
        duration: ANIMATION.PRESS_DURATION * 2,
        easing: ANIMATION.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = async () => {
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View
        style={[
          styles.actionRow,
          isFirst && styles.actionRowFirst,
          isLast && styles.actionRowLast,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Press highlight background */}
        <Animated.View style={[styles.actionRowHighlight, { opacity: bgOpacity }]} />
        
        <View style={[styles.actionRowContent, isRTL && styles.actionRowContentRTL]}>
          <View style={styles.actionRowIconContainer}>
            <MaterialCommunityIcons name={icon as any} size={22} color="#6B7280" />
          </View>
          <Text style={[styles.actionRowLabel, isRTL && styles.actionRowLabelRTL]}>{label}</Text>
          <MaterialCommunityIcons 
            name={isRTL ? 'chevron-left' : 'chevron-right'} 
            size={20} 
            color="#C4C4C4" 
          />
        </View>
        
        {/* Divider */}
        {!isLast && <View style={[styles.actionRowDivider, isRTL ? styles.actionRowDividerRTL : styles.actionRowDividerLTR]} />}
      </Animated.View>
    </Pressable>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ScannerScreen() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const { hasNew, markSeen } = useNotificationBadge();
  const { isViewer } = useActiveOwner();
  const insets = useSafeAreaInsets();
  const [errorSnack, setErrorSnack] = useState<string | null>(null);
  const [successSnack, setSuccessSnack] = useState<string | null>(null);

  // Check for pending save messages on focus
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          // Check for errors
          const error = await AsyncStorage.getItem(PENDING_SAVE_ERROR_KEY);
          if (error) {
            setErrorSnack(error);
            await AsyncStorage.removeItem(PENDING_SAVE_ERROR_KEY);
          }
          
          // Check for offline save success
          const offlineSuccess = await AsyncStorage.getItem(OFFLINE_SAVE_SUCCESS_KEY);
          if (offlineSuccess) {
            setSuccessSnack(offlineSuccess);
            await AsyncStorage.removeItem(OFFLINE_SAVE_SUCCESS_KEY);
          }
          
          // Check for AI import success
          const success = await AsyncStorage.getItem(PENDING_SAVE_SUCCESS_KEY);
          if (success) {
            if (success === 'saving') {
              // Still saving - show "Items will be added" message and check again later
              setSuccessSnack(t('screens.aiImport.errors.savingInProgress'));
              // Poll for completion
              const pollForCompletion = async () => {
                for (let i = 0; i < 30; i++) { // Poll for up to 30 seconds
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const result = await AsyncStorage.getItem(PENDING_SAVE_SUCCESS_KEY);
                  if (result && result !== 'saving') {
                    await AsyncStorage.removeItem(PENDING_SAVE_SUCCESS_KEY);
                    if (result === 'all') {
                      setSuccessSnack(t('screens.aiImport.errors.saveSuccess'));
                    } else if (result.startsWith('partial:')) {
                      const [, saved, total] = result.split(':');
                      setSuccessSnack(t('screens.aiImport.errors.partialSuccess', { saved, total }));
                    } else if (result.startsWith('offline:')) {
                      const [, count] = result.split(':');
                      setSuccessSnack(t('screens.aiImport.errors.savedOffline', { count }));
                    } else if (result.startsWith('mixed:')) {
                      const [, online, offline] = result.split(':');
                      setSuccessSnack(t('screens.aiImport.errors.mixedSuccess', { online, offline }));
                    }
                    return;
                  }
                  if (!result) {
                    // Already processed or cleared
                    return;
                  }
                }
                // Timeout - clear the saving state
                await AsyncStorage.removeItem(PENDING_SAVE_SUCCESS_KEY);
              };
              pollForCompletion();
            } else {
              await AsyncStorage.removeItem(PENDING_SAVE_SUCCESS_KEY);
              if (success === 'all') {
                setSuccessSnack(t('screens.aiImport.errors.saveSuccess'));
              } else if (success.startsWith('partial:')) {
                const [, saved, total] = success.split(':');
                setSuccessSnack(t('screens.aiImport.errors.partialSuccess', { saved, total }));
              } else if (success.startsWith('offline:')) {
                const [, count] = success.split(':');
                setSuccessSnack(t('screens.aiImport.errors.savedOffline', { count }));
              } else if (success.startsWith('mixed:')) {
                const [, online, offline] = success.split(':');
                setSuccessSnack(t('screens.aiImport.errors.mixedSuccess', { online, offline }));
              }
            }
          }
        } catch (e) {
          console.error('Error checking pending save messages:', e);
        }
      })();
    }, [t])
  );

  const handleScanPress = () => {
    router.push('/fast-scan' as any);
  };

  const handleManualAdd = () => {
    router.push({ pathname: '/add', params: { noBarcode: 'true' } } as any);
  };

  const handleAiImport = () => {
    router.push('/ai-import' as any);
  };

  const handleSupplierIntake = () => {
    router.push('/supplier-intake' as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8F9FA' }]} edges={[]}>
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={THEME_COLORS.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <IconButton
                icon="cog-outline"
                size={19}
                onPress={() => router.push('/settings' as any)}
                iconColor="rgba(255, 255, 255, 0.72)"
                style={styles.headerIcon}
              />
            </View>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>{t('screens.scan.title')}</Text>
              <Text style={styles.headerSubtitle}>{t('scan.subtitle')}</Text>
            </View>
            <View style={[styles.headerRight, isRTL && styles.headerRightRTL]}>
              <View style={styles.bellWrapper}>
                <IconButton
                  icon="bell-outline"
                  size={19}
                  onPress={async () => {
                    await markSeen();
                    router.push('/notifications-history' as any);
                  }}
                  iconColor="rgba(255, 255, 255, 0.72)"
                  style={[styles.headerIcon, styles.bellIcon]}
                />
                {hasNew && <View style={styles.badgeDot} />}
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.content}>
        {/* Centered main content block */}
        <View style={styles.centerBlock}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons 
              name="qrcode-scan" 
              size={46} 
              color="#1976D2" 
              style={styles.icon}
            />
          </View>
          <Text style={styles.description}>
            {t('scan.guidanceText')}
          </Text>
          {!isViewer && (
            <PrimaryCTA
              label={t('buttons.scanProduct')}
              onPress={handleScanPress}
              isRTL={isRTL}
            />
          )}
        </View>
        
        {/* Bottom action list */}
        {!isViewer && (
          <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 12) + 110 }]}>
            <View style={styles.actionListContainer}>
              <ActionRow
                icon="plus-circle-outline"
                label={t('buttons.addWithoutBarcode')}
                onPress={handleManualAdd}
                isRTL={isRTL}
                isFirst
              />
              <ActionRow
                icon="table-arrow-up"
                label={t('buttons.importTableAI')}
                onPress={handleAiImport}
                isRTL={isRTL}
              />
              <ActionRow
                icon="truck-delivery"
                label={t('buttons.supplierIntake')}
                onPress={handleSupplierIntake}
                isRTL={isRTL}
                isLast
              />
            </View>
          </View>
        )}
      </View>
      <Snackbar
        visible={!!errorSnack}
        onDismiss={() => setErrorSnack(null)}
        duration={5000}
        style={{ backgroundColor: '#B00020', marginBottom: 80 }}
        action={{
          label: t('common.close') || 'Close',
          onPress: () => setErrorSnack(null),
        }}
      >
        {errorSnack || ''}
      </Snackbar>
      <Snackbar
        visible={!!successSnack}
        onDismiss={() => setSuccessSnack(null)}
        duration={4000}
        style={{ backgroundColor: '#43A047', marginBottom: 80 }}
        action={{
          label: t('common.close') || 'Close',
          onPress: () => setSuccessSnack(null),
        }}
      >
        {successSnack || ''}
      </Snackbar>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrapper: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    position: 'relative',
  },
  headerIcon: {
    margin: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    minWidth: 40,
    minHeight: 40,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 50,
    flexShrink: 0,
    zIndex: 1,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    paddingHorizontal: 60,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 50,
    flexShrink: 0,
    gap: 8,
    zIndex: 1,
  },
  headerRightRTL: {
    justifyContent: 'flex-start',
  },
  bellIcon: {
    marginStart: 0,
  },
  bellWrapper: {
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    marginTop: 0,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(25, 118, 210, 0.07)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    opacity: 0.75,
  },
  description: {
    fontSize: 13,
    color: '#5C6570',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 18,
    marginTop: 0,
    marginBottom: 30,
    fontWeight: '500',
  },

  // Primary CTA Button
  scanButtonOuter: {
    width: 220,
    alignItems: 'center',
    shadowColor: '#3A7AB8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  scanButtonInner: {
    width: '100%',
    backgroundColor: '#4A90D9',
    borderRadius: 18,
    overflow: 'hidden',
  },
  scanButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 14,
  },
  scanButtonContentRTL: {
    flexDirection: 'row-reverse',
  },
  scanButtonLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Bottom Container
  bottomContainer: {
    paddingHorizontal: 24,
    paddingTop: 32,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    width: '100%',
  },

  // Action List
  actionListContainer: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  actionRow: {
    position: 'relative',
    overflow: 'hidden',
  },
  actionRowFirst: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  actionRowLast: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  actionRowHighlight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  actionRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  actionRowContentRTL: {
    flexDirection: 'row-reverse',
  },
  actionRowIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
    letterSpacing: 0.1,
  },
  actionRowLabelRTL: {
    textAlign: 'right',
  },
  actionRowDivider: {
    position: 'absolute',
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  actionRowDividerLTR: {
    left: 64,
    right: 16,
  },
  actionRowDividerRTL: {
    left: 16,
    right: 64,
  },
});
