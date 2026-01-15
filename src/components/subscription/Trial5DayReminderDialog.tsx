/**
 * Trial 7-day reminder dialog
 * Shows 7 days before trial ends with message about gift month ending soon
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Dialog, Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useLanguage } from '@/context/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const TRIAL_7DAY_REMINDER_KEY = (ownerId: string) => `trial_7day_reminder_shown_${ownerId}`;
const TRIAL_7DAY_REMINDER_DAYS = 7;

export function Trial7DayReminderDialog() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { subscription, isPro } = useSubscription();
  const { activeOwnerId } = useActiveOwner();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const styles = createStyles(isRTL);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const checkTrialReminder = async () => {
      // Don't show if user is Pro, no subscription, or no owner ID
      if (!subscription || isPro || !activeOwnerId) {
        return;
      }

      const trialDays = subscription.trialDaysRemaining;
      
      // Show reminder if 7 days or less remaining (but more than 0)
      if (trialDays !== undefined && trialDays <= TRIAL_7DAY_REMINDER_DAYS && trialDays > 0) {
        // Check if we've already shown this reminder
        const reminderKey = TRIAL_7DAY_REMINDER_KEY(activeOwnerId);
        const hasShown = await AsyncStorage.getItem(reminderKey);
        
        if (!hasShown) {
          setVisible(true);
          // Mark as shown
          await AsyncStorage.setItem(reminderKey, 'true');
        }
      }
    };

    checkTrialReminder();
  }, [subscription, activeOwnerId, isPro]);

  const handleUpgrade = () => {
    setVisible(false);
    router.push('/(paywall)/subscribe' as any);
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  // Don't show if user is Pro
  if (!subscription || isPro) {
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
              colors={['#4CAF50', '#45A049']}
              style={styles.iconGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons
                name="clock-outline"
                size={48}
                color="#FFFFFF"
              />
            </LinearGradient>
          </View>

          {/* Title */}
          <Text variant="headlineSmall" style={[styles.title, rtlTextCenter]}>
            {t('subscription.trial7DayReminder.title') || 'חודש המתנה שלך מסתיים בקרוב'}
          </Text>

          {/* Message */}
          <View style={styles.messageContainer}>
            <Text style={[styles.message, rtlText]}>
              {t('subscription.trial7DayReminder.message') || 'חודש המתנה במנוי ה-PRO שלך מסתיים בעוד 7 ימים. לאחר מכן, תוכל להמשיך להשתמש בתוכנית החינמית שלנו ולנהל עד 150 מוצרים פעילים. המוצרים הראשונים שתוסיף יישארו פתוחים לעריכה ולקבלת התראות.'}
            </Text>
          </View>
        </Dialog.Content>
        
        <Dialog.Actions style={[styles.actions, rtlContainer]}>
          <Button 
            onPress={handleDismiss}
            textColor="#666"
            style={styles.dismissButton}
          >
            {t('common.close') || 'סגור'}
          </Button>
          <Button 
            mode="contained" 
            onPress={handleUpgrade}
            style={styles.upgradeButton}
          >
            {t('subscription.upgrade') || 'שדרג עכשיו'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
    dialog: {
      borderRadius: 16,
      maxWidth: 420,
    },
    dialogContent: {
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 8,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    iconGradient: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: '#1F2937',
      marginBottom: 16,
      textAlign: 'center',
    },
    messageContainer: {
      marginBottom: 8,
    },
    message: {
      fontSize: 15,
      lineHeight: 22,
      color: '#4B5563',
      textAlign: 'center',
    },
    actions: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 8,
      gap: 12,
    },
    dismissButton: {
      minWidth: 100,
    },
    upgradeButton: {
      minWidth: 120,
    },
  });
}

