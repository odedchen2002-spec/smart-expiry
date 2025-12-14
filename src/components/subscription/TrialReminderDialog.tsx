/**
 * Trial reminder dialog
 * Shows 3 days before trial ends
 */

import React, { useState, useEffect } from 'react';
import { Portal, Dialog, Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useLanguage } from '@/context/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';

const TRIAL_REMINDER_KEY = (ownerId: string) => `trial_reminder_shown_${ownerId}`;
const TRIAL_REMINDER_DAYS = 3;

export function TrialReminderDialog() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { subscription, isPro, isFreeTrialActive } = useSubscription();
  const { activeOwnerId } = useActiveOwner();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const checkTrialReminder = async () => {
      // Don't show if user is Pro or not on free trial
      if (!subscription || isPro || !isFreeTrialActive || !activeOwnerId) {
        return;
      }

      // Show reminder if 3 days or less remaining
      if (subscription.trialDaysRemaining <= TRIAL_REMINDER_DAYS && subscription.trialDaysRemaining > 0) {
        // Check if we've already shown this reminder
        const reminderKey = TRIAL_REMINDER_KEY(activeOwnerId);
        const hasShown = await AsyncStorage.getItem(reminderKey);
        
        if (!hasShown) {
          setVisible(true);
          // Mark as shown
          await AsyncStorage.setItem(reminderKey, 'true');
        }
      }
    };

    checkTrialReminder();
  }, [subscription, activeOwnerId]);

  const handleUpgrade = () => {
    setVisible(false);
    router.push('/(paywall)/subscribe' as any);
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  // Don't show if user is Pro or not on free trial
  if (!subscription || isPro || !isFreeTrialActive) {
    return null;
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={[styles.dialog, rtlContainer]}>
        <Dialog.Title style={rtlText}>
          נותרו {subscription.trialDaysRemaining} ימים לניסיון החינמי
        </Dialog.Title>
        <Dialog.Content>
          <Text style={[styles.message, rtlText]}>
            הניסיון החינמי שלך מסתיים בעוד {subscription.trialDaysRemaining} ימים. 
            לאחר מכן, בתוכנית החינמית תוכל לנהל את 150 המוצרים הראשונים שהוספת. 
            שאר המוצרים יישארו לקריאה בלבד עד לשדרוג.
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={[styles.actions, rtlContainer]}>
          <Button onPress={handleDismiss} textColor="#666">
            סגור
          </Button>
          <Button mode="contained" onPress={handleUpgrade}>
            שדרג עכשיו
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = {
  dialog: {
    borderRadius: 12,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  actions: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
};

