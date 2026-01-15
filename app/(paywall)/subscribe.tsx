/**
 * Subscription / Paywall Screen
 * Allows users to choose between Pro and Pro+ plans
 * 
 * Pro (29₪): For small businesses - 20 AI pages/month, 2000 products
 * Pro+ (59₪): For high-volume businesses - fair use limits
 */

import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { SUBSCRIPTION_PLANS, type SubscriptionTier } from '@/lib/billing';
import { getSubscriptionStatus, type SubscriptionStatus } from '@/lib/subscription';
import { mockDevUpgradeToPro } from '@/lib/subscription/mockDevUpgrade';
import { isDevEnv } from '@/lib/utils/devEnv';
import { logSubscription } from '@/lib/logging/subscriptionLogger';
import { useProfile } from '@/lib/hooks/useProfile';
import { useIAP } from '@/lib/hooks/useIAP';
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

type PlanType = 'pro' | 'pro_plus';

export default function SubscribeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { refetch: refetchProfile } = useProfile();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const theme = useTheme();
  const params = useLocalSearchParams<{ plan?: string }>();
  const preselectedPlan = params?.plan as PlanType | undefined;

  const [loading, setLoading] = useState(true);
  const [iapProcessing, setIapProcessing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionStatus | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(preselectedPlan || 'pro_plus');
  
  const { 
    proPriceString, 
    proPlusPriceString,
    purchasePro: iapPurchasePro,
    purchaseProPlus: iapPurchaseProPlus,
    restore: iapRestore,
    isReady: isIAPReady,
    isLoading: isIAPLoading,
    isPurchasing,
    isRestoring: isIAPRestoring,
    error: iapError,
    retry: retryIAP,
  } = useIAP();
  
  // Animation
  const crownScale = useSharedValue(1);
  const crownAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: crownScale.value }],
  }));

  useEffect(() => {
    loadCurrentSubscription();
    if (preselectedPlan) {
      setSelectedPlan(preselectedPlan);
    }
  }, [user?.id, preselectedPlan]);

  useEffect(() => {
    crownScale.value = withDelay(
      500,
      withSequence(
        withTiming(1.05, { duration: 300 }),
        withTiming(1, { duration: 300 })
      )
    );
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) {
        loadCurrentSubscription();
      }
    }, [user?.id])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && user?.id) {
        loadCurrentSubscription();
      }
    });
    return () => subscription.remove();
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
    } catch (error) {
      console.error('[Paywall] Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (plan: PlanType) => {
    if (!user?.id) {
      setSnack(t('subscription.subscribe.loginRequired'));
      return;
    }

    // Check if user is downgrading from Pro+ to Pro
    const currentTier = getCurrentTier();
    if (currentTier === 'pro_plus' && plan === 'pro') {
      // Show confirmation dialog
      Alert.alert(
        t('subscription.subscribe.downgradeDialog.title'),
        t('subscription.subscribe.downgradeDialog.message') + '\n' +
        t('subscription.subscribe.downgradeDialog.limit1') + '\n' +
        t('subscription.subscribe.downgradeDialog.limit2') +
        t('subscription.subscribe.downgradeDialog.whenChange') + '\n' +
        t('subscription.subscribe.downgradeDialog.untilThen'),
        [
          {
            text: t('subscription.subscribe.downgradeDialog.cancel'),
            style: 'cancel',
            onPress: () => {
              logSubscription('[Paywall] User cancelled downgrade from Pro+ to Pro');
            }
          },
          {
            text: t('subscription.subscribe.downgradeDialog.continue'),
            onPress: () => {
              logSubscription('[Paywall] User confirmed downgrade from Pro+ to Pro');
              proceedWithPurchase(plan);
            }
          }
        ],
        { cancelable: true }
      );
      return;
    }

    // Proceed with purchase normally
    await proceedWithPurchase(plan);
  };

  const proceedWithPurchase = async (plan: PlanType) => {
    if (!user?.id) return;

    const devEnv = isDevEnv();
    logSubscription('[Paywall] Purchase button pressed', { plan, isDevEnv: devEnv });

    // DEV-ONLY: Mock upgrade flow
    if (devEnv) {
      try {
        setIapProcessing(true);
        await mockDevUpgradeToPro(user.id!, plan);
        await refetchProfile();
        await loadCurrentSubscription();
        Alert.alert('Dev mode', `You are now on ${plan === 'pro' ? 'Pro' : 'Pro+'} (mock upgrade).`);
        setSnack(`DEV: Mock ${plan} upgrade successful`);
      } catch (error: any) {
        console.error('[Subscription] DEV mock upgrade failed:', error);
        Alert.alert('Dev mode', 'Mock upgrade failed, check logs.');
        setSnack('DEV: Mock upgrade failed');
      } finally {
        setIapProcessing(false);
      }
      return;
    }

    // PRODUCTION: Real IAP flow
    try {
      setIapProcessing(true);
      const purchaseFn = plan === 'pro' ? iapPurchasePro : iapPurchaseProPlus;
      const result = await purchaseFn();
      
      if (result.success) {
        logSubscription('[Paywall] IAP purchase initiated');
      } else if (result.error === 'user_cancelled') {
        logSubscription('[Paywall] User cancelled purchase');
      } else {
        setSnack(t('subscription.subscribe.purchaseError'));
        logSubscription('[Paywall] IAP purchase failed:', result.error);
      }
    } catch (error: any) {
      console.error('[Paywall] IAP purchase error:', error);
      setSnack(t('subscription.subscribe.purchaseError'));
    } finally {
      setIapProcessing(false);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const result = await iapRestore();
      if (result.success) {
        if (result.restored) {
          await refetchProfile();
          await loadCurrentSubscription();
          setSnack(t('subscription.subscribe.restoreSuccess'));
        } else {
          setSnack(t('subscription.subscribe.noPurchasesToRestore'));
        }
      } else {
        setSnack(t('subscription.subscribe.restoreError'));
      }
    } catch (error: any) {
      console.error('[Paywall] Restore error:', error);
      setSnack(t('subscription.subscribe.restoreError'));
    } finally {
      setRestoring(false);
    }
  };

  const getCurrentTier = (): SubscriptionTier => {
    if (!currentSubscription) return 'free';
    const tier = currentSubscription.subscription_tier;
    if (tier !== 'free' && currentSubscription.subscription_valid_until) {
      const validUntil = new Date(currentSubscription.subscription_valid_until);
      if (validUntil < new Date()) return 'free';
    }
    return tier;
  };

  const currentTier = getCurrentTier();
  const isCurrentPlan = (tier: SubscriptionTier) => getCurrentTier() === tier;

  const renderPriceSection = (plan: PlanType) => {
    const priceString = plan === 'pro' ? proPriceString : proPlusPriceString;
    const fallbackPrice = plan === 'pro' ? SUBSCRIPTION_PLANS.pro.priceMonthly : SUBSCRIPTION_PLANS.pro_plus.priceMonthly;
    const accentColor = plan === 'pro' ? '#007AFF' : '#6d28d9';

    // Loading state
    if (isIAPLoading && !priceString) {
      return (
        <View style={styles.priceLoadingContainer}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text variant="bodySmall" style={[styles.priceLoadingText, rtlText]}>
            {t('subscription.subscribe.loadingPriceFriendly')}
          </Text>
        </View>
      );
    }

    // Error state - friendly message for dev
    if (iapError && !priceString && !isIAPLoading) {
      return (
        <View style={styles.priceErrorContainer}>
          <Text variant="bodySmall" style={[styles.priceFallbackText, rtlText]}>
            {t('subscription.subscribe.priceWillShowInStore')}
          </Text>
        </View>
      );
    }

    // Price loaded or fallback
    return (
      <>
        <Text variant="headlineSmall" style={[styles.priceAmount, { color: accentColor }, rtlText]}>
          {priceString || `₪${fallbackPrice}`}
        </Text>
        <Text variant="bodySmall" style={[styles.priceUnit, rtlText]}>
          {t('subscription.subscribe.pricePerMonth')}
        </Text>
      </>
    );
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.plansContainer}>
            {/* CARD 1: Pro Plan (Top - Most Recommended) */}
            <Card 
              style={[
                styles.planCard,
                styles.proCard,
                selectedPlan === 'pro' && styles.selectedCard,
                selectedPlan === 'pro' && styles.selectedCardPro,
                isCurrentPlan('pro') && styles.currentPlanCard,
              ]}
              onPress={() => !isCurrentPlan('pro') && setSelectedPlan('pro')}
            >
              {/* Top Border */}
              <View style={styles.proTopBorder} />
              
              {/* Badge */}
              {!isCurrentPlan('pro') && (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedBadgeText}>מומלץ</Text>
                </View>
              )}

              <View style={styles.cardContentWrapper}>
                <Card.Content style={styles.cardContent}>
                  {isCurrentPlan('pro') && (
                    <View style={[styles.currentBadge, { backgroundColor: '#007AFF' }]}>
                      <MaterialCommunityIcons name="check-circle" size={14} color="#FFFFFF" />
                      <Text style={styles.currentBadgeText}>{t('subscription.subscribe.currentPlan')}</Text>
                    </View>
                  )}

                  <View style={styles.planHeader}>
                    <View style={[styles.iconCircle, { backgroundColor: '#E6F0FF' }]}>
                      <MaterialCommunityIcons name="store" size={28} color="#007AFF" />
                    </View>
                    <View style={styles.planTitleContainer}>
                      <Text variant="titleLarge" style={[styles.planTitle, { color: '#007AFF' }, rtlText]}>
                        Pro
                      </Text>
                      <Text variant="bodySmall" style={[styles.planSubtitle, rtlText]}>
                        התוכנית הסטנדרטית
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.priceContainer, rtlContainer]}>
                    {renderPriceSection('pro')}
                  </View>

                  <Divider style={styles.divider} />

                  <View style={styles.featuresList}>
                    <View style={[styles.featureItem, rtlContainer]}>
                      <MaterialCommunityIcons name="check" size={18} color="#007AFF" />
                      <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                        עד 50 תעודות משלוח בחודש
                      </Text>
                    </View>
                    <View style={[styles.featureItem, rtlContainer]}>
                      <MaterialCommunityIcons name="check" size={18} color="#007AFF" />
                      <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                        עד 2,000 מוצרים
                      </Text>
                    </View>
                    <View style={[styles.featureItem, rtlContainer]}>
                      <MaterialCommunityIcons name="check" size={18} color="#007AFF" />
                      <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                        כל התכונות כלולות
                      </Text>
                    </View>
                    <View style={[styles.featureItem, rtlContainer]}>
                      <MaterialCommunityIcons name="check" size={18} color="#007AFF" />
                      <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                        גיבויים אוטומטיים
                      </Text>
                    </View>
                  </View>

                  {!isCurrentPlan('pro') && (
                    <Button
                      mode="contained"
                      onPress={() => handlePurchase('pro')}
                      loading={iapProcessing || isPurchasing}
                      disabled={iapProcessing || isPurchasing || restoring || isIAPRestoring}
                      style={styles.upgradeButton}
                      buttonColor="#007AFF"
                      labelStyle={styles.upgradeButtonLabel}
                    >
                      {isCurrentPlan('pro_plus') 
                        ? 'עבור ל-Pro'
                        : 'שדרג ל-Pro'}
                    </Button>
                  )}
                </Card.Content>
              </View>
            </Card>

            {/* CARD 2: Pro+ Plan (Middle - Best Value) */}
            <Card 
              style={[
                styles.planCard,
                styles.proPlusCard,
                selectedPlan === 'pro_plus' && styles.selectedCard,
                selectedPlan === 'pro_plus' && styles.selectedCardProPlus,
                isCurrentPlan('pro_plus') && styles.currentPlanCard,
              ]}
              onPress={() => !isCurrentPlan('pro_plus') && setSelectedPlan('pro_plus')}
            >
              {/* Gold Badge */}
              {!isCurrentPlan('pro_plus') && (
                <View style={styles.bestValueBadge}>
                  <MaterialCommunityIcons name="star" size={14} color="#FFFFFF" />
                  <Text style={styles.bestValueBadgeText}>הכי פופולרי</Text>
                </View>
              )}

              <View style={styles.cardContentWrapper}>
                <Card.Content style={[styles.cardContent, !isCurrentPlan('pro_plus') && { paddingTop: 32 }]}>
                  {isCurrentPlan('pro_plus') && (
                    <View style={[styles.currentBadge, { backgroundColor: '#6d28d9' }]}>
                      <MaterialCommunityIcons name="check-circle" size={14} color="#FFFFFF" />
                      <Text style={styles.currentBadgeText}>{t('subscription.subscribe.currentPlan')}</Text>
                    </View>
                  )}

                  <View style={styles.planHeader}>
                    <Animated.View style={crownAnimatedStyle}>
                      <View style={[styles.iconCircle, { backgroundColor: '#F3E8FF' }]}>
                        <MaterialCommunityIcons name="crown" size={28} color="#6d28d9" />
                      </View>
                    </Animated.View>
                    <View style={styles.planTitleContainer}>
                      <Text variant="titleLarge" style={[styles.planTitle, { color: '#6d28d9' }, rtlText]}>
                        Pro+
                      </Text>
                      <Text variant="bodySmall" style={[styles.planSubtitle, rtlText]}>
                        לעסקים בנפח גבוה
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.priceContainer, rtlContainer]}>
                    {renderPriceSection('pro_plus')}
                  </View>

                  <Divider style={styles.divider} />

                  <View style={styles.featuresList}>
                    <View style={[styles.featureItem, rtlContainer]}>
                      <MaterialCommunityIcons name="check" size={18} color="#6d28d9" />
                      <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                        תעודות משלוח ללא הגבלה
                      </Text>
                    </View>
                    <View style={[styles.featureItem, rtlContainer]}>
                      <MaterialCommunityIcons name="check" size={18} color="#6d28d9" />
                      <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                        הוספת מוצרים ללא הגבלה
                      </Text>
                    </View>
                    <View style={[styles.featureItem, rtlContainer]}>
                      <MaterialCommunityIcons name="check" size={18} color="#6d28d9" />
                      <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                        מתאים למינימרקטים וסופרמרקטים
                      </Text>
                    </View>
                    <View style={[styles.featureItem, rtlContainer]}>
                      <MaterialCommunityIcons name="check" size={18} color="#6d28d9" />
                      <Text variant="bodySmall" style={[styles.featureText, rtlText]}>
                        כל התכונות כלולות
                      </Text>
                    </View>
                  </View>

                  {!isCurrentPlan('pro_plus') && (
                    <Button
                      mode="contained"
                      onPress={() => handlePurchase('pro_plus')}
                      loading={iapProcessing || isPurchasing}
                      disabled={iapProcessing || isPurchasing || restoring || isIAPRestoring}
                      style={[styles.upgradeButton, { backgroundColor: '#6d28d9' }]}
                      buttonColor="#6d28d9"
                      labelStyle={styles.upgradeButtonLabel}
                    >
                      קבל Pro+
                    </Button>
                  )}
                </Card.Content>
              </View>
            </Card>

            {/* CARD 3: Free Plan (Bottom - Safety Net) */}
            {!isCurrentPlan('pro') && !isCurrentPlan('pro_plus') && (
              <Card 
                style={[styles.planCard, styles.freeCard]}
                onPress={() => router.back()}
              >
                <View style={styles.cardContentWrapper}>
                  <Card.Content style={styles.cardContent}>
                    <View style={styles.planHeader}>
                      <View style={[styles.iconCircle, { backgroundColor: '#F3F4F6' }]}>
                        <MaterialCommunityIcons name="account-outline" size={28} color="#9CA3AF" />
                      </View>
                      <View style={styles.planTitleContainer}>
                        <Text variant="titleLarge" style={[styles.planTitle, { color: '#6B7280' }, rtlText]}>
                          חינמי
                        </Text>
                        <Text variant="bodySmall" style={[styles.planSubtitle, rtlText]}>
                          שימוש בסיסי
                        </Text>
                      </View>
                    </View>

                    <Divider style={styles.divider} />

                    <View style={styles.featuresList}>
                      <View style={[styles.featureItem, rtlContainer]}>
                        <MaterialCommunityIcons name="check" size={18} color="#9CA3AF" />
                        <Text variant="bodySmall" style={[styles.featureText, { color: '#6B7280' }, rtlText]}>
                          שימוש בסיסי
                        </Text>
                      </View>
                      <View style={[styles.featureItem, rtlContainer]}>
                        <MaterialCommunityIcons name="check" size={18} color="#9CA3AF" />
                        <Text variant="bodySmall" style={[styles.featureText, { color: '#6B7280' }, rtlText]}>
                          הזנה ידנית בלבד
                        </Text>
                      </View>
                    </View>

                    <Button
                      mode="outlined"
                      onPress={() => router.back()}
                      style={styles.freeContinueButton}
                      labelStyle={styles.freeContinueButtonLabel}
                      textColor="#9CA3AF"
                    >
                      המשך עם תוכנית חינמית
                    </Button>
                  </Card.Content>
                </View>
              </Card>
            )}
          </View>

          {/* Fair Use Disclaimer */}
          <View style={styles.fairUseContainer}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#757575" />
            <Text variant="bodySmall" style={[styles.fairUseText, rtlText]}>
              {t('subscription.subscribe.fairUseNote')}
            </Text>
          </View>

          {/* Cancel Anytime Note */}
          <Text variant="bodySmall" style={[styles.cancelNote, rtlText]}>
            {t('subscription.subscribe.cancelAnytime')}
          </Text>

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
              loading={restoring || isIAPRestoring}
              disabled={restoring || isIAPRestoring || iapProcessing || isPurchasing}
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
      backgroundColor: '#F9FAFB',
    },
    container: {
      flex: 1,
    },
    header: {
      paddingTop: 0,
      marginTop: 0,
      elevation: 0,
      backgroundColor: '#F9FAFB',
    },
    content: {
      flex: 1,
      backgroundColor: '#F9FAFB',
    },
    contentContainer: {
      paddingBottom: 24,
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
      backgroundColor: '#F9FAFB',
    },
    title: {
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 8,
      color: '#1A1A1A',
    },
    marketingSubtitle: {
      textAlign: 'center',
      color: '#424242',
      fontWeight: '500',
    },
    plansContainer: {
      paddingHorizontal: 16,
      gap: 20,
    },
    planCard: {
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      overflow: 'visible',
    },
    // Pro Card (Blue)
    proCard: {
      borderWidth: 0,
      ...Platform.select({
        ios: {
          shadowColor: '#007AFF',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
        },
        android: {
          elevation: 5,
        },
      }),
    },
    proTopBorder: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      backgroundColor: '#007AFF',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      zIndex: 1,
    },
    recommendedBadge: {
      position: 'absolute',
      top: 12,
      ...(isRTL ? { left: 12 } : { right: 12 }),
      backgroundColor: '#007AFF',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      zIndex: 2,
    },
    recommendedBadgeText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    // Pro+ Card (Purple)
    proPlusCard: {
      borderWidth: 2,
      borderColor: '#6d28d9',
      ...Platform.select({
        ios: {
          shadowColor: '#6d28d9',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        },
        android: {
          elevation: 6,
        },
      }),
    },
    bestValueBadge: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      backgroundColor: '#6d28d9',
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      zIndex: 1,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
    },
    bestValueBadgeText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    // Free Card (Gray)
    freeCard: {
      borderWidth: 1,
      borderColor: '#D1D5DB',
      backgroundColor: '#FFFFFF',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        android: {
          elevation: 1,
        },
      }),
    },
    selectedCard: {
      borderWidth: 2,
    },
    selectedCardPro: {
      borderColor: '#007AFF',
    },
    selectedCardProPlus: {
      borderColor: '#6d28d9',
    },
    currentPlanCard: {
      backgroundColor: '#F0F9FF',
    },
    cardContentWrapper: {
      overflow: 'hidden',
      borderRadius: 14,
    },
    cardContent: {
      padding: 20,
    },
    currentBadge: {
      position: 'absolute',
      top: 12,
      ...(isRTL ? { left: 12 } : { right: 12 }),
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 16,
      gap: 4,
      zIndex: 1,
    },
    currentBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
    },
    popularBadge: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      backgroundColor: '#FF6B35',
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      zIndex: 1,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
    },
    popularBadgeText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    planHeader: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 18,
    },
    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconCircleGradient: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
    },
    planTitleContainer: {
      flex: 1,
    },
    planTitle: {
      fontWeight: '800',
      fontSize: 24,
      letterSpacing: 0.3,
    },
    planSubtitle: {
      color: '#6B7280',
      marginTop: 4,
      fontSize: 14,
    },
    priceContainer: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'baseline',
      gap: 8,
      marginBottom: 12,
    },
    priceAmount: {
      fontWeight: '800',
      fontSize: 36,
      letterSpacing: -0.5,
    },
    priceUnit: {
      color: '#6B7280',
      fontSize: 15,
      fontWeight: '500',
    },
    priceLoadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    priceLoadingText: {
      color: '#757575',
      fontSize: 14,
    },
    priceErrorContainer: {
      paddingVertical: 8,
    },
    priceFallbackText: {
      color: '#757575',
      fontSize: 13,
    },
    divider: {
      marginVertical: 18,
      backgroundColor: '#E5E7EB',
    },
    featuresList: {
      gap: 12,
      marginBottom: 12,
    },
    featureItem: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    featureText: {
      flex: 1,
      color: '#374151',
      fontSize: 15,
      lineHeight: 22,
      paddingTop: 2,
    },
    upgradeButtonGradient: {
      borderRadius: 12,
      marginTop: 20,
      overflow: 'hidden',
    },
    upgradeButton: {
      borderRadius: 12,
      marginTop: 20,
      paddingVertical: 4,
    },
    upgradeButtonInGradient: {
      borderRadius: 0,
      margin: 0,
    },
    upgradeButtonLabel: {
      fontSize: 15,
      fontWeight: '700',
    },
    freeContinueButton: {
      marginTop: 16,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: '#9CA3AF',
    },
    freeContinueButtonLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#6B7280',
    },
    fairUseContainer: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    fairUseText: {
      flex: 1,
      color: '#757575',
      fontSize: 12,
      lineHeight: 18,
    },
    cancelNote: {
      textAlign: 'center',
      color: '#757575',
      fontSize: 12,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 24,
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
  });
}
