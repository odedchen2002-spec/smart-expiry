/**
 * Current Plan Screen
 * Shows the user's current subscription plan and item usage
 */

import { SUBSCRIPTION_PLANS, type SubscriptionTier } from '@/lib/billing';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { supabase } from '@/lib/supabase/client';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { logSubscription } from '@/lib/logging/subscriptionLogger';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  Appbar,
  Card,
  Chip,
  ProgressBar,
  Text
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CurrentPlanScreen() {
  const router = useRouter();
  const { subscription, loading, isPro, isProPlus, isFreeTrialActive } = useSubscription();
  const insets = useSafeAreaInsets();
  const { activeOwnerId } = useActiveOwner();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const [aiAnalysisCount, setAiAnalysisCount] = useState<number | null>(null);
  
  // Precedence: Pro+ > Pro > Free Trial > Free
  // Determine subscription tier with clear precedence
  const subscriptionTier: SubscriptionTier = isProPlus ? 'pro_plus' : (isPro ? 'pro' : (isFreeTrialActive ? 'free' : 'free'));
  
  // Log subscription state changes only (not on every render)
  const prevStateRef = useRef<{ tier: SubscriptionTier; isPro: boolean; isFreeTrialActive: boolean } | null>(null);
  useEffect(() => {
    if (!loading && subscription) {
      const currentState = { tier: subscriptionTier, isPro, isFreeTrialActive };
      const prevState = prevStateRef.current;
      
      if (!prevState || 
          prevState.tier !== currentState.tier || 
          prevState.isPro !== currentState.isPro || 
          prevState.isFreeTrialActive !== currentState.isFreeTrialActive) {
        logSubscription('[CurrentPlan] Subscription state changed:', {
          tier: subscriptionTier,
          isPro,
          isFreeTrialActive,
          plan: subscription.plan,
          isTrialActive: subscription.isTrialActive,
          isPaidActive: subscription.isPaidActive,
        });
        prevStateRef.current = currentState;
      }
    }
  }, [loading, subscription, subscriptionTier, isPro, isFreeTrialActive]);
  const subscriptionValidUntil = subscription?.subscriptionEndDate || null;
  const activeItemsCount = subscription?.activeItemsCount || 0;
  const maxItems = subscription?.maxItems;
  const isPaidActive = subscription?.isPaidActive || false;
  const MAX_FREE_ANALYSES = 5;
  const remainingAnalyses =
    aiAnalysisCount == null ? null : Math.max(0, MAX_FREE_ANALYSES - aiAnalysisCount);

  const currentPlan = SUBSCRIPTION_PLANS[subscriptionTier];
  // Unlimited if Pro, or Free Trial, or maxItems is null
  const isUnlimited = isPro || isFreeTrialActive || maxItems === null;

  // Safely compute usage values even if maxItems is undefined in the subscription object
  let usagePercentage = 0;
  if (!isUnlimited && typeof maxItems === 'number' && maxItems > 0) {
    usagePercentage = (activeItemsCount / maxItems) * 100;
  }
  const isNearLimit = !isUnlimited && usagePercentage >= 80;
  const isAtLimit = !isUnlimited && typeof maxItems === 'number' && activeItemsCount >= maxItems;

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return t('subscription.unlimited');
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(isRTL ? 'he-IL' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return t('subscription.unlimited');
    }
  };

  const getPlanIcon = (tier: SubscriptionTier) => {
    switch (tier) {
      case 'free':
        return 'account-outline';
      case 'pro':
        return 'store';
      case 'pro_plus':
        return 'crown';
      default:
        return 'account-outline';
    }
  };

  const getPlanColor = (tier: SubscriptionTier) => {
    switch (tier) {
      case 'free':
        return '#757575';
      case 'pro':
        return '#4CAF50';
      case 'pro_plus':
        return '#FF6B35';
      default:
        return '#757575';
    }
  };

  useEffect(() => {
    const loadAiUsage = async () => {
      if (!activeOwnerId) {
        setAiAnalysisCount(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('ai_analysis_count')
          .eq('id', activeOwnerId)
          .maybeSingle();

        if (error) {
          console.error('Error loading AI usage info (current plan):', error);
          return;
        }

        if (data) {
          const count = ((data as any).ai_analysis_count as number | null) ?? 0;
          setAiAnalysisCount(count);
        }
      } catch (e) {
        console.error('Unexpected error loading AI usage info (current plan):', e);
      }
    };

    loadAiUsage();
  }, [activeOwnerId]);

  const getPlanName = () => {
    // Precedence: Pro+ > Pro > Free Trial > Free
    if (isProPlus) {
      return t('settings.subscriptionLabel.proPlus');
    }
    if (isPro) {
      return t('settings.subscriptionLabel.pro');
    }
    if (isFreeTrialActive) {
      return t('settings.subscriptionLabel.trial');
    }
    return t('settings.subscriptionLabel.free');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={[styles.header, { backgroundColor: THEME_COLORS.surfaceVariant }]}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title={t('subscription.currentPlan')} />
        </Appbar.Header>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={THEME_COLORS.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={[styles.header, { backgroundColor: THEME_COLORS.surfaceVariant }]}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('subscription.currentPlan')} />
      </Appbar.Header>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 32) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Plan Card */}
        <Card style={styles.sectionCard} mode="outlined">
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
            <View style={styles.planHeader}>
              <View style={[styles.iconContainer, { backgroundColor: isFreeTrialActive ? '#4CAF5015' : `${getPlanColor(subscriptionTier)}15` }]}>
                {isFreeTrialActive ? (
                  <MaterialCommunityIcons
                    name="star"
                    size={48}
                    color="#4CAF50"
                  />
                ) : subscriptionTier === 'pro_plus' ? (
                  <LinearGradient
                    colors={['#9C27B0', '#7B1FA2']}
                    style={styles.iconGradient}
                  >
                    <MaterialCommunityIcons
                      name={getPlanIcon(subscriptionTier)}
                      size={48}
                      color="#FFFFFF"
                    />
                  </LinearGradient>
                ) : subscriptionTier === 'pro' ? (
                  <LinearGradient
                    colors={['#FF6B35', '#E64A19']}
                    style={styles.iconGradient}
                  >
                    <MaterialCommunityIcons
                      name={getPlanIcon(subscriptionTier)}
                      size={48}
                      color="#FFFFFF"
                    />
                  </LinearGradient>
                ) : (
                  <MaterialCommunityIcons
                    name={getPlanIcon(subscriptionTier)}
                    size={48}
                    color={getPlanColor(subscriptionTier)}
                  />
                )}
              </View>
              <View style={styles.planInfo}>
                <Text variant="headlineMedium" style={[styles.planName, rtlText]}>
                  {getPlanName()}
                </Text>
                <Text variant="titleMedium" style={[styles.planPrice, rtlText]}>
                  {isFreeTrialActive || currentPlan.priceMonthly === 0
                    ? t('subscription.free')
                    : `${currentPlan.priceMonthly} ${t('subscription.pricePerMonth')}`}
                </Text>
              </View>
            </View>

            {isFreeTrialActive && subscription?.trialEndDate && !isPro && (
              <>
                <View style={styles.divider} />
                <View style={styles.trialDaysContainer}>
                  <Text variant="headlineMedium" style={[styles.trialDaysValue, rtlText]}>
                    {subscription.trialDaysRemaining}
                  </Text>
                  <Text variant="bodyMedium" style={[styles.trialDaysLabel, rtlText]}>
                    {t('subscription.daysRemaining')}
                  </Text>
                  {subscription.trialEndDate && (
                    <Text variant="bodySmall" style={[styles.trialEndDate, rtlText]}>
                      {t('subscription.endsOn')} {formatDate(subscription.trialEndDate)}
                    </Text>
                  )}
                </View>
              </>
            )}

            {subscriptionValidUntil && subscriptionTier !== 'free' && !isFreeTrialActive && (
              <>
                <View style={styles.divider} />
                <View style={[styles.validUntilRow, rtlContainer]}>
                  <MaterialCommunityIcons name="calendar-clock-outline" size={20} color={THEME_COLORS.textSecondary} />
                  <Text variant="bodyMedium" style={[styles.validUntilText, rtlText]}>
                    {t('subscription.validUntil')}: {formatDate(subscriptionValidUntil)}
                  </Text>
                </View>
              </>
            )}
            </Card.Content>
          </View>
        </Card>

          {/* Usage Card - Show for all plans except free trial */}
          {!isFreeTrialActive && (
            <Card style={styles.sectionCard} mode="outlined">
              <View style={styles.cardContentWrapper}>
                <Card.Content style={styles.cardContent}>
                <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                  {t('subscription.usage')}
                </Text>
                
                <View style={styles.usageInfo}>
                  <View style={styles.usageRow}>
                    <View style={[styles.usageLabelContainer, rtlContainer]}>
                      <MaterialCommunityIcons
                        name="package-variant"
                        size={24}
                        color={isAtLimit ? THEME_COLORS.error : isNearLimit ? '#FF9800' : '#4CAF50'}
                      />
                      <View style={styles.usageTextContainer}>
                        <Text variant="bodyLarge" style={[styles.usageLabel, rtlText]}>
                          {t('subscription.activeItems')}
                        </Text>
                        {!isUnlimited && typeof maxItems === 'number' && (
                          <Text variant="bodySmall" style={[styles.usageSubtext, rtlText]}>
                            {t('subscription.outOf')} {maxItems} {t('common.products')}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.usageValueContainer}>
                      <Text
                        variant="headlineMedium"
                        style={[
                          styles.usageValue,
                          { color: isAtLimit ? THEME_COLORS.error : isNearLimit ? '#FF9800' : THEME_COLORS.primary },
                          rtlText,
                        ]}
                      >
                        {activeItemsCount}
                      </Text>
                      {isUnlimited && (
                        <Chip 
                          style={styles.unlimitedChip}
                          textStyle={styles.unlimitedChipText}
                          icon="infinity"
                        >
                          {t('subscription.unlimited')}
                        </Chip>
                      )}
                    </View>
                  </View>

                  {isUnlimited && (subscriptionTier === 'pro' || subscriptionTier === 'pro_plus') && (
                    <View style={styles.unlimitedMessageContainer}>
                      <MaterialCommunityIcons
                        name="infinity"
                        size={20}
                        color="#4CAF50"
                      />
                      <Text variant="bodyMedium" style={[styles.unlimitedMessage, rtlText]}>
                        {t('subscription.canAddUnlimited')}
                      </Text>
                    </View>
                  )}

                  {!isUnlimited && (
                    <>
                      <View style={styles.progressContainer}>
                        <ProgressBar
                          progress={usagePercentage / 100}
                          color={isAtLimit ? THEME_COLORS.error : isNearLimit ? '#FF9800' : '#4CAF50'}
                          style={styles.progressBar}
                        />
                      </View>
                      <Text variant="bodySmall" style={[styles.usageHint, rtlText]}>
                        {isAtLimit
                          ? t('subscription.limitReached.title')
                          : isNearLimit
                          ? t('subscription.nearLimit')
                          : typeof maxItems === 'number'
                          ? `${maxItems - activeItemsCount} ${t('subscription.productsRemaining')}`
                          : ''}
                      </Text>
                    </>
                  )}
                </View>
                </Card.Content>
              </View>
            </Card>
          )}

          {/* Plan Features Card */}
          <Card style={styles.sectionCard} mode="outlined">
            <View style={styles.cardContentWrapper}>
              <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                {t('subscription.whatsIncluded')}
              </Text>
              
              <View style={styles.featuresList}>
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={24}
                    color={isFreeTrialActive ? '#4CAF50' : getPlanColor(subscriptionTier)}
                  />
                  <Text variant="bodyLarge" style={[styles.featureText, rtlText]}>
                    {isPro || isFreeTrialActive || isUnlimited
                      ? t('subscription.unlimitedProducts')
                      : `${t('subscription.upTo')} ${typeof maxItems === 'number' ? maxItems : 0} ${t('common.products')}`}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={24}
                    color={getPlanColor(subscriptionTier)}
                  />
                  <Text variant="bodyLarge" style={[styles.featureText, rtlText]}>
                    {t('subscription.allBasicFeatures')}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons
                    name="lock-check"
                    size={24}
                    color={getPlanColor(subscriptionTier)}
                  />
                  <Text variant="bodyLarge" style={[styles.featureText, rtlText]}>
                    {(subscriptionTier === 'pro' || subscriptionTier === 'pro_plus') && isPaidActive
                      ? t('subscription.noLockingPro')
                      : t('subscription.lockingFree')}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={24}
                    color={getPlanColor(subscriptionTier)}
                  />
                  <Text variant="bodyLarge" style={[styles.featureText, rtlText]}>
                    {t('subscription.fullSupport')}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={[styles.featureItem, rtlContainer]}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={24}
                    color={getPlanColor(subscriptionTier)}
                  />
                  <Text
                  variant="bodyLarge"
                  style={[
                    styles.featureText,
                    rtlText,
                    { writingDirection: isRTL ? 'rtl' : 'ltr', textAlign: isRTL ? 'right' : 'left' },
                  ]}
                >
                  {(subscriptionTier === 'pro' || subscriptionTier === 'pro_plus') && isPaidActive
                    ? t('subscription.aiUnlimited')
                    : remainingAnalyses == null
                    ? t('subscription.aiLoading')
                    : t('subscription.aiFree', { remaining: remainingAnalyses, total: MAX_FREE_ANALYSES })}
                </Text>
                </View>
              </View>
              </Card.Content>
            </View>
          </Card>

          {/* Upgrade Button */}
          {!isPro && (
            <TouchableOpacity
              onPress={() => router.push('/(paywall)/subscribe' as any)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={isFreeTrialActive || subscriptionTier === 'free' 
                  ? [THEME_COLORS.primary, THEME_COLORS.primaryLight]
                  : ['#FF6B35', '#E64A19']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.premiumButton}
              >
                <Text style={styles.premiumButtonText}>
                  {isFreeTrialActive 
                    ? t('subscription.upgrade')
                    : subscriptionTier === 'free' 
                    ? t('subscription.upgradeToPro')
                    : t('subscription.upgradeToPro')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.surfaceVariant,
  },
  header: {
    backgroundColor: THEME_COLORS.surfaceVariant,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionCard: {
    marginBottom: 28,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardContentWrapper: {
    overflow: 'hidden',
    borderRadius: 20,
  },
  cardContent: {
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    marginBottom: 20,
    fontWeight: '700',
    fontSize: 18,
    color: THEME_COLORS.text,
    letterSpacing: 0.2,
  },
  planHeader: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  iconGradient: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planInfo: {
    flex: 1,
    marginStart: isRTL ? 0 : 20,
    marginEnd: isRTL ? 20 : 0,
  },
  planName: {
    fontWeight: '700',
    marginBottom: 8,
    fontSize: 24,
    color: THEME_COLORS.text,
  },
  planPrice: {
    color: THEME_COLORS.textSecondary,
    fontSize: 18,
    fontWeight: '500',
  },
  divider: {
    height: 0.5,
    backgroundColor: THEME_COLORS.border,
    marginVertical: 16,
    marginHorizontal: -8,
    opacity: 0.5,
  },
  validUntilRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 10,
  },
  validUntilText: {
    color: THEME_COLORS.textSecondary,
    fontSize: 15,
  },
  usageInfo: {
    marginTop: 8,
  },
  usageRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  usageLabelContainer: {
    flex: 1,
    gap: 12,
    alignItems: 'center',
  },
  usageTextContainer: {
    flex: 1,
    gap: 4,
  },
  usageLabel: {
    fontWeight: '600',
    fontSize: 17,
    color: THEME_COLORS.text,
  },
  usageSubtext: {
    color: THEME_COLORS.textSecondary,
    fontSize: 14,
  },
  usageValueContainer: {
    alignItems: isRTL ? 'flex-start' : 'flex-end',
  },
  usageValue: {
    fontWeight: '700',
    fontSize: 32,
  },
  unlimitedChip: {
    height: 28,
    marginTop: 8,
    backgroundColor: '#E8F5E9',
  },
  unlimitedChipText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    marginVertical: 12,
  },
  progressBar: {
    height: 10,
    borderRadius: 5,
  },
  usageHint: {
    color: THEME_COLORS.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  featuresList: {
    marginTop: 8,
  },
  featureItem: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 16,
  },
  featureText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: THEME_COLORS.text,
  },
  premiumButton: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
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
  premiumButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  trialDaysContainer: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F0F9F4',
    borderRadius: 16,
    marginHorizontal: -8,
  },
  trialDaysValue: {
    fontWeight: '700',
    color: '#4CAF50',
    fontSize: 36,
    marginBottom: 4,
  },
  trialDaysLabel: {
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 8,
    fontSize: 16,
  },
  trialEndDate: {
    color: THEME_COLORS.textSecondary,
    fontSize: 13,
    opacity: 0.7,
    marginTop: 4,
  },
  unlimitedMessageContainer: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    gap: 10,
  },
  unlimitedMessage: {
    flex: 1,
    color: '#2E7D32',
    fontWeight: '600',
    fontSize: 15,
  },
  });
}

