import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { TextInput, Button, Text, Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [snack, setSnack] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');

  // Check recovery session on mount and listen for auth state changes
  // Note: Recovery URL handling is done at the RootLayout level where deep link events are received
  useEffect(() => {
    const checkRecoverySession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setCanReset(!!session);
    };

    // Check existing session on mount
    checkRecoverySession();

    // Listen for auth state changes (fires for PASSWORD_RECOVERY event)
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setCanReset(!!session);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async () => {
    if (!password || password.length < 6) {
      setSnack({
        message: t('auth.error.weakPassword') || 'הסיסמה צריכה להכיל לפחות 6 תווים',
        type: 'error',
      });
      return;
    }

    if (password !== confirmPassword) {
      setSnack({
        message: t('auth.resetPasswordMismatch') || 'הסיסמאות אינן תואמות',
        type: 'error',
      });
      return;
    }

    setLoading(true);
    setSnack(null);

    try {
      // Directly attempt to update password using the current session
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        // Show the REAL Supabase error, no custom "link expired" message here
        setSnack({
          message:
            error.message ||
            t('auth.resetPasswordError') ||
            'לא ניתן לעדכן את הסיסמה. נסה שוב מאוחר יותר.',
          type: 'error',
        });
        return;
      }

      setSnack({
        message:
          t('auth.resetPasswordSuccess') ||
          'הסיסמה עודכנה בהצלחה. אפשר להתחבר מחדש.',
        type: 'success',
      });

      await supabase.auth.signOut();

      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
    } catch (err: any) {
      console.error('[ResetPassword] unexpected error:', err);
      setSnack({
        message:
          err?.message ||
          t('auth.resetPasswordError') ||
          'לא ניתן לעדכן את הסיסמה. נסה שוב מאוחר יותר.',
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
            {t('auth.resetPasswordTitle') || 'איפוס סיסמה'}
          </Text>
          <Text variant="bodyMedium" style={[styles.description, rtlText]}>
            {t('auth.resetPasswordDescription') ||
              'הזן סיסמה חדשה ואשר אותה. כדאי לבחור סיסמה חזקה ובטוחה.'}
          </Text>

          <TextInput
            label={t('auth.newPassword') || 'סיסמה חדשה'}
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
            style={styles.input}
            disabled={loading}
            right={
              <TextInput.Icon
                icon={passwordVisible ? 'eye-off' : 'eye'}
                onPress={() => setPasswordVisible((prev) => !prev)}
                forceTextInputFocus={false}
              />
            }
          />

          <TextInput
            label={t('auth.confirmPassword') || 'אימות סיסמה'}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            mode="outlined"
            secureTextEntry={!confirmVisible}
            autoCapitalize="none"
            style={styles.input}
            disabled={loading}
            right={
              <TextInput.Icon
                icon={confirmVisible ? 'eye-off' : 'eye'}
                onPress={() => setConfirmVisible((prev) => !prev)}
                forceTextInputFocus={false}
              />
            }
          />

          <Button
            mode="contained"
            onPress={handleUpdatePassword}
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            {t('auth.updatePasswordButton') || 'עדכן סיסמה'}
          </Button>

          <Button
            mode="text"
            onPress={() => router.replace('/(auth)/login')}
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


