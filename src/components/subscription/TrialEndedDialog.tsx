/**
 * Trial ended dialog
 * Shows once when trial period ends, explaining the free plan limits
 * 
 * OFFLINE-SAFE:
 * - Only shows when online AND subscription confirmed expired
 * - Never shows when offline (uses cached subscription state)
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Portal, Dialog, Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useLanguage } from '@/context/LanguageContext';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';

const TRIAL_ENDED_KEY = (ownerId: string) => `trial_ended_shown_${ownerId}`;

export function TrialEndedDialog() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { subscription, isPro, isFreeTrialActive, loading: subscriptionLoading, error: subscriptionError } = useSubscription();
  const { activeOwnerId } = useActiveOwner();
  const { isOnline } = useNetworkStatus();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const styles = createStyles(isRTL);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const checkTrialEnded = async () => {
      // CRITICAL: Wait for subscription to load before checking
      if (subscriptionLoading) {
        console.log('[TrialEndedDialog] Subscription still loading, waiting...');
        return;
      }

      // OFFLINE-SAFE: Don't show dialog if offline or if there's a fetch error
      // We can only confirm trial ended when we have successful online data
      if (!isOnline) {
        console.log('[TrialEndedDialog] Offline - not showing dialog (using cached subscription)');
        // Hide dialog if it's showing and we go offline
        if (visible) {
          setVisible(false);
        }
        return;
      }

      // Don't show if subscription fetch failed
      if (subscriptionError) {
        console.log('[TrialEndedDialog] Subscription error - not showing dialog');
        return;
      }

      // CRITICAL: Don't show if user is Pro OR still in trial
      if (!subscription || !activeOwnerId || isPro || isFreeTrialActive) {
        console.log('[TrialEndedDialog] Not showing:', { 
          isPro, 
          isFreeTrialActive, 
          plan: subscription?.plan,
          trialDaysRemaining: subscription?.trialDaysRemaining,
          isTrialActive: subscription?.isTrialActive
        });
        
        // If user is in trial, clear the "already shown" flag
        // This ensures if trial expires later, they'll see the dialog
        if (isFreeTrialActive && activeOwnerId) {
          const reminderKey = TRIAL_ENDED_KEY(activeOwnerId);
          const hasShown = await AsyncStorage.getItem(reminderKey);
          if (hasShown) {
            console.log('[TrialEndedDialog] User is in trial, clearing stale "already shown" flag');
            await AsyncStorage.removeItem(reminderKey);
          }
        }
        
        // If user is back in trial (e.g. after reload), hide the dialog
        if (visible && isFreeTrialActive) {
          console.log('[TrialEndedDialog] User is back in trial, hiding dialog');
          setVisible(false);
        }
        return;
      }

      // Show dialog ONLY if:
      // 1. Online (confirmed state)
      // 2. User is NOT in trial (trial ended)
      // 3. User is on free plan
      // 4. We haven't shown this dialog before for this owner
      if (!isFreeTrialActive && subscription.plan === 'free' && subscription.trialDaysRemaining === 0) {
        const reminderKey = TRIAL_ENDED_KEY(activeOwnerId);
        const hasShown = await AsyncStorage.getItem(reminderKey);
        
        if (!hasShown) {
          console.log('[TrialEndedDialog] Showing trial ended dialog (online, trial confirmed ended)');
          setVisible(true);
          // Mark as shown
          await AsyncStorage.setItem(reminderKey, 'true');
        } else {
          console.log('[TrialEndedDialog] Already shown before');
        }
      }
    };

    checkTrialEnded();
  }, [subscription, activeOwnerId, isPro, isFreeTrialActive, subscriptionLoading, subscriptionError, isOnline, visible]);

  const handleUpgrade = () => {
    setVisible(false);
    router.push('/(paywall)/subscribe' as any);
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  // Don't show if subscription is loading or user is Pro or still on free trial
  // ALSO: Don't show if offline (can't confirm expiry state)
  if (subscriptionLoading || !subscription || isPro || isFreeTrialActive || !isOnline) {
    return null;
  }

  return (
    <Portal>
      <Dialog 
        visible={visible} 
        onDismiss={handleDismiss} 
        style={[styles.dialog, rtlContainer]}
      >
        <Dialog.Content style={styles.dialogContent}>
          {/* Icon Section */}
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={['#FF6B35', '#E64A19']}
              style={styles.iconGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons
                name="clock-alert-outline"
                size={48}
                color="#FFFFFF"
              />
            </LinearGradient>
          </View>

          {/* Title */}
          <Text variant="headlineSmall" style={[styles.title, rtlTextCenter]}>
            {t('subscription.trialEnded.title') || 'חודש המתנה ה-PRO הסתיים'}
          </Text>

          {/* Message */}
          <View style={styles.messageContainer}>
            <Text style={[styles.message, rtlText]}>
              {t('subscription.trialEnded.body1') || 'החשבון שלך עבר כעת לתוכנית החינמית.'}
            </Text>
            <Text style={[styles.message, styles.messageSpacing, rtlText]}>
              {t('subscription.trialEnded.body2') || 'תוכל להמשיך להשתמש באפליקציה עם המגבלות הבאות:'}
            </Text>
            
            {/* Limits List */}
            <View style={styles.limitsList}>
              <View style={styles.limitItem}>
                <MaterialCommunityIcons name="check-circle" size={20} color={THEME_COLORS.primary} style={styles.limitIcon} />
                <Text style={[styles.limitText, rtlText]}>
                  {t('subscription.trialEnded.limit1') || 'עד 150 מוצרים פעילים'}
                </Text>
              </View>
              <View style={styles.limitItem}>
                <MaterialCommunityIcons name="check-circle" size={20} color={THEME_COLORS.primary} style={styles.limitIcon} />
                <Text style={[styles.limitText, rtlText]}>
                  {t('subscription.trialEnded.limit2') || 'עד 5 שימושים ב-AI'}
                </Text>
              </View>
            </View>

            <Text style={[styles.message, styles.messageSpacing, rtlText]}>
              {t('subscription.trialEnded.clarification') || 'המוצרים הראשונים שתוסיף יישארו פתוחים לעריכה ולקבלת התראות.'}
            </Text>
          </View>
        </Dialog.Content>
        
        <Dialog.Actions style={[styles.actions, rtlContainer]}>
          <Button 
            onPress={handleDismiss} 
            textColor={THEME_COLORS.textSecondary}
            style={styles.dismissButton}
            labelStyle={styles.dismissButtonLabel}
          >
            {t('subscription.trialEnded.secondaryCta') || 'Continue with Free plan'}
          </Button>
          <Button 
            mode="contained" 
            onPress={handleUpgrade}
            buttonColor={THEME_COLORS.primary}
            style={styles.upgradeButton}
            labelStyle={styles.upgradeButtonLabel}
            contentStyle={styles.upgradeButtonContent}
          >
            {t('subscription.trialEnded.primaryCta') || 'Upgrade to Pro'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  dialog: {
    borderRadius: 24,
    maxWidth: 400,
    alignSelf: 'center',
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
  dialogContent: {
    paddingTop: 32,
    paddingBottom: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 20,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#FF6B35',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 0.15,
  },
  messageContainer: {
    width: '100%',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 12,
  },
  messageSpacing: {
    marginTop: 4,
  },
  limitsList: {
    width: '100%',
    marginVertical: 16,
    paddingHorizontal: 8,
  },
  limitItem: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  limitIcon: {
    marginRight: isRTL ? 0 : 12,
    marginLeft: isRTL ? 12 : 0,
  },
  limitText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4B5563',
    flex: 1,
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    gap: 12,
  },
  dismissButton: {
    flex: 1,
    ...(isRTL ? { marginLeft: 6 } : { marginRight: 6 }),
  },
  dismissButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 4,
  },
  upgradeButton: {
    flex: 1,
    ...(isRTL ? { marginRight: 6 } : { marginLeft: 6 }),
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  upgradeButtonContent: {
    paddingVertical: 6,
  },
  upgradeButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  });
}

