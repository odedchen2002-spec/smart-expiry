/**
 * Manage Subscription Screen
 * Allows users to view and cancel their subscription
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Appbar,
  Card,
  Text,
  Button,
  Divider,
  Snackbar,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { getSubscriptionStatus, type SubscriptionStatus } from '@/lib/subscription';
import { SUBSCRIPTION_PLANS, type SubscriptionTier } from '@/lib/billing';
import { useProfile } from '@/lib/hooks/useProfile';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';

export default function ManageSubscriptionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { refetch: refetchProfile } = useProfile(); // Get profile refetch function
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    loadSubscription();
  }, [user?.id]);

  const loadSubscription = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const status = await getSubscriptionStatus(user.id);
      setSubscription(status);
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestorePurchases = async () => {
    // Note: IAP restore functionality has been removed. Use Stripe billing instead.
    setSnack(t('subscription.manage.restoreError'));
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return t('subscription.manage.unlimited');
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(isRTL ? 'he-IL' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return t('subscription.manage.unlimited');
    }
  };

  const getPlanLabel = (tier: SubscriptionTier): string => {
    return SUBSCRIPTION_PLANS[tier]?.label || t('subscription.freePlan');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.container}>
          <Appbar.Header style={styles.header}>
            <Appbar.BackAction onPress={() => router.back()} />
            <Appbar.Content title={t('subscription.manage.title')} />
          </Appbar.Header>
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const currentTier = subscription?.subscription_tier || 'free';
  const isFree = currentTier === 'free';
  const isPaid = currentTier === 'basic' || currentTier === 'pro';

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <View style={styles.container}>
        <Appbar.Header style={styles.header}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title={t('subscription.manage.title')} />
        </Appbar.Header>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
        >
          {/* Current Plan Card */}
          <Card style={styles.planCard}>
            <Card.Content>
              <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                {t('subscription.manage.currentPlan')}
              </Text>
              
              <View style={styles.planInfo}>
                <Text variant="headlineSmall" style={[styles.planName, rtlText]}>
                  {getPlanLabel(currentTier)}
                </Text>
                {isPaid && (
                  <Text variant="bodyMedium" style={[styles.planPrice, rtlText]}>
                    {SUBSCRIPTION_PLANS[currentTier]?.priceMonthly} {t('subscription.manage.pricePerMonth')}
                  </Text>
                )}
              </View>
            </Card.Content>
          </Card>

          {/* Subscription Details */}
          {isPaid && subscription && (
            <>
              <Card style={styles.detailsCard}>
                <Card.Content>
                  <View style={styles.detailRow}>
                    <View style={[styles.detailLabelContainer, rtlContainer]}>
                      <MaterialCommunityIcons name="calendar-clock" size={20} color="#757575" />
                      <Text variant="bodyLarge" style={[styles.detailLabel, rtlText]}>
                        {t('subscription.manage.validUntil')}
                      </Text>
                    </View>
                    <Text variant="bodyLarge" style={[styles.detailValue, rtlText]}>
                      {formatDate(subscription.subscription_valid_until)}
                    </Text>
                  </View>

                  <Divider style={styles.divider} />

                  <View style={styles.detailRow}>
                    <View style={[styles.detailLabelContainer, rtlContainer]}>
                      <MaterialCommunityIcons 
                        name={subscription.auto_renew ? "autorenew" : "cancel"} 
                        size={20} 
                        color="#757575" 
                      />
                      <Text variant="bodyLarge" style={[styles.detailLabel, rtlText]}>
                        {t('subscription.manage.autoRenew')}
                      </Text>
                    </View>
                    <Text variant="bodyLarge" style={[styles.detailValue, rtlText]}>
                      {subscription.auto_renew ? t('subscription.manage.active') : t('subscription.manage.inactive')}
                    </Text>
                  </View>
                </Card.Content>
              </Card>

              <Card style={styles.infoCard}>
                <Card.Content>
                  <View style={[styles.infoRow, rtlContainer]}>
                    <MaterialCommunityIcons name="information" size={20} color="#FF9800" />
                    <Text variant="bodyMedium" style={[styles.infoText, rtlText]}>
                      {t('subscription.manage.cancelInfo', { store: Platform.OS === 'ios' ? 'Apple App Store' : 'Google Play' })}
                    </Text>
                  </View>
                </Card.Content>
              </Card>

              {subscription.auto_renew === false && subscription.subscription_valid_until && (
                <Card style={styles.infoCard}>
                  <Card.Content>
                    <View style={[styles.infoRow, rtlContainer]}>
                      <MaterialCommunityIcons name="calendar-alert" size={20} color="#757575" />
                      <Text variant="bodyMedium" style={[styles.infoText, rtlText]}>
                        {t('subscription.manage.cancelledInfo', { date: formatDate(subscription.subscription_valid_until) })}
                      </Text>
                    </View>
                  </Card.Content>
                </Card>
              )}
            </>
          )}

          {/* Free Plan Message */}
          {isFree && (
            <Card style={styles.infoCard}>
              <Card.Content>
                <View style={[styles.infoRow, rtlContainer]}>
                  <MaterialCommunityIcons name="information" size={20} color="#757575" />
                  <Text variant="bodyMedium" style={[styles.infoText, rtlText]}>
                    {t('subscription.manage.freePlanInfo')}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          )}

          <Button
            mode="text"
            onPress={handleRestorePurchases}
            loading={restoring}
            disabled={restoring}
            style={styles.restoreButton}
          >
            {t('subscription.manage.restore')}
          </Button>
        </ScrollView>

        <Snackbar
          visible={!!snack}
          onDismiss={() => setSnack(null)}
          duration={4000}
        >
          {snack}
        </Snackbar>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planCard: {
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
  },
  detailsCard: {
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
  },
  infoCard: {
    borderRadius: 12,
    marginBottom: 16,
    elevation: 1,
    backgroundColor: '#FFF9E6',
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 16,
    color: '#1A1A1A',
  },
  planInfo: {
    marginTop: 8,
  },
  planName: {
    fontWeight: '700',
    marginBottom: 4,
  },
  planPrice: {
    color: '#757575',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  detailLabel: {
    fontWeight: '500',
    color: '#424242',
  },
  detailValue: {
    fontWeight: '600',
    color: '#1A1A1A',
  },
  divider: {
    marginVertical: 12,
    backgroundColor: '#E0E0E0',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: '#424242',
    lineHeight: 20,
  },
  restoreButton: {
    marginTop: 16,
    alignSelf: 'center',
  },
});

