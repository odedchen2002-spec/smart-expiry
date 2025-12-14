
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { TextInput, Button, Text, Snackbar } from 'react-native-paper';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');

  const handleSendReset = async () => {
    if (!email) {
      setSnack({
        message: t('auth.error.invalidEmail') || 'אנא הזן כתובת אימייל',
        type: 'error',
      });
      return;
    }

    setLoading(true);
    setSnack(null);

    try {
      // Create redirect URL that works for both web and native
      // On native: creates deep link like "expiryxclean:///(auth)/reset-password"
      // On web: creates full URL like "https://yourdomain.com/(auth)/reset-password"
      const redirectTo = Linking.createURL('/(auth)/reset-password');

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        console.error('[ForgotPassword] Error sending reset email:', error);
        throw error;
      }

      setSnack({
        message:
          t('auth.resetEmailSent') ||
          'שלחנו אליך מייל עם קישור לאיפוס הסיסמה. בדוק את תיבת הדואר שלך.',
        type: 'success',
      });

      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2500);
    } catch (error: any) {
      console.error('[ForgotPassword] Exception sending reset email:', error);
      
      // Check for rate limiting error
      const errorMessage = error?.message || '';
      const isRateLimited = 
        errorMessage.toLowerCase().includes('security purposes') ||
        errorMessage.toLowerCase().includes('only request this after') ||
        errorMessage.toLowerCase().includes('rate limit') ||
        errorMessage.toLowerCase().includes('too many requests');
      
      let message: string;
      
      if (isRateLimited) {
        // Extract wait time from error message (e.g., "after 13 seconds" or "after 60 seconds")
        // Pattern matches: "13 seconds", "1 minute", "2 hours", etc.
        const timeMatch = errorMessage.match(/(\d+)\s*(second|seconds|minute|minutes|hour|hours)/i);
        if (timeMatch) {
          const time = timeMatch[1];
          const unit = timeMatch[2].toLowerCase();
          const unitHebrew = unit.includes('second') ? 'שניות' :
                            unit.includes('minute') ? 'דקות' :
                            'שעות';
          message = t('auth.resetEmailRateLimited') || 
                   `בגלל אבטחה, ניתן לבקש קישור איפוס רק כל ${time} ${unitHebrew}. אנא המתן ${time} ${unitHebrew} לפני ניסיון נוסף.`;
        } else {
          message = t('auth.resetEmailRateLimited') ||
                   'בגלל אבטחה, ניתן לבקש קישור איפוס רק כל זמן קצר. אנא המתן כמה רגעים לפני ניסיון נוסף.';
        }
      } else {
        // Generic error message
        message = error?.message ||
                 t('auth.resetEmailError') ||
                 'אירעה שגיאה בשליחת קישור האיפוס. נסה שוב.';
      }
      
      setSnack({
        message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <Text variant="headlineLarge" style={[styles.title, rtlTextCenter]}>
            {t('auth.forgotPasswordTitle') || 'שכחת סיסמה'}
          </Text>
          <Text variant="bodyMedium" style={[styles.description, rtlText]}>
            {t('auth.forgotPasswordDescription') ||
              'נשלח אליך קישור לאיפוס הסיסמה לכתובת הדואר האלקטרוני שלך.'}
          </Text>

          <TextInput
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.input}
            disabled={loading}
          />

          <Button
            mode="contained"
            onPress={handleSendReset}
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            {t('auth.resetSendButton') || 'שלח קישור לאיפוס סיסמה'}
          </Button>

          <Button
            mode="text"
            onPress={() => router.back()}
            disabled={loading}
            style={styles.linkButton}
          >
            {t('auth.backToLogin') || 'חזרה למסך ההתחברות'}
          </Button>
        </View>
      </ScrollView>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={snack?.type === 'success' ? 4000 : 3000}
        style={snack?.type === 'success' ? styles.successSnackbar : undefined}
      >
        {snack?.message}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.8,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
    paddingVertical: 4,
  },
  linkButton: {
    marginTop: 16,
  },
  successSnackbar: {
    backgroundColor: '#2E7D32',
  },
});


