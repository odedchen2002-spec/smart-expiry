/**
 * Subscription / Paywall Screen
 * Allows users to choose and upgrade to Pro plan
 */

import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { SUBSCRIPTION_PLANS, type SubscriptionTier } from '@/lib/billing';
import { getSubscriptionStatus, type SubscriptionStatus } from '@/lib/subscription';
import { mockDevUpgradeToPro } from '@/lib/subscription/mockDevUpgrade';
import { isDevEnv } from '@/lib/utils/devEnv';
import { logSubscription } from '@/lib/logging/subscriptionLogger';
import { useProfile } from '@/lib/hooks/useProfile';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withDelay } from 'react-native-reanimated';
import { ActivityIndicator, Alert, AppState, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Divider,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SubscribeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { refetch: refetchProfile } = useProfile(); // Get profile refetch function
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const theme = useTheme();
  const params = useLocalSearchParams<{ plan?: string }>();
  const preselectedPlan = params?.plan as SubscriptionTier | undefined;

  const [loading, setLoading] = useState(true);
  const [iapProcessing, setIapProcessing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionStatus | null>(null);
  const [highlightedPlan, setHighlightedPlan] = useState<SubscriptionTier | undefined>(preselectedPlan);
  
  // Crown animation
  const crownScale = useSharedValue(1);
  const crownAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: crownScale.value }],
  }));

  useEffect(() => {
    loadCurrentSubscription();
    if (preselectedPlan) {
      setHighlightedPlan(preselectedPlan);
    }
  }, [user?.id, preselectedPlan]);

  // Crown animation on mount
  useEffect(() => {
    crownScale.value = withDelay(
      500,
      withSequence(
        withTiming(1.05, { duration: 300 }),
        withTiming(1, { duration: 300 })
      )
    );
  }, []);

  // Refresh subscription when screen comes into focus (e.g., after returning from Stripe checkout)
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) {
        loadCurrentSubscription();
      }
    }, [user?.id])
  );

  // Also refresh when app comes to foreground (user might return from Stripe checkout)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && user?.id) {
        // Refresh subscription status when app becomes active
        loadCurrentSubscription();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user?.id]);

  const loadCurrentSubscription = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const status = await getSubscriptionStatus(user.id);
      setCurrentSubscription(status);
      logSubscription('[Paywall] Subscription status loaded:', {
        tier: status?.subscription_tier,
        validUntil: status?.subscription_valid_until,
        autoRenew: status?.auto_renew,
      });
    } catch (error) {
      console.error('[Paywall] Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchasePro = async () => {
    if (!user?.id) {
      setSnack(t('subscription.subscribe.loginRequired'));
      return;
    }

    const devEnv = isDevEnv();
    logSubscription('[Paywall] Upgrade button pressed, isDevEnv =', devEnv);

    // DEV-ONLY: Mock upgrade flow
    if (devEnv) {
      logSubscription('[Subscription] DEV BUILD: mocking Pro upgrade');
      
      try {
        setIapProcessing(true);
        
        // 1) Call mock upgrade function that sets subscription tier to "pro"
        await mockDevUpgradeToPro(user.id);
        
        // 2) Refetch profile to update subscription state
        // This triggers useSubscription to recalculate, which will unlock items
        await refetchProfile();
        
        // 3) Reload subscription status
        await loadCurrentSubscription();
        
        // 4) Show dev-only alert
        Alert.alert('Dev mode', 'You are now on Pro (mock upgrade).');
        
        setSnack('DEV: Mock Pro upgrade successful');
      } catch (error: any) {
        console.error('[Subscription] DEV mock upgrade failed:', error);
        Alert.alert('Dev mode', 'Mock upgrade failed, check logs.');
        setSnack('DEV: Mock upgrade failed');
      } finally {
        setIapProcessing(false);
      }
      
      return;
    }

    // --- PRODUCTION / REAL FLOW ---
    // Note: IAP functionality has been removed. Use Stripe billing instead.
    setSnack(t('subscription.subscribe.purchaseError'));
  };

  const handleRestore = async () => {
    // Note: IAP restore functionality has been removed. Use Stripe billing instead.
    setSnack(t('subscription.subscribe.restoreError'));
  };

  const getCurrentTier = (): SubscriptionTier => {
    if (!currentSubscription) return 'free';
    // Always trust Supabase data, not local state
    const tier = currentSubscription.subscription_tier;
    // Check if subscription is expired - if so, treat as free
    if (tier !== 'free' && currentSubscription.subscription_valid_until) {
      const validUntil = new Date(currentSubscription.subscription_valid_until);
      const now = new Date();
      if (validUntil < now) {
        return 'free';
      }
    }
    return tier;
  };

  const currentTier = getCurrentTier();
  // Only show "current plan" badge if Supabase confirms it's active
  const isCurrentPlan = (tier: SubscriptionTier) => {
    const effectiveTier = getCurrentTier();
    return effectiveTier === tier;
  };



  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.container}>
          <Appbar.Header style={styles.header}>
            <Appbar.BackAction onPress={() => router.back()} />
            <Appbar.Content title={t('subscription.subscribe.title')} />
          </Appbar.Header>
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <View style={styles.container}>
        <Appbar.Header style={styles.header}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title={t('subscription.subscribe.manageTitle')} />
        </Appbar.Header>

        {/* Header Section - Fixed at top */}
        <View style={styles.headerSection}>
          <Text variant="headlineMedium" style={[styles.title, rtlText]}>
            {t('subscription.subscribe.headerTitle')}
          </Text>
          <Text variant="bodyMedium" style={[styles.marketingSubtitle, rtlText]}>
            {t('subscription.subscribe.marketingSubtitle')}
          </Text>
        </View>

        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
        >

        {/* Plans Grid */}
        <View style={styles.plansContainer}>
          {/* Pro Plan - Featured */}
          <Card 
            style={[
              styles.planCard,
              styles.proCard,
              styles.featuredCard,
              (highlightedPlan === 'pro' || isCurrentPlan('pro')) && styles.featuredCard,
              isCurrentPlan('pro') && styles.currentPlanCard,
            ]}
            elevation={0}
          >
            {highlightedPlan === 'pro' && !isCurrentPlan('pro') && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>{t('subscription.subscribe.recommended')}</Text>
              </View>
            )}
            <View style={styles.cardContentWrapper}>
              <Card.Content style={styles.cardContent}>
              {isCurrentPlan('pro') && (
                <View style={styles.badgeContainer}>
                  <View style={styles.badge}>
                    <MaterialCommunityIcons name="check-circle" size={14} color="#FFFFFF" />
                    <Text style={styles.badgeText}>{t('subscription.subscribe.currentPlan')}</Text>
                  </View>
                </View>
              )}

              <View style={styles.planIconContainer}>
                <Animated.View style={crownAnimatedStyle}>
                  <View style={styles.crownGlow}>
                    <LinearGradient
                      colors={['#FF6B35', '#F7931E']}
                      style={styles.iconCircle}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <MaterialCommunityIcons name="crown" size={28} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                </Animated.View>
              </View>

              <Text variant="titleMedium" style={[styles.planTitle, styles.proTitle, rtlText]}>
                {t('settings.subscriptionLabel.pro')}
              </Text>

              <View style={styles.priceContainer}>
                <Text variant="headlineSmall" style={[styles.priceAmount, styles.proPrice, rtlText]}>
                  {SUBSCRIPTION_PLANS.pro.priceMonthly}
                </Text>
                <Text variant="bodySmall" style={[styles.priceUnit, rtlText]}>
                  {t('subscription.subscribe.pricePerMonth')}
                </Text>
              </View>
              <Divider style={styles.divider} />

              <View style={styles.featuresList}>
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons name="check" size={18} color="#FF6B35" />
                  <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                    {t('subscription.subscribe.featureUnlimited')}
                  </Text>
                </View>
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons name="check" size={18} color="#FF6B35" />
                  <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                    {t('subscription.subscribe.featureAll')}
                  </Text>
                </View>
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons name="check" size={18} color="#FF6B35" />
                  <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                    {t('subscription.subscribe.featureBackup')}
                  </Text>
                </View>
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons name="check" size={18} color="#FF6B35" />
                  <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                    {t('subscription.subscribe.featureAITables')}
                  </Text>
                </View>
              </View>

              {!isCurrentPlan('pro') ? (
                <LinearGradient
                  colors={['#FF7A3D', '#FF5A24']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.upgradeButtonGradient}
                >
                  <Button
                    mode="contained"
                    onPress={handlePurchasePro}
                    loading={iapProcessing}
                    disabled={iapProcessing || restoring}
                    style={[styles.upgradeButton, styles.proButton]}
                    contentStyle={styles.upgradeButtonContent}
                    labelStyle={styles.upgradeButtonLabel}
                    buttonColor="transparent"
                  >
                    {t('subscription.subscribe.upgradeButtonText')}
                  </Button>
                </LinearGradient>
              ) : (
                <Button
                  mode="contained"
                  disabled
                  style={[styles.upgradeButton, styles.proButton]}
                  contentStyle={styles.upgradeButtonContent}
                  labelStyle={styles.upgradeButtonLabel}
                  buttonColor="#BDBDBD"
                >
                  {t('subscription.subscribe.active')}
                </Button>
              )}

              {isCurrentPlan('pro') && (
                <Text style={[styles.cancellationNote, rtlText]}>
                  {t('subscription.subscribe.cancellationNote', { store: Platform.OS === 'ios' ? 'App Store' : 'Google Play' })}
                </Text>
              )}
              </Card.Content>
            </View>
          </Card>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={[styles.disclaimerCard, rtlContainer]}>
            <MaterialCommunityIcons name="shield-check" size={20} color="#757575" />
            <Text variant="bodySmall" style={[styles.disclaimer, rtlText]}>
              {t('subscription.subscribe.disclaimer', { store: Platform.OS === 'ios' ? 'Apple App Store' : 'Google Play' })}
            </Text>
          </View>
          <Button
            mode="text"
            onPress={handleRestore}
            loading={restoring}
            disabled={restoring || iapProcessing}
            style={styles.restoreButton}
          >
            {t('subscription.subscribe.restore')}
          </Button>
        </View>
        </ScrollView>

        <Snackbar
          visible={!!snack}
          onDismiss={() => setSnack(null)}
          duration={3000}
        >
          {snack}
        </Snackbar>
      </View>
    </SafeAreaView>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 0,
    marginTop: 0,
    elevation: 0,
    backgroundColor: '#F5F7FA',
  },
  content: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  contentContainer: {
    paddingBottom: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSection: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 20,
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    color: '#1A1A1A',
    letterSpacing: 0.15,
  },
  subtitle: {
    textAlign: 'center',
    color: '#757575',
    lineHeight: 22,
  },
  marketingSubtitle: {
    textAlign: 'center',
    color: '#424242',
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 2,
    fontSize: 15,
  },
  cancelAnytime: {
    textAlign: 'center',
    color: '#757575',
    fontSize: 13,
    marginTop: 2,
  },
  comparisonSection: {
    backgroundColor: 'rgba(245, 245, 245, 0.95)',
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 12,
  },
  comparisonTitle: {
    fontWeight: '600',
    color: '#333333',
    marginBottom: 10,
    textAlign: isRTL ? 'right' : 'left',
  },
  comparisonList: {
    gap: 8,
  },
  comparisonItem: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: isRTL ? 6 : 10,
  },
  comparisonText: {
    flex: 1,
    color: '#616161',
    fontSize: 13,
    lineHeight: 18,
  },
  plansContainer: {
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 0,
  },
  planCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 0,
    position: 'relative',
    overflow: 'visible',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  featuredCard: {
    borderWidth: 2,
    borderColor: '#FF6B35',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  proCard: {
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  currentPlanCard: {
    borderWidth: 2,
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F4',
  },
  cardContentWrapper: {
    overflow: 'hidden',
    borderRadius: 12,
    position: 'relative',
  },
  cardContent: {
    padding: 12,
    paddingTop: 12,
  },
  badgeContainer: {
    position: 'absolute',
    top: 12,
    ...(isRTL ? { left: 12 } : { right: 12 }),
    zIndex: 1,
  },
  badge: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF6B35',
    paddingVertical: 6,
    alignItems: 'center',
    zIndex: 1,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  planIconContainer: {
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 0,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  planTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: '#1A1A1A',
    fontSize: 20,
  },
  featuredTitle: {
    color: '#42A5F5',
  },
  proTitle: {
    color: '#FF7A3D',
    fontWeight: '600',
    fontSize: 21,
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 4,
    marginTop: 8,
    gap: 6,
  },
  priceAmount: {
    fontWeight: '700',
    color: '#1A1A1A',
    fontSize: 36,
    lineHeight: 42,
  },
  featuredPrice: {
    color: '#42A5F5',
  },
  proPrice: {
    color: '#FF6B35',
  },
  priceUnit: {
    color: '#7A7A7A',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  priceComparison: {
    textAlign: 'center',
    color: '#7A7A7A',
    fontSize: 13,
    marginTop: -9,
    fontWeight: '400',
    opacity: 0.68,
    lineHeight: 21,
  },
  divider: {
    marginVertical: 16,
    backgroundColor: '#E0E0E0',
  },
  featuresList: {
    gap: 8,
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: isRTL ? 6 : 10,
  },
  featureText: {
    flex: 1,
    color: '#424242',
    fontSize: 14,
    lineHeight: 20,
  },
  upgradeButtonGradient: {
    borderRadius: 10,
    marginTop: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  upgradeButton: {
    borderRadius: 10,
    marginTop: 0,
  },
  proButton: {
    // Shadow handled by gradient wrapper
  },
  upgradeButtonContent: {
    paddingVertical: 16,
    minHeight: 56,
  },
  upgradeButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  crownGlow: {
    ...Platform.select({
      ios: {
        shadowColor: '#FF6B35',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cancellationNote: {
    marginTop: 12,
    color: '#616161',
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
  },
  disclaimerCard: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  disclaimer: {
    flex: 1,
    color: '#616161',
    lineHeight: 20,
    fontSize: 13,
  },
  restoreButton: {
    marginTop: 12,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
  },
  dialogText: {
    color: '#424242',
    lineHeight: 22,
  },
  });
}

