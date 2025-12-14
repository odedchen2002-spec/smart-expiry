import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { TextInput, Button, Text, Snackbar, HelperText } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'expo-router';
import { getRtlTextStyles, getRtlContainerStyles, getRTLMargin } from '@/lib/utils/rtlStyles';
import { persistProfileToSupabase } from '@/lib/supabase/mutations/profiles';
import { TERMS_HASH } from '@/lib/constants/legal';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [username, setUsername] = useState('');
  const [isTermsAccepted, setIsTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);

  const { signUp } = useAuth();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);

  const handleSignUp = async () => {
    if (!email || !password) {
      setError(t('auth.error.invalidEmail'));
      setShowError(true);
      return;
    }

    if (password.length < 6) {
      setError(t('auth.error.weakPassword'));
      setShowError(true);
      return;
    }

    if (!username || !username.trim()) {
      setError(t('auth.usernameRequired'));
      setShowError(true);
      return;
    }

    if (!isTermsAccepted) {
      setTermsError(true);
      return;
    }

    setTermsError(false);

    setLoading(true);
    setError(null);

    const result = await signUp({
      email,
      password,
      username: username.trim(),
      hasAcceptedTerms: isTermsAccepted,
    });

    console.log('SignUp result received:', {
      hasUser: !!result.user,
      hasSession: !!result.session,
      hasError: !!result.error,
      errorMessage: result.error?.message,
      requiresEmailVerification: (result as any).requiresEmailVerification,
    });

    if (result.error) {
      // Check for specific username errors
      const errorMessage = result.error.message || '';
      if (errorMessage.includes('already exists') || errorMessage.includes('Username already exists')) {
        setError(t('auth.usernameExists'));
      } else if (errorMessage.includes('required') || errorMessage.includes('Username is required')) {
        setError(t('auth.usernameRequired'));
      } else {
        setError(result.error.message || t('auth.error.emailExists'));
      }
      setShowError(true);
      setLoading(false);
    } else {
      // Check if email verification is required
      // The signUp function returns requiresEmailVerification: true when user is created but session is null
      const hasUser = !!result.user;
      const hasSession = !!result.session;
      // Access requiresEmailVerification from the result (it's returned but not in the type)
      const requiresEmailVerification = (result as any).requiresEmailVerification === true || (hasUser && !hasSession);
      
      console.log('Signup result:', {
        hasUser,
        hasSession,
        requiresEmailVerification: (result as any).requiresEmailVerification,
        requiresVerification: requiresEmailVerification,
        user: result.user?.id,
      });

      // If we have a user and the signup form already has full profile data,
      // persist a complete profile row immediately so CompleteProfile is not needed.
      if (hasUser && username.trim() && isTermsAccepted) {
        const nowIso = new Date().toISOString();
        const userId = result.user!.id;

        console.log('[Auth] Persisting profile on sign-up from SignUpScreen', {
          userId,
          username: username.trim(),
          email: email.trim(),
          isTermsAccepted,
        });

        try {
          const persistResult = await persistProfileToSupabase({
            userId,
            profileName: username.trim(),
            email: email.trim(),
            hasAcceptedTerms: true,
            acceptedTermsAt: nowIso,
            termsHash: TERMS_HASH,
          });

          if (persistResult.error) {
            console.log('[Auth] Failed to persist profile on sign-up', persistResult.error);
          } else {
            console.log('[Auth] Successfully persisted profile on sign-up', persistResult.data);
          }
        } catch (persistError) {
          console.log('[Auth] Exception while persisting profile on sign-up', persistError);
        }
      } else {
        console.log(
          '[Auth] Sign-up without full profile data (username / terms missing), CompleteProfile may be needed later'
        );
      }

      setLoading(false);
      
      if (requiresEmailVerification) {
        // Show verification email message
        const message = t('auth.verificationEmailSent');
        console.log('Email verification required - showing message');
        setVerificationMessage(message);
        setShowVerificationMessage(true);
        // Don't navigate - stay on signup screen to show the message
        // Navigation will happen when user closes the snackbar
      } else if (hasSession) {
        // User has session, navigate to tabs
        // Show warning if terms acceptance save failed
        if ((result as any).warning) {
          setWarning((result as any).warning);
          setShowWarning(true);
        }
        router.replace('/(tabs)' as any);
      } else {
        // Edge case: user created but no session and no explicit verification flag
        // Show verification message as a safety measure
        console.log('Edge case: user created but no session - showing verification message');
        setVerificationMessage(t('auth.verificationEmailSent'));
        setShowVerificationMessage(true);
      }
    }
  };

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
          <Text variant="headlineLarge" style={[styles.title, getRtlTextStyles(isRTL, 'center')]}>
            {t('auth.signup')}
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

          <TextInput
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
            autoComplete="password"
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
            label={t('auth.usernameOrBusiness')}
            value={username}
            onChangeText={setUsername}
            mode="outlined"
            autoCapitalize="none"
            style={styles.input}
            disabled={loading}
            placeholder={t('auth.usernameOrBusiness')}
          />

          <View style={styles.termsContainer}>
            <View style={styles.checkboxRow}>
              <View style={styles.checkboxLabel}>
                <Text 
                  style={[styles.checkboxText, rtlText]}
                >
                  {t('auth.acceptTermsPrefix')}{' '}
                  <Text
                    style={styles.linkText}
                    onPress={() => {
                      if (!loading) {
                        router.push('/(info)/terms' as any);
                      }
                    }}
                  >
                    {t('auth.termsOfUse')}
                  </Text>
                  {' '}{t('auth.and')}{' '}
                  <Text
                    style={styles.linkText}
                    onPress={() => {
                      if (!loading) {
                        router.push('/(info)/privacy' as any);
                      }
                    }}
                  >
                    {t('auth.privacyPolicy')}
                  </Text>
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (!loading) {
                    setIsTermsAccepted(!isTermsAccepted);
                    setTermsError(false);
                  }
                }}
                disabled={loading}
                style={({ pressed }) => [
                  styles.checkbox,
                  isTermsAccepted && styles.checkboxChecked,
                  pressed && styles.checkboxPressed,
                ]}
              >
                {isTermsAccepted && (
                  <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
            {termsError && (
              <HelperText type="error" visible={termsError} style={[styles.termsError, rtlText]}>
                {t('auth.termsError')}
              </HelperText>
            )}
          </View>

          <Button
            mode="contained"
            onPress={handleSignUp}
            loading={loading}
            disabled={
              loading ||
              !email ||
              !password ||
              !username.trim() ||
              !isTermsAccepted ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            }
            style={styles.button}
          >
            {loading ? t('auth.signingUp') : t('auth.signup')}
          </Button>

          <Button
            mode="text"
            onPress={() => router.back()}
            disabled={loading}
            style={styles.linkButton}
          >
            {t('auth.hasAccount')}
          </Button>
        </View>
      </ScrollView>

      <Snackbar
        visible={showError}
        onDismiss={() => setShowError(false)}
        duration={3000}
        action={{
          label: t('common.close'),
          onPress: () => setShowError(false),
        }}
      >
        {error || t('common.error')}
      </Snackbar>

      <Snackbar
        visible={showWarning}
        onDismiss={() => setShowWarning(false)}
        duration={5000}
        action={{
          label: t('common.close'),
          onPress: () => setShowWarning(false),
        }}
      >
        {warning}
      </Snackbar>

      <Snackbar
        visible={showVerificationMessage}
        onDismiss={() => {
          setShowVerificationMessage(false);
          setTimeout(() => {
            router.replace('/(auth)/login' as any);
          }, 100);
        }}
        duration={8000}
        style={{ zIndex: 9999 }}
        action={{
          label: t('common.close') || 'סגור',
          onPress: () => {
            setShowVerificationMessage(false);
            setTimeout(() => {
              router.replace('/(auth)/login' as any);
            }, 100);
          },
        }}
      >
        {verificationMessage || t('auth.verificationEmailSent')}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
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
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    marginTop: 16,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    marginBottom: 12,
    borderRadius: 12,
  },
  button: {
    marginTop: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  linkButton: {
    marginTop: 16,
  },
  termsContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
  },
  checkboxLabel: {
    flex: 1,
    paddingTop: 2,
    minWidth: 0,
    paddingEnd: 12,
  },
  checkboxText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#212121',
    fontWeight: '400',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#757575',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#42A5F5',
    borderColor: '#42A5F5',
  },
  checkboxPressed: {
    opacity: 0.7,
  },
  linkText: {
    color: '#42A5F5',
    textDecorationLine: 'underline',
  },
  termsError: {
    marginTop: 4,
    marginStart: 0,
  },
  });
}

