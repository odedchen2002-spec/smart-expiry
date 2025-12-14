/**
 * Upgrade banner component
 * Shows when user has more items than their plan allows
 */

import { useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';

const DISMISSED_BANNER_KEY_PREFIX = 'dismissed_upgrade_banner_';

function getDismissedBannerKey(ownerId: string | null): string | null {
  if (!ownerId) return null;
  return `${DISMISSED_BANNER_KEY_PREFIX}${ownerId}`;
}

export function UpgradeBanner() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { subscription, isPro, isFreeTrialActive } = useSubscription();
  const { activeOwnerId } = useActiveOwner();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Load dismissed state from AsyncStorage on mount
  useEffect(() => {
    const loadDismissedState = async () => {
      if (!activeOwnerId) {
        setLoading(false);
        return;
      }

      try {
        const key = getDismissedBannerKey(activeOwnerId);
        if (!key) {
          setLoading(false);
          return;
        }

        const dismissedValue = await AsyncStorage.getItem(key);
        setDismissed(dismissedValue === 'true');
      } catch (error) {
        console.error('Error loading dismissed banner state:', error);
        setDismissed(false);
      } finally {
        setLoading(false);
      }
    };

    loadDismissedState();
  }, [activeOwnerId]);

  // Save dismissed state to AsyncStorage when user closes banner
  const handleDismiss = async () => {
    if (!activeOwnerId) return;

    try {
      const key = getDismissedBannerKey(activeOwnerId);
      if (!key) return;

      await AsyncStorage.setItem(key, 'true');
      setDismissed(true);
    } catch (error) {
      console.error('Error saving dismissed banner state:', error);
      // Still set dismissed locally even if storage fails
      setDismissed(true);
    }
  };

  if (!subscription || loading || dismissed) {
    return null;
  }

  // Don't show if user is Pro
  if (isPro) {
    return null;
  }

  // Show banner if:
  // 1. Not in free trial AND
  // 2. Total items exceed the plan limit
  const shouldShow = !isFreeTrialActive 
    && subscription.maxItems !== null 
    && subscription.totalItemsCount > subscription.maxItems;

  if (!shouldShow) {
    return null;
  }

  const handleUpgrade = () => {
    // Navigate to the main upgrade/paywall screen
    router.push('/(paywall)/subscribe' as any);
  };

  return (
    <View style={[styles.banner, rtlContainer]}>
      <IconButton
        icon="close"
        size={18}
        iconColor="#FFFFFF"
        style={styles.closeButton}
        onPress={handleDismiss}
      />
      <View style={styles.bannerContent}>
        <Text style={[styles.bannerTitle, rtlText]}>
          {t('subscription.limitReached.title')}
        </Text>
        <Text style={[styles.bannerText, rtlText]}>
          {t('subscription.limitReached.message', { 
            count: subscription.totalItemsCount,
            maxItems: subscription.maxItems 
          })}
        </Text>
        <Button
          mode="contained"
          onPress={handleUpgrade}
          style={styles.upgradeButton}
          labelStyle={styles.upgradeButtonLabel}
        >
          {t('subscription.limitReached.upgrade')}
        </Button>
      </View>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  banner: {
    backgroundColor: '#FF9800',
    opacity: 0.85,
    paddingVertical: 10, // Reduced by ~15% (from 12)
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bannerContent: {
    gap: 8, // Reduced by ~20% (from 10)
    paddingTop: 7, // Reduced by ~12% (from 8)
    paddingHorizontal: 4, // Add inner padding so text doesn't touch edges
  },
  closeButton: {
    position: 'absolute',
    top: -4,
    right: 6,
    margin: 0,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: isRTL ? 'right' : 'left',
    writingDirection: isRTL ? 'rtl' : 'ltr',
    marginBottom: 4,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: isRTL ? 'right' : 'left',
    writingDirection: isRTL ? 'rtl' : 'ltr',
  },
  upgradeButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 100,
  },
  upgradeButtonLabel: {
    color: '#FF9800',
    fontWeight: '600',
    fontSize: 13,
  },
  });
}

