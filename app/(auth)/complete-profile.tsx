import React, { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { TextInput, Button, Text, Snackbar, HelperText, Checkbox } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'expo-router';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { persistProfileToSupabase } from '@/lib/supabase/mutations/profiles';
import { useProfile } from '@/lib/hooks/useProfile';
import { TERMS_HASH } from '@/lib/constants/legal';

export default function CompleteProfileScreen() {
  const { user, markProfileAsComplete, isProfileComplete } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);

  const [fullName, setFullName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [fullNameError, setFullNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  // Redirect away if there is no authenticated user or profile is already complete
  useEffect(() => {
    if (!user) {
      console.log('[CompleteProfile] No authenticated user, redirecting to login');
      router.replace('/(auth)/login' as any);
      return;
    }

    console.log('[CompleteProfile] profile state from context', {
      isProfileComplete,
      profile,
    });

    if (isProfileComplete) {
      console.log('[CompleteProfile] profile complete, redirecting to main app');
      router.replace('/(tabs)/all' as any);
    }
  }, [user, isProfileComplete, profile, router]);

  // Prefill email from profile or user if available
  useEffect(() => {
    if (profile?.email && profile.email.trim() !== '') {
      setContactEmail(profile.email);
      return;
    }

    if (user?.email && !user.email.endsWith('@privaterelay.appleid.com')) {
      setContactEmail(user.email);
    }
  }, [user, profile]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSave = async () => {
    // Reset errors
    setFullNameError(false);
    setEmailError(false);
    setTermsError(null);
    setError(null);

    // Validate full name
    if (!fullName || fullName.trim() === '') {
      setFullNameError(true);
      setError(t('auth.profile.fullNameRequired') || 'שם מלא נדרש');
      setShowError(true);
      return;
    }

    // Validate contact email
    if (!contactEmail || contactEmail.trim() === '') {
      setEmailError(true);
      setError(t('auth.profile.contactEmailRequired') || 'אימייל קשר נדרש');
      setShowError(true);
      return;
    }

    if (!validateEmail(contactEmail.trim())) {
      setEmailError(true);
      setError(t('auth.profile.invalidEmail') || 'כתובת אימייל לא תקינה');
      setShowError(true);
      return;
    }

    if (!hasAcceptedTerms) {
      const message = 'עליך לאשר את תנאי השימוש ומדיניות הפרטיות לפני המשך';
      setTermsError(message);
      setError(message);
      setShowError(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!user?.id) {
        throw new Error('User not found');
      }

      const nowIso = new Date().toISOString();

      // Persist profile in Supabase (upsert with explicit logging)
      const persistResult = await persistProfileToSupabase({
        userId: user.id,
        profileName: fullName.trim(),
        email: contactEmail.trim(),
        hasAcceptedTerms: true,
        acceptedTermsAt: nowIso,
        termsHash: TERMS_HASH,
      });

      if (persistResult.error) {
        throw persistResult.error;
      }

      // Update AuthContext immediately so it knows the profile is complete
      markProfileAsComplete({
        ...(profile || {}),
        id: user.id,
        profile_name: fullName.trim(),
        email: contactEmail.trim(),
        is_profile_complete: true,
        has_accepted_terms: true,
        accepted_terms_at: nowIso,
        terms_hash: TERMS_HASH,
      });

      // Optionally refetch profile data so hooks see the latest server state
      await refetchProfile();

      // Navigate to main app
      router.replace('/' as any);
    } catch (err: any) {
      console.error('[CompleteProfile] Error updating profile:', err);
      setError(err.message || t('auth.profile.updateFailed') || 'שגיאה בעדכון הפרופיל');
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  // Safety: never render the form if there is no authenticated user
  if (!user) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text variant="headlineLarge" style={[styles.title, rtlText, { textAlign: 'center' }]}>
            {t('auth.profile.completeTitle') || 'השלם את הפרופיל שלך'}
          </Text>

          <Text style={[styles.subtitle, rtlText, { textAlign: 'center' }]}>
            {t('auth.profile.completeSubtitle') || 'אנא הזן את הפרטים הבאים כדי להמשיך'}
          </Text>

          <TextInput
            label={t('auth.profile.fullName') || 'שם מלא'}
            value={fullName}
            onChangeText={(text) => {
              setFullName(text);
              setFullNameError(false);
            }}
            mode="outlined"
            autoCapitalize="words"
            style={styles.input}
            disabled={loading}
            error={fullNameError}
          />
          {fullNameError && (
            <HelperText type="error" visible={fullNameError}>
              {t('auth.profile.fullNameRequired') || 'שם מלא נדרש'}
            </HelperText>
          )}

          <TextInput
            label={t('auth.profile.contactEmail') || 'אימייל קשר'}
            value={contactEmail}
            onChangeText={(text) => {
              setContactEmail(text);
              setEmailError(false);
            }}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.input}
            disabled={loading}
            error={emailError}
          />
          {emailError && (
            <HelperText type="error" visible={emailError}>
              {emailError && contactEmail && !validateEmail(contactEmail.trim())
                ? (t('auth.profile.invalidEmail') || 'כתובת אימייל לא תקינה')
                : (t('auth.profile.contactEmailRequired') || 'אימייל קשר נדרש')}
            </HelperText>
          )}

          <View style={styles.termsContainer}>
          <Checkbox.Android
            status={hasAcceptedTerms ? 'checked' : 'unchecked'}
            onPress={() => {
              setHasAcceptedTerms((prev) => !prev);
              setTermsError(null);
            }}
            disabled={loading}
            color="#2563EB"
            uncheckedColor="#9CA3AF"
          />
            <View style={styles.termsTextContainer}>
              <Text style={[styles.termsText, rtlText]}>
                אני מאשר/ת את{' '}
                <Text
                  style={styles.linkText}
                  onPress={() => Linking.openURL('https://expiryx.app/terms')}
                >
                  תנאי השימוש
                </Text>
                {' '}ו{' '}
                <Text
                  style={styles.linkText}
                  onPress={() => Linking.openURL('https://expiryx.app/privacy')}
                >
                  מדיניות הפרטיות
                </Text>
              </Text>
            </View>
          </View>
          {termsError && (
            <HelperText type="error" visible={!!termsError}>
              {termsError}
            </HelperText>
          )}

          <Button
            mode="contained"
            onPress={handleSave}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            {t('auth.profile.saveAndContinue') || 'שמור והמשך'}
          </Button>
        </View>
      </ScrollView>

      <Snackbar
        visible={showError}
        onDismiss={() => setShowError(false)}
        duration={4000}
        action={{
          label: t('common.close') || 'סגור',
          onPress: () => setShowError(false),
        }}
      >
        {error || t('common.error') || 'שגיאה'}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#FAFBFC',
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 16,
      paddingVertical: 24,
    },
    content: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    title: {
      marginBottom: 8,
      fontSize: 28,
      fontWeight: '700',
      color: '#1F2937',
    },
    subtitle: {
      marginBottom: 24,
      fontSize: 15,
      color: '#6B7280',
      lineHeight: 22,
    },
    input: {
      marginBottom: 4,
      borderRadius: 12,
    },
    termsContainer: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      marginTop: 12,
      marginBottom: 4,
    },
    termsTextContainer: {
      flex: 1,
      marginLeft: isRTL ? 0 : 8,
      marginRight: isRTL ? 8 : 0,
    },
    termsText: {
      fontSize: 13,
      color: '#4B5563',
      flexWrap: 'wrap',
    },
    linkText: {
      color: '#2563EB',
      textDecorationLine: 'underline',
    },
    button: {
      marginTop: 16,
      borderRadius: 12,
      paddingVertical: 4,
    },
    buttonContent: {
      paddingVertical: 8,
    },
    buttonLabel: {
      fontSize: 16,
      fontWeight: '600',
    },
  });
}

