import { LanguageOnboarding } from '@/components/onboarding/LanguageOnboarding';
import { WelcomeExplanationDialog } from '@/components/onboarding/WelcomeExplanationDialog';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LanguageProvider, useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { initPushNotificationsForUser } from '@/lib/notifications/initPushNotifications';
import { useSupabaseClient } from '@/lib/supabase/useSupabaseClient';
import { theme } from '@/lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { ActivityIndicator, PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const RECOVERY_FLAG_KEY = 'password_recovery_active';
// Language and RTL are now managed by LanguageProvider
// It will load the saved language from AsyncStorage and apply layout direction accordingly

// Configure notification handler - simple, all notifications shown normally
// Expiry notifications are now sent server-side as regular Expo push notifications
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log('[Notification Handler] Called with notification:', JSON.stringify(notification, null, 2));
    const result = {
      // old flags (still supported for backwards compatibility)
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // new flags for iOS 17+ so we actually see banners & in the list
      // TypeScript sometimes doesn't know these fields yet, so we cast to any
      shouldShowBanner: true,
      shouldShowList: true,
    };
    console.log('[Notification Handler] Returning:', JSON.stringify(result, null, 2));
    return result as any;
  },
});

// Component to register push notifications when user is authenticated
// This component is completely isolated from auth flow - errors here won't affect authentication
function PushNotificationRegistration() {
  const { user, status, loading } = useAuth();
  const { activeOwnerId } = useActiveOwner();
  const didInitRef = useRef(false);

  useEffect(() => {
    // Only run when:
    // 1. Auth is not loading
    // 2. User exists
    // 3. Status is authenticated
    // 4. We haven't already initialized for this user
    if (loading || !user || status !== 'authenticated' || didInitRef.current) {
      return;
    }

    // Mark as initialized to prevent multiple calls
    didInitRef.current = true;

    // Use setTimeout to ensure this runs after auth is fully settled
    // This prevents any potential interference with the auth flow
    const timeoutId = setTimeout(() => {
      async function initPush() {
        try {
          // Ensure user is still available
          if (!user?.id) {
            return;
          }

          console.log('[Push] Initializing push notifications for user:', user.id);
          const result = await initPushNotificationsForUser(user.id, activeOwnerId ?? null);
          
          if (result.ok) {
            console.log('[Push] Successfully initialized push notifications');
          } else {
            console.log('[Push] Push notifications initialization failed:', result);
          }
        } catch (e) {
          // Catch all errors to ensure nothing affects auth
          console.error('[Push] Error in initPush (non-critical):', e);
          console.error('[Push] Auth flow is unaffected by this error');
        }
      }

      initPush();
    }, 1500); // Small delay to ensure auth and navigation are fully settled

    return () => {
      clearTimeout(timeoutId);
    };
  }, [user, status, loading, activeOwnerId]);

  // Reset ref when user changes
  useEffect(() => {
    if (!user) {
      didInitRef.current = false;
    }
  }, [user]);

  return null;
}

function AppContent() {
  const { languageReady, hasLanguageChoice } = useLanguage();

  if (!languageReady) {
    // Don't render navigation until we know the language state
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!hasLanguageChoice) {
    // First run – force language selection before showing auth/tabs
    return <LanguageOnboarding />;
  }

  return (
    <>
      {/* Push notification registration - runs after auth is fully settled */}
      <PushNotificationRegistration />
      {/* Welcome explanation dialog - shows once on first app open after signup */}
      <WelcomeExplanationDialog />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(paywall)" />
        <Stack.Screen name="scan" />
        <Stack.Screen name="add" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="item" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/quick-delete-products" />
        <Stack.Screen name="(info)" />
        <Stack.Screen name="notifications-history" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);
  const deepLinkListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    // Global listener to log ALL remote notifications
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      console.log(
        '[Notifications] REMOTE notification received (global listener)',
        JSON.stringify(notification, null, 2)
      );
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log(
        '[Notifications] Notification response received (global listener)',
        JSON.stringify(response, null, 2)
      );
    });

    // Listen for notifications received while app is foregrounded
    // Expiry notifications are now sent server-side as regular Expo push notifications
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Notifications] REMOTE notification received', notification);
      console.log('[Notifications] Notification content:', notification.request.content);
      console.log('[Notifications] Notification data:', notification.request.content.data);

      const content = notification.request.content;
      const data = content.data as any;

      // Handle test notification
      if (data?.type === 'test_notification') {
        console.log('[Notifications] Test notification received');
        // Notification handler will display it automatically
        return;
      }

      // Handle expiry notification (support both old and new type names)
      if (data?.type === 'expiry_notification' || data?.type === 'expiry_reminder') {
        console.log('[Notifications] Expiry notification received (type:', data?.type, ')');
        // Notification handler will display it automatically
        return;
      }
    });

    // Listen for user tapping on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      // Optionally navigate to items list if it's an expiry notification
      if (data?.ownerId) {
        // Could navigate to items list here if needed
        console.log('[Notification Response] User tapped notification for owner:', data.ownerId);
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []); // Empty dependency array - runs only once on mount

  // Debug listeners for push notification debugging
  useEffect(() => {
    console.log('[Notifications] debug listeners mounted');

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Notifications] REMOTE notification received', notification);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[Notifications] USER tapped notification', response);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  // Helper function to handle recovery URL and create session
  const handleRecoveryUrl = useCallback(
    async (url: string | null) => {
      if (!url) {
        return;
      }

      try {
        // Extract fragment after '#'
        const hashIndex = url.indexOf('#');
        let fragment = '';
        if (hashIndex !== -1) {
          fragment = url.substring(hashIndex + 1);
        }

        const params = new URLSearchParams(fragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const code = params.get('code');
        const type = params.get('type');

        // Check if this is a recovery URL
        // Recovery URLs typically have type='recovery' or contain access_token/refresh_token in the fragment
        const isRecovery = type === 'recovery' || (accessToken && refreshToken && url.includes('reset-password'));
        
        if (isRecovery && Platform.OS !== 'web') {
          // Set flag to indicate we're processing a recovery URL
          await AsyncStorage.setItem(RECOVERY_FLAG_KEY, 'true');
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('[DeepLink] Error setting session:', error);
          }
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) {
            console.error('[DeepLink] Error exchanging code for session:', error);
          }
        }
      } catch (error) {
        console.error('[DeepLink] handleRecoveryUrl error:', error);
      }
    },
    []
  );

  // Deep link handling for native platforms only
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const checkInitialURL = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          await handleRecoveryUrl(initialUrl);
        }
      } catch (error: any) {
        console.error('[DeepLink] Error getting initial URL:', error);
      }
    };

    checkInitialURL();

    deepLinkListener.current = Linking.addEventListener('url', async (event) => {
      await handleRecoveryUrl(event.url);
    });

    return () => {
      if (deepLinkListener.current) {
        deepLinkListener.current.remove();
      }
    };
  }, [handleRecoveryUrl]);

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <PaperProvider theme={theme}>
            <StatusBar style="auto" />
            <AppContent />
          </PaperProvider>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

