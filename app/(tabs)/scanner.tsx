import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Snackbar, Text } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_SAVE_ERROR_KEY = 'pending_save_error';

// Custom icon component for primary button with controlled size and spacing
const ScanButtonIcon = ({ color, isRTL }: { color: string; isRTL: boolean }) => (
  <View style={{ ...(isRTL ? { marginLeft: 18 } : { marginRight: 18 }), justifyContent: 'center', alignItems: 'center', height: 28 }}>
    <MaterialCommunityIcons name="barcode-scan" size={26} color={color} />
  </View>
);

export default function ScannerScreen() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const styles = createStyles(isRTL);
  const { hasNew, markSeen } = useNotificationBadge();
  const { isViewer } = useActiveOwner();
  const insets = useSafeAreaInsets();
  const [errorSnack, setErrorSnack] = useState<string | null>(null);

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

  const handleScanPress = () => {
    router.push('/scan' as any);
  };

  const handleManualAdd = () => {
    router.push({ pathname: '/add', params: { noBarcode: 'true' } } as any);
  };

  const handleAiImport = () => {
    router.push('/ai-import' as any);
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
            <View style={styles.headerRight}>
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
              <IconButton
                icon="folder-cog-outline"
                size={19}
                onPress={() => router.push('/categories' as any)}
                iconColor="rgba(255, 255, 255, 0.72)"
                style={styles.headerIcon}
              />
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
            <View style={styles.buttonWrapper}>
              <View style={styles.scanButtonOuter}>
                <View style={styles.scanButtonInner}>
                  <Button
                    mode="contained"
                    onPress={handleScanPress}
                    style={styles.scanButton}
                    contentStyle={styles.scanButtonContent}
                    labelStyle={styles.scanButtonLabel}
                    icon={({ color }) => <ScanButtonIcon color={color} isRTL={isRTL} />}
                    iconPosition={isRTL ? 'right' : 'left'}
                    buttonColor="#4A90D9"
                    textColor="#FFFFFF"
                  >
                    {t('buttons.scanProduct')}
                  </Button>
                </View>
              </View>
            </View>
          )}
        </View>
        
        {/* Bottom buttons */}
        {!isViewer && (
          <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 12) + 110 }]}>
            <View style={styles.buttonWrapper}>
              <View style={styles.manualButtonOuter}>
                <View style={styles.manualButtonInner}>
                  <Button
                    mode="outlined"
                    onPress={handleManualAdd}
                    style={styles.manualButton}
                    contentStyle={styles.manualButtonContent}
                    labelStyle={styles.manualButtonLabel}
                    icon="plus-circle-outline"
                  >
                    {t('buttons.addWithoutBarcode')}
                  </Button>
                </View>
              </View>
              <View style={[styles.manualButtonOuter, { marginTop: 10 }]}>
                <View style={styles.manualButtonInner}>
                  <Button
                    mode="outlined"
                    onPress={handleAiImport}
                    style={styles.manualButton}
                    contentStyle={styles.manualButtonContent}
                    labelStyle={styles.manualButtonLabel}
                    icon="table-arrow-up"
                  >
                    {t('buttons.importTableAI')}
                  </Button>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>
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

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrapper: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, // Soft bottom shadow
    shadowOpacity: 0.08, // Very gentle shadow strength
    shadowRadius: 14, // Soft blur for polished separation
    elevation: 4, // Reduced for subtlety
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
    justifyContent: isRTL ? 'flex-start' : 'flex-end',
    minWidth: 50,
    flexShrink: 0,
    gap: 8,
    zIndex: 1,
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
  headerContent: {
    alignItems: 'center',
    paddingTop: 0,
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
    paddingTop: 80,
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
  buttonWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  scanButtonOuter: {
    width: '100%',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#3A7AB8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    maxWidth: 220,
  },
  scanButtonInner: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  scanButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 18,
    borderWidth: 0,
    elevation: 0,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    width: '100%',
  },
  scanButtonContent: {
    paddingVertical: 14,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
    ...(isRTL ? { paddingRight: 24, paddingLeft: 32 } : { paddingLeft: 24, paddingRight: 32 }),
  },
  scanButtonLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 0,
    marginRight: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    letterSpacing: 0.3,
  },
  bottomContainer: {
    paddingHorizontal: 24,
    paddingTop: 48,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    width: '100%',
  },
  manualButtonOuter: {
    width: 240,
    alignItems: 'center',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  manualButtonInner: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  manualButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    width: '100%',
    marginLeft: 0,
    marginRight: 0,
    elevation: 0,
  },
  manualButtonContent: {
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  manualButtonLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    letterSpacing: 0.1,
    writingDirection: isRTL ? 'rtl' : 'ltr',
  },
  });
}

