import { useLanguage } from '@/context/LanguageContext';
import { useTime } from '@/context/TimeContext';
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
  <View style={{ ...(isRTL ? { marginLeft: 22 } : { marginRight: 22 }), justifyContent: 'center', alignItems: 'center', height: 22 }}>
    <MaterialCommunityIcons name="barcode-scan" size={20} color={color} />
  </View>
);

export default function ScannerScreen() {
  const { t, isRTL } = useLanguage();
  const { timeString, dateString } = useTime();
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
              size={24}
              onPress={() => router.push('/settings' as any)}
              iconColor="#FFFFFF"
              style={styles.headerIcon}
            />
          </View>
          <View style={styles.headerCenter}>
            <Text style={styles.headerDate}>{dateString}</Text>
            <Text style={styles.headerTime}>{timeString}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.bellWrapper}>
              <IconButton
                icon="bell-outline"
                size={24}
                onPress={async () => {
                  await markSeen();
                  router.push('/notifications-history' as any);
                }}
                iconColor="#FFFFFF"
                style={[styles.headerIcon, styles.bellIcon]}
              />
              {hasNew && <View style={styles.badgeDot} />}
            </View>
            <IconButton
              icon="folder-cog-outline"
              size={24}
              onPress={() => router.push('/categories' as any)}
              iconColor="#FFFFFF"
              style={styles.headerIcon}
            />
          </View>
        </View>
        <View style={styles.headerContent}>
          <Text style={styles.headerLabel}>{t('screens.scan.title')}</Text>
        </View>
        </LinearGradient>
      </View>

      <View style={styles.content}>
        {/* Centered main content block */}
        <View style={styles.centerBlock}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons 
              name="qrcode-scan" 
              size={105} 
              color={THEME_COLORS.primary} 
              style={styles.icon}
            />
          </View>
          <Text style={styles.description}>
            {t('scan.description')}
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
                    buttonColor="#D6E4F0"
                    textColor="#1976D2"
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
              <View style={[styles.manualButtonOuter, { marginTop: 12 }]}>
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
    paddingBottom: 10,
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 40,
    position: 'relative', // Enable absolute positioning for center
  },
  headerIcon: {
    margin: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.12)', // Subtle translucent white background (12% opacity)
    borderRadius: 14, // Rounded corners (14px)
    minWidth: 44, // Minimum hit-area of 44x44px
    minHeight: 44,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    opacity: 0.7, // Lower opacity to not pull focus
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 80,
    flexShrink: 0,
    zIndex: 1,
    paddingStart: 4, // Extra padding so icons don't touch screen edges
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0, // Behind the left/right icons
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: isRTL ? 'flex-start' : 'flex-end',
    minWidth: 80,
    flexShrink: 0,
    gap: 18, // Increased spacing between buttons (16-20px)
    zIndex: 1,
    paddingEnd: 4, // Extra padding so icons don't touch screen edges
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
  headerDate: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 2,
  },
  headerTime: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: 0,
  },
  headerLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.95,
    marginBottom: 8, // Increased spacing between title and label
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    marginTop: 0,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center', // Vertically center the content
    paddingHorizontal: 24,
    paddingTop: 30, // Move content down slightly for better centering
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 24,
    backgroundColor: 'rgba(227, 242, 253, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24, // Increased spacing for clearer hierarchy
  },
  icon: {
    opacity: 0.9,
  },
  description: {
    fontSize: 12.5,
    color: '#4A4A4A', // Darker for better contrast and readability
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 18,
    marginTop: 0,
    marginBottom: 20, // Increased spacing for clearer hierarchy
  },
  buttonWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  scanButtonOuter: {
    width: '100%',
    alignItems: 'center',
    elevation: 2, // Slightly increased elevation
    shadowColor: '#1976D2', // Soft blue shadow matching button theme
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, // Slightly increased opacity
    shadowRadius: 8, // Slightly increased radius
    maxWidth: 200, // Reduced horizontal width
  },
  scanButtonInner: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  scanButton: {
    backgroundColor: '#D6E4F0', // Slightly darker blue-gray for stronger primary action
    borderRadius: 20,
    borderWidth: 0, // No border for cleaner look
    elevation: 0, // No elevation on inner button
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    width: '100%',
  },
  scanButtonContent: {
    paddingVertical: 16, // Professional padding
    flexDirection: isRTL ? 'row-reverse' : 'row', // Reverse in RTL to put icon on far left
    alignItems: 'center',
    justifyContent: 'center', // Perfect horizontal centering
    minHeight: 56, // Professional button height
    ...(isRTL ? { paddingRight: 22, paddingLeft: 34 } : { paddingLeft: 22, paddingRight: 34 }),
  },
  scanButtonLabel: {
    fontSize: 17, // Slightly larger for prominence
    fontWeight: '700', // Strong weight for primary action
    color: '#1976D2', // Rich blue for better contrast
    marginLeft: 0,
    marginRight: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    letterSpacing: 0.2, // Subtle letter spacing
  },
  bottomContainer: {
    paddingHorizontal: 24,
    paddingTop: 24, // Move button down slightly
    backgroundColor: '#F8F9FA',
    alignItems: 'center', // Center the button horizontally
  },
  manualButtonOuter: {
    width: '100%',
    alignItems: 'center',
    elevation: 0, // No shadow for secondary action
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    maxWidth: 280, // Reduced horizontal width
  },
  manualButtonInner: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  manualButton: {
    borderRadius: 16, // Match primary button for consistency
    borderWidth: 1.5,
    borderColor: '#B3D9F2', // Light blue border for secondary action
    backgroundColor: '#FFFFFF', // White background
    width: '100%',
    marginLeft: 0,
    marginRight: 0,
    elevation: 0, // No elevation on inner button
  },
  manualButtonContent: {
    paddingVertical: 12, // Reduced height compared to primary (16px)
    minHeight: 50, // Slightly smaller than primary button (56px)
  },
  manualButtonLabel: {
    fontSize: 16, // Improved readability
    fontWeight: '600', // Strong weight for visibility
    color: '#1976D2', // Rich blue matching primary
    letterSpacing: 0.15, // Subtle letter spacing
    writingDirection: isRTL ? 'rtl' : 'ltr', // Ensure mixed Hebrew + English displays correctly
  },
  });
}

