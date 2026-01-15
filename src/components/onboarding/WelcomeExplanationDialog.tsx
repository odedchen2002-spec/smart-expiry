/**
 * Welcome Explanation Dialog
 * Shows once on first app open after signup to explain the free plan behavior
 */

import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { supabase } from '@/lib/supabase/client';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';

export function WelcomeExplanationDialog() {
  const { user, status, loading } = useAuth();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const styles = createStyles(isRTL);
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAndShowDialog = async () => {
      // Only check when user is authenticated and not loading
      if (loading || !user || status !== 'authenticated') {
        setChecking(false);
        return;
      }

      try {
        // Check if user has seen the explanation before
        const { data, error } = await supabase
          .from('user_preferences')
          .select('has_seen_plan_explanation')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.warn('[WelcomeExplanation] Error checking user preferences:', error.message);
          // On error, don't show the dialog (fail safe)
          setChecking(false);
          return;
        }

        // If has_seen_plan_explanation is true or null (not set), don't show
        // Only show if explicitly false or if the record doesn't exist
        const hasSeen = data?.has_seen_plan_explanation ?? false;
        
        if (!hasSeen) {
          setVisible(true);
        }
      } catch (error) {
        console.error('[WelcomeExplanation] Exception checking user preferences:', error);
        // On exception, don't show the dialog (fail safe)
      } finally {
        setChecking(false);
      }
    };

    checkAndShowDialog();
  }, [user, status, loading]);

  const handleDismiss = async () => {
    setVisible(false);

    // Save the flag to user_preferences
    if (!user) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            has_seen_plan_explanation: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.warn('[WelcomeExplanation] Failed to save has_seen_plan_explanation flag:', error.message);
        // Don't block the user - just log the warning
      } else {
        console.log('[WelcomeExplanation] Successfully saved has_seen_plan_explanation flag');
      }
    } catch (error) {
      console.error('[WelcomeExplanation] Exception saving has_seen_plan_explanation flag:', error);
      // Don't block the user - just log the error
    }
  };

  // Don't render anything while checking or if user is not authenticated
  if (checking || !user || status !== 'authenticated') {
    return null;
  }

  return (
    <Portal>
      <Dialog 
        visible={visible} 
        onDismiss={handleDismiss} 
        style={[styles.dialog, rtlContainer]}
        dismissable={true}
        theme={{ colors: { surface: '#FFFFFF' } }}
      >
        <Dialog.Content style={styles.dialogContent}>
          {/* Close button */}
          <View style={[styles.closeButtonContainer, rtlContainer]}>
            <Button
              mode="text"
              onPress={handleDismiss}
              style={styles.closeButton}
              icon="close"
              iconColor="#757575"
              contentStyle={styles.closeButtonContent}
            />
          </View>
          {/* Icon Section */}
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={[THEME_COLORS.primary, '#1976D2']}
              style={styles.iconGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons
                name="party-popper"
                size={48}
                color="#FFFFFF"
              />
            </LinearGradient>
          </View>

          {/* Title */}
          <Text variant="headlineSmall" style={[styles.title, rtlTextCenter]}>
            {t('onboarding.welcome.title') || 'ברוך הבא ל-Smart Expiry!'}
          </Text>

          {/* Message */}
          <View style={styles.messageContainer}>
            <Text style={[styles.message, styles.messageFirst, rtlText]}>
              {t('onboarding.welcome.body1_start') || 'אנו רוצים שתכיר את האפליקציה בחוויה ללא פשרות ולכן אנו מעניקים לך '}
              <Text style={[styles.message, styles.highlightedText]}>
                {t('onboarding.welcome.body1_highlight') || 'חודש מתנה במנוי ה-PRO שלנו'}
              </Text>
              {t('onboarding.welcome.body1_end') || '!'}
            </Text>
            <Text style={[styles.message, styles.messageSpacing, rtlText]}>
              {t('onboarding.welcome.body2') || 'לאחר החודש מתנה, תוכל להמשיך להשתמש באפליקציה בתוכנית החינמית שלנו ולנהל עד 150 מוצרים פעילים. המוצרים הראשונים שתוסיף יישארו פתוחים לעריכה ולקבלת התראות.'}
            </Text>
          </View>
        </Dialog.Content>
        
        <Dialog.Actions style={[styles.actions, rtlContainer]}>
          <Button 
            mode="contained"
            onPress={handleDismiss}
            buttonColor={THEME_COLORS.primary}
            style={styles.dismissButton}
            labelStyle={styles.dismissButtonLabel}
            contentStyle={styles.dismissButtonContent}
          >
            {t('onboarding.welcome.button') || 'הבנתי'}
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
    dialogContent: {
      paddingTop: 12,
      paddingBottom: 8,
      paddingHorizontal: 24,
      alignItems: 'center',
    },
    closeButtonContainer: {
      position: 'absolute',
      top: 8,
      right: isRTL ? undefined : 8,
      left: isRTL ? 8 : undefined,
      zIndex: 1,
    },
    closeButton: {
      minWidth: 40,
      margin: 0,
    },
    closeButtonContent: {
      padding: 0,
      margin: 0,
    },
    iconContainer: {
      marginBottom: 16,
    },
    iconGradient: {
      width: 96,
      height: 96,
      borderRadius: 48,
      justifyContent: 'center',
      alignItems: 'center',
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
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: '#1A1A1A',
      marginBottom: 20,
      textAlign: 'center',
      letterSpacing: 0.2,
      lineHeight: 32,
    },
    messageContainer: {
      width: '100%',
      marginBottom: 8,
    },
    message: {
      fontSize: 15,
      lineHeight: 24,
      color: '#4B5563',
      textAlign: 'center',
    },
    highlightedText: {
      color: THEME_COLORS.primary,
      fontWeight: '700',
    },
    messageFirst: {
      marginTop: 4,
      marginBottom: 16,
    },
    messageSpacing: {
      marginTop: 12,
      marginBottom: 12,
    },
    actions: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 8,
      justifyContent: 'center',
    },
    dismissButton: {
      flex: 1,
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
    dismissButtonContent: {
      paddingVertical: 6,
    },
    dismissButtonLabel: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });
}

