/**
 * Login Screen with Google OAuth Integration
 * 
 * Google login disabled temporarily for Expo Go. Will be re-enabled for EAS Dev Build.
 * 
 * GOOGLE OAUTH FLOW (when re-enabled):
 * 
 * STEP 1: User taps "Sign in with Google" button
 *   - handleGoogleSignIn() is called
 *   - Uses Expo proxy URL format for redirect URL (works with Expo Go)
 *   - Calls supabase.auth.signInWithOAuth() with the Expo proxy redirect URL
 *   - Uses WebBrowser.openAuthSessionAsync() to open browser and handle OAuth flow
 * 
 * STEP 2: User completes authentication in browser
 *   - User sees Google's login page
 *   - User enters credentials and grants permission
 *   - Google redirects to Expo proxy, which redirects back to the app
 * 
 * STEP 3: App receives OAuth result
 *   - WebBrowser.openAuthSessionAsync() returns the result URL
 *   - Extract the 'code' parameter from the result URL
 *   - Call supabase.auth.exchangeCodeForSession({ code }) - this creates the session
 * 
 * STEP 4: Navigate to home screen
 *   - After successful exchangeCodeForSession, check for session
 *   - If session exists, navigate to /(tabs)/all
 *   - Session is now created and user is logged in
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActivityIndicator, Button, Snackbar, Text, TextInput } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// Google login disabled temporarily for Expo Go. Will be re-enabled for EAS Dev Build.
// import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase/client';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { useRouter } from 'expo-router';
import { handleContactSupport } from '@/lib/utils/support';

// Import logo image
const logoImage = require('../../assets/images/logo.png');

// Get screen dimensions for responsive sizing
const { width: screenWidth } = Dimensions.get('window');

// Calculate responsive logo size
// Use 18% of screen width, with min 80px and max 140px
// This ensures the logo looks good on all device sizes (phones, tablets, etc.)
const LOGO_SIZE = Math.min(Math.max(screenWidth * 0.18, 80), 140);

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current; // Start visible to avoid white screen
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();
  const hasCheckedSessionRef = useRef(false); // Prevent infinite loop
  const isNavigatingRef = useRef(false); // Prevent multiple navigation attempts

  const { signIn, signInWithGoogle, signInWithApple, user: authUser, status: authStatus } = useAuth();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  // Removed checkingSession state - always show login screen immediately

  /**
   * Check if user is already logged in (has an active session)
   * This runs when the login screen first loads
   */
  useEffect(() => {
    // Prevent multiple checks
    if (hasCheckedSessionRef.current) {
      return;
    }
    hasCheckedSessionRef.current = true;

    // Animation for the login screen fade-in
    // Start from 1 to avoid white screen flash
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Check if user already has an active session
    const checkExistingSession = async () => {
      try {
        // Prevent multiple navigation attempts
        if (isNavigatingRef.current) {
          return;
        }
        
        // Call Supabase to get the current session immediately
        // This checks if the user is already logged in
        const { data: sessionData } = await supabase.auth.getSession();
        
        // We intentionally DO NOT auto-navigate here to avoid login/root redirect loops.
        // AuthContext + root navigation will handle redirecting based on session state.
      } catch (error) {
        // If checking session fails, just log the error and show login screen
        console.error('[Login Screen] Error checking session:', error);
      }
    };

    // Run the session check when the login screen loads
    checkExistingSession();
  }, [fadeAnim]);

  // Google login disabled temporarily for Expo Go. Will be re-enabled for EAS Dev Build.
  // Deep link listener removed - was using WebBrowser.openAuthSessionAsync with Expo proxy

  /**
   * Listen for app state changes to check for session when app becomes active
   * This is a backup check in case the deep link listener doesn't fire
   */
  useEffect(() => {
    // Function to check session when app becomes active
    const checkSessionOnAppActive = async () => {
      try {
        // Prevent multiple navigation attempts
        if (isNavigatingRef.current) {
          return;
        }
        
        // Call Supabase to get the current session
        // This checks if user completed OAuth login while in browser
        const { data: sessionData } = await supabase.auth.getSession();
        
        // גם כאן לא נעשה redirect אוטומטי כדי למנוע לולאה אינסופית.
        if (sessionData.session) {
          // Stop loading indicator if it was running
          setGoogleLoading(false);
        }
      } catch (error) {
        console.error('[Login Screen] Error checking session when app became active:', error);
      }
    };

    // Listen for app state changes
    // AppState tells us when the app moves between foreground/background
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // When app becomes 'active', it means it came back to foreground
      // This happens after user returns from browser (after OAuth login)
      if (nextAppState === 'active') {
        // Small delay to ensure OAuth callback has processed
        setTimeout(() => {
          checkSessionOnAppActive();
        }, 1000);
      }
    });

    // Cleanup: Remove the listener when component unmounts
    return () => {
      subscription.remove();
    };
  }, []);

  // Navigate to main app when user becomes authenticated (backup for Google/Apple login)
  // This is a fallback in case explicit navigation in handleGoogleSignIn doesn't work
  useEffect(() => {
    // Only navigate if:
    // 1. We have a user from AuthContext
    // 2. Auth status is authenticated
    // 3. We're not already navigating
    // 4. We're not in the middle of a regular email/password login
    // 5. We're not currently loading (Google/Apple login in progress)
    if (authUser && authStatus === 'authenticated' && !isNavigatingRef.current && !loading && !googleLoading && !appleLoading) {
      isNavigatingRef.current = true;
      setTimeout(() => {
        router.replace('/' as any);
      }, 100);
    }
  }, [authUser, authStatus, loading, googleLoading, appleLoading, router]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 80,
      useNativeDriver: true,
    }).start();
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError(t('auth.error.invalidCredentials'));
      setShowError(true);
      setShowForgot(true);
      return;
    }

    setLoading(true);
    setError(null);

    const { error: signInError, user } = await signIn({ email, password });

    if (signInError) {
      if (signInError.message === 'ACCOUNT_DELETED') {
        Alert.alert(
          t('common.error') || 'שגיאה',
          t('auth.error.accountDeleted') || 'החשבון הזה נמחק מהמערכת. אם תרצה, תוכל ליצור חשבון חדש.'
        );
        setError(t('auth.error.accountDeleted') || 'החשבון הזה נמחק מהמערכת. אם תרצה, תוכל ליצור חשבון חדש.');
        setShowForgot(false);
      } else {
        setError(signInError.message || t('auth.error.invalidCredentials'));
        setShowForgot(true);
      }
      setShowError(true);
      setLoading(false);
      return;
    }

    if (!user?.id) {
      setError(t('common.error'));
      setShowError(true);
      setLoading(false);
      setShowForgot(true);
      return;
    }

    setShowForgot(false);
    setLoading(false);
    setTimeout(() => {
      router.replace('/' as any);
    }, 100);
  };

  /**
   * Handle Google Sign-In button press
   */
  const handleGoogleSignIn = async () => {
    if (googleLoading) return;

    try {
      setGoogleError(null);
      setGoogleLoading(true);

      const result = await signInWithGoogle();

      if (result?.hasError && result.error) {
        if (result.error.message === 'ACCOUNT_DELETED') {
          Alert.alert(
            t('common.error') || 'שגיאה',
            t('auth.error.accountDeleted') || 'החשבון הזה נמחק מהמערכת. אם תרצה, תוכל ליצור חשבון חדש.'
          );
          setGoogleError(t('auth.error.accountDeleted') || 'החשבון הזה נמחק מהמערכת. אם תרצה, תוכל ליצור חשבון חדש.');
        } else if (result.error.message === 'Google sign-in was cancelled') {
          return;
        } else {
          setGoogleError(t('auth.googleSignInFailed') || 'הייתה בעיה בהתחברות עם Google, נסה שוב.');
        }
        return;
      }

      setGoogleError(null);
      // Navigation will be handled by index.tsx based on needsProfileCompletion
      await new Promise(resolve => setTimeout(resolve, 300));
      router.replace('/' as any);
    } catch (err: any) {
      console.error('[Login] Google sign-in failed:', err);
      setGoogleError(t('auth.googleSignInFailed') || 'הייתה תקלה בהתחברות עם Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  /**
   * Handle Apple Sign-In button press
   */
  const handleAppleSignIn = async () => {
    if (appleLoading) return;

    try {
      setAppleError(null);
      setAppleLoading(true);

      const result = await signInWithApple();

      if (result?.hasError && result.error) {
        if (result.error.message === 'ACCOUNT_DELETED') {
          Alert.alert(
            t('common.error') || 'שגיאה',
            t('auth.error.accountDeleted') || 'החשבון הזה נמחק מהמערכת. אם תרצה, תוכל ליצור חשבון חדש.'
          );
          setAppleError(t('auth.error.accountDeleted') || 'החשבון הזה נמחק מהמערכת. אם תרצה, תוכל ליצור חשבון חדש.');
        } else if (result.error.message === 'Apple sign-in was cancelled') {
          return;
        } else {
          setAppleError(t('auth.appleSignInFailed') || 'הייתה בעיה בהתחברות עם Apple, נסה שוב.');
        }
        return;
      }

      setAppleError(null);
      // Navigation will be handled by index.tsx based on needsProfileCompletion
      await new Promise(resolve => setTimeout(resolve, 300));
      router.replace('/' as any);
    } catch (err: any) {
      console.error('[Login] Apple sign-in failed:', err);
      setAppleError(t('auth.appleSignInFailed') || 'הייתה תקלה בהתחברות עם Apple.');
    } finally {
      setAppleLoading(false);
    }
  };

  // Don't show loading screen - always show login UI immediately
  // Session check happens in background and will redirect if needed

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.supportButtonContainer}>
        <Button
          mode="text"
          onPress={handleContactSupport}
          disabled={loading}
          labelStyle={[styles.supportButtonLabel, rtlText]}
          compact
          textColor="#757575"
        >
          {t('settings.contactSupport') || 'צור קשר'}
        </Button>
      </View>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 20) + 40, paddingBottom: Math.max(insets.bottom, 20) }]} 
          keyboardShouldPersistTaps="handled"
        >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              {logoImage ? (
                <View style={styles.logoWrapper}>
                  <Image
                    source={logoImage}
                    style={styles.logo}
                    resizeMode="cover"
                    // Ensure sharp rendering on all devices
                    // These props help maintain image quality across different screen densities
                  />
                </View>
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>EX</Text>
                </View>
              )}
            </View>
            <Text style={[styles.welcome, rtlTextCenter]}>{t('auth.welcomeTitle') || '!ברוך הבא'}</Text>
            <Text style={[styles.subtitle, rtlTextCenter]}>
              {t('auth.welcomeSubtitle') || 'התחבר כדי להמשיך'}
            </Text>
          </View>

          <View style={styles.card}>
            <TextInput
              label={t('auth.email')}
              placeholder={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={styles.input}
              disabled={loading}
              left={<TextInput.Icon icon="email-outline" />}
              theme={{
                colors: { 
                  background: '#FAFAFA',
                  primary: '#42A5F5',
                  outline: '#E5E7EB',
                },
              }}
            />

            <TextInput
              label={t('auth.password')}
              placeholder={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoComplete="password"
              style={styles.input}
              disabled={loading}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={passwordVisible ? 'eye-off' : 'eye'}
                  onPress={() => setPasswordVisible((prev) => !prev)}
                  forceTextInputFocus={false}
                />
              }
              theme={{
                colors: { 
                  background: '#FAFAFA',
                  primary: '#42A5F5',
                  outline: '#E5E7EB',
                },
              }}
            />

            {showForgot && (
              <Button
                mode="text"
                onPress={() => router.push('/(auth)/forgot-password')}
                disabled={loading}
                labelStyle={[styles.forgotLabel, rtlTextCenter]}
              >
                {t('auth.forgotPasswordLink') || 'שכחתי את הסיסמה'}
              </Button>
            )}

            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Button
                mode="contained"
                onPress={handleLogin}
                loading={loading}
                disabled={loading}
                style={styles.button}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
                buttonColor="#42A5F5"
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
              >
                {loading ? t('auth.signingIn') : t('auth.login')}
              </Button>
            </Animated.View>
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>{t('auth.or') || 'או'}</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.card}>
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading}
              style={styles.googleButton}
              activeOpacity={0.8}
            >
              <View style={[styles.googleButtonContent, rtlContainer]}>
                {googleLoading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    {/* Google "G" Logo */}
                    <View style={styles.googleLogoContainer}>
                      <Image
                        source={{
                          uri: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png',
                        }}
                        style={styles.googleLogoImage}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={[styles.googleButtonLabel, rtlText]}>
                      {t('auth.signInWithGoogle') || 'התחבר עם Google'}
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
            {googleError && (
              <Text style={[styles.googleErrorText, rtlText]}>
                {googleError}
              </Text>
            )}

            {/* Apple Sign-In Button */}
            <TouchableOpacity
              onPress={handleAppleSignIn}
              disabled={loading || appleLoading}
              style={styles.appleButton}
              activeOpacity={0.8}
            >
              <View style={[styles.appleButtonContent, rtlContainer]}>
                {appleLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    {/* Apple Logo */}
                    <View style={styles.appleLogoContainer}>
                      <MaterialCommunityIcons 
                        name="apple" 
                        size={20} 
                        color="#FFFFFF" 
                      />
                    </View>
                    <Text style={[styles.appleButtonLabel, rtlText]}>
                      {t('auth.signInWithApple') || 'התחבר עם Apple'}
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
            {appleError && (
              <Text style={[styles.appleErrorText, rtlText]}>
                {appleError}
              </Text>
            )}
          </View>

          <View style={styles.signupRow}>
            <Text style={[styles.signupText, rtlText]}>
              {t('auth.noAccount') || 'אין לך חשבון?'}
            </Text>
            <Button
              mode="text"
              onPress={() => router.push('/(auth)/signup')}
              disabled={loading}
              labelStyle={styles.signupButtonLabel}
              compact
            >
              {t('auth.signup') || 'הרשמה'}
            </Button>
          </View>
        </Animated.View>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: '6%', // Use percentage for responsive padding
    paddingVertical: 24,
    minHeight: '100%',
    maxWidth: 600, // Prevent content from being too wide on tablets
    alignSelf: 'center',
    width: '100%',
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 20,
    alignItems: 'center',
  },
  supportButtonContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingTop: 50,
    alignItems: 'flex-end',
  },
  supportButtonLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  header: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  logoContainer: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 20,
    overflow: 'hidden',
    // Add subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    // Ensure sharp rendering on all devices
    // The resizeMode="cover" ensures the image fills the rounded container
  },
  logoPlaceholder: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 20,
    backgroundColor: '#42A5F5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#42A5F5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 20,
  },
  welcome: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '400',
    lineHeight: 22,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F0F0',
  },
  input: {
    marginBottom: 4,
    borderRadius: 14,
    alignSelf: 'stretch',
    backgroundColor: '#FAFAFA',
  },
  button: {
    marginTop: 12,
    borderRadius: 14,
    shadowColor: '#42A5F5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonContent: {
    paddingVertical: 10,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  forgotLabel: {
    fontSize: 14,
    color: '#42A5F5',
    fontWeight: '600',
    marginTop: 4,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    width: '100%',
    marginVertical: 4,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  signupText: {
    color: '#6B7280',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '400',
  },
  signupButtonLabel: {
    color: '#42A5F5',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  googleButton: {
    marginTop: 0,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  googleLogoContainer: {
    minWidth: 20,
    minHeight: 20,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: 12,
    flexShrink: 0,
  },
  googleLogoImage: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  googleButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    letterSpacing: 0.2,
  },
  googleErrorText: {
    fontSize: 13,
    color: '#B00020',
    marginTop: 8,
    textAlign: 'center',
    alignSelf: 'center',
    paddingHorizontal: 8,
  },
  appleButton: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#000000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  appleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  appleLogoContainer: {
    minWidth: 20,
    minHeight: 20,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: 12,
    flexShrink: 0,
  },
  appleButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  appleErrorText: {
    fontSize: 13,
    color: '#B00020',
    marginTop: 8,
    textAlign: 'center',
    alignSelf: 'center',
    paddingHorizontal: 8,
  },
});

