// Polyfill for crypto.getRandomValues() required by uuid package in React Native
import 'react-native-get-random-values';

import { OfflineBanner } from '@/components/OfflineBanner';
import { LanguageOnboarding } from '@/components/onboarding/LanguageOnboarding';
import { WelcomeExplanationDialog } from '@/components/onboarding/WelcomeExplanationDialog';
import { SplashScreen } from '@/components/SplashScreen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CacheProvider } from '@/context/CacheContext';
import { CategoriesProvider } from '@/context/CategoriesContext';
import { CategoryProductsProvider } from '@/context/CategoryProductsContext';
import { DatePickerStyleProvider } from '@/context/DatePickerStyleContext';
import { LanguageProvider, useLanguage } from '@/context/LanguageContext';
import { QueryProvider } from '@/providers/QueryProvider';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { disconnectIAP, initializeIAP } from '@/lib/iap/iapService';
import { initPushNotificationsForUser } from '@/lib/notifications/initPushNotifications';
// Offline queue removed - now handled by Outbox pattern in QueryProvider
import { supabase } from '@/lib/supabase/client';
import { theme } from '@/lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Performance timing - app start time (module load)
const APP_START_TIME = Date.now();
const PERF_ENABLED = __DEV__;
const perfLog = (label: string) => {
  if (!PERF_ENABLED) return;
  console.log(`[PERF] ${label}: ${Date.now() - APP_START_TIME}ms from app start`);
};

// Log module load time
if (PERF_ENABLED) {
  console.log(`[PERF] _layout.tsx module loaded at ${new Date().toISOString()}`);
}

const RECOVERY_FLAG_KEY = 'password_recovery_active';
const RECOVERY_PROCESSED_TIMESTAMP_KEY = 'recovery_processed_timestamp';
const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes - don't process same recovery session again within this time
// Language and RTL are now managed by LanguageProvider
// It will load the saved language from AsyncStorage and apply layout direction accordingly

// Configure notification handler - simple, all notifications shown normally
// Expiry notifications are now sent server-side as regular Expo push notifications
// IMPORTANT: This must be called at module load time (outside any component)
// to ensure notifications are handled even when app is in foreground
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

// Set up Android notification channel at module load time
// This ensures the channel exists before any notifications arrive
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'התראות תפוגה',
    description: 'התראות על מוצרים שעומדים לפוג',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B6B',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  }).then(() => {
    console.log('[Notifications] Android notification channel created');
  }).catch((error) => {
    console.warn('[Notifications] Error creating Android notification channel:', error);
  });
}

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

// Component to enforce plan limits on app startup
// Ensures items are locked/unlocked according to subscription tier
function PlanLimitEnforcement() {
  const { user, status, loading: authLoading } = useAuth();
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  const didEnforceRef = useRef(false);

  useEffect(() => {
    // Only run when:
    // 1. Auth is not loading
    // 2. User exists and is authenticated
    // 3. ActiveOwnerId is available
    // 4. We haven't already enforced for this session
    if (authLoading || ownerLoading || !user || status !== 'authenticated' || !activeOwnerId || didEnforceRef.current) {
      return;
    }

    // Mark as enforced
    didEnforceRef.current = true;

    // Delay to ensure all data is loaded
    const timeoutId = setTimeout(async () => {
      try {
        console.log('[PlanLimit] Enforcing plan limits on app startup for owner:', activeOwnerId);
        const { enforcePlanLimitAfterCreate } = await import('@/lib/supabase/mutations/enforcePlanLimits');
        await enforcePlanLimitAfterCreate(activeOwnerId);
        console.log('[PlanLimit] Plan limits enforced successfully');

        // Notify all screens to refresh their data (this will show locked items)
        console.log('[PlanLimit] Triggering UI refresh...');
        const { itemEvents } = await import('@/lib/events/itemEvents');
        itemEvents.emit();
        
        // Also invalidate cache to force fresh data fetch
        await import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
          // Set a flag that will trigger cache invalidation
          AsyncStorage.setItem('plan_limits_changed', Date.now().toString());
        });
      } catch (error) {
        console.error('[PlanLimit] Error enforcing plan limits (non-critical):', error);
      }
    }, 2000); // 2 second delay to ensure everything is loaded

    return () => {
      clearTimeout(timeoutId);
    };
  }, [user, status, authLoading, activeOwnerId, ownerLoading]);

  // Reset ref when user changes
  useEffect(() => {
    if (!user) {
      didEnforceRef.current = false;
    }
  }, [user]);

  return null;
}

// Component to initialize In-App Purchases
// Connects to App Store / Play Store and fetches localized pricing
function IAPInitialization() {
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    // Initialize IAP in the background
    initializeIAP().then((success) => {
      if (success) {
        console.log('[IAP] Initialized successfully');
      } else {
        console.log('[IAP] Failed to initialize (may not be available on this device)');
      }
    }).catch((error) => {
      console.warn('[IAP] Initialization error:', error);
    });

    // Offline operations now handled by Outbox in QueryProvider

    // Clean up IAP connection when app is terminated
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Don't disconnect immediately - just log
        console.log('[IAP] App going to background');
      }
    });

    return () => {
      subscription.remove();
      disconnectIAP();
      cleanupOfflineQueue();
    };
  }, []);

  return null;
}

function AppContent() {
  const { languageReady, hasLanguageChoice } = useLanguage();
  const didLogRef = useRef(false);

  // Log when language is ready
  useEffect(() => {
    if (languageReady && !didLogRef.current) {
      didLogRef.current = true;
      perfLog('Language ready, navigation starting');
    }
  }, [languageReady]);

  if (!languageReady) {
    // Don't render navigation until we know the language state
    // Show splash screen - now with fast/minimal animations
    return <SplashScreen />;
  }

  if (!hasLanguageChoice) {
    // First run – force language selection before showing auth/tabs
    perfLog('Showing language onboarding (first run)');
    return <LanguageOnboarding />;
  }

  return (
    <>
      {/* Push notification registration - runs after auth is fully settled */}
      <PushNotificationRegistration />
      {/* Plan limit enforcement - ensures items are locked/unlocked on app startup */}
      <PlanLimitEnforcement />
      {/* Initialize IAP and fetch localized pricing from App Store / Play Store */}
      <IAPInitialization />
      {/* Welcome explanation dialog - shows once on first app open after signup */}
      <WelcomeExplanationDialog />
      {/* Offline banner - shows when device is offline */}
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(paywall)" />
        <Stack.Screen name="add" />
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
  const router = useRouter();
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
          console.log('[DeepLink] Detected recovery URL, checking if should process...');
          console.log('[DeepLink] Incoming URL (first 100 chars):', url.substring(0, 100));
          
          // Check if we've recently processed a recovery URL (within the last 5 minutes)
          // This is better than comparing URLs because tokens change between attempts
          const lastProcessedTimestamp = await AsyncStorage.getItem(RECOVERY_PROCESSED_TIMESTAMP_KEY);
          const now = Date.now();
          
          if (lastProcessedTimestamp) {
            const timeSinceLastRecovery = now - parseInt(lastProcessedTimestamp);
            console.log('[DeepLink] Last recovery was', Math.round(timeSinceLastRecovery / 1000), 'seconds ago');

            if (timeSinceLastRecovery < RECOVERY_COOLDOWN_MS) {
              // Check if user has a valid session - if so, this is definitely a stale recovery
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              const { data: { user: currentUser } } = await supabase.auth.getUser();
              
              // CRITICAL: Only redirect if user is truly authenticated with BOTH session AND user
              // This prevents logout flow from being interrupted by stale deep links
              // During logout, session might still exist briefly but user is already cleared
              if (currentSession && currentUser) {
                console.log('[DeepLink] ✅ Recovery already processed recently AND user has session + user, skipping');
                console.log('[DeepLink] Not processing recovery URL - user stays authenticated');
                // Navigate to home to prevent expo-router from navigating to reset-password
                router.replace('/(tabs)/home');
                return;
              } else {
                console.log('[DeepLink] ✅ Recovery already processed but no session/user (logout?), allowing re-process');
              }
            } else {
              console.log('[DeepLink] Recovery cooldown expired, this is a new recovery attempt');
            }
          } else {
            console.log('[DeepLink] No recent recovery found in storage');
          }
          
          // CRITICAL: Determine if this is a stale recovery URL or a new legitimate one
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          console.log('[DeepLink] Current session exists:', !!currentSession);
          
          // Check if recovery flag exists and is recent
          const recoveryFlagValue = await AsyncStorage.getItem(RECOVERY_FLAG_KEY);
          const isRecentRecovery = recoveryFlagValue && !isNaN(parseInt(recoveryFlagValue)) 
            && (Date.now() - parseInt(recoveryFlagValue)) < 30000;
          console.log('[DeepLink] Recent recovery flag exists:', isRecentRecovery);
          
          // Determine if this recovery URL is stale (from a previous recovery that's already done)
          // A recovery URL is stale if:
          // 1. User has a current session AND
          // 2. No recent recovery flag exists (meaning not in active recovery) AND
          // 3. The access_token in URL matches the current session (same session = stale)
          const tokensMatchCurrentSession = currentSession && accessToken && 
                                          currentSession.access_token === accessToken;
          
          if (currentSession && !isRecentRecovery && tokensMatchCurrentSession) {
            // This is a stale recovery URL - user already completed recovery and logged in
            console.log('[DeepLink] Stale recovery URL (tokens match current session), ignoring');
            // Mark this recovery as processed so we don't process it again
            await AsyncStorage.setItem(RECOVERY_PROCESSED_TIMESTAMP_KEY, now.toString());
            return;
          }
          
          // If we reach here, it's either:
          // 1. A NEW recovery URL (different from stored) - should process
          // 2. An active recovery (recent flag exists) - should process
          // 3. No current session - should process
          console.log('[DeepLink] Processing recovery URL (new or active recovery)');

          // Set flag with timestamp to indicate we're processing a recovery URL
          // AuthContext will only respect this flag if it's recent (within 30 seconds)
          const timestamp = Date.now().toString();
          await AsyncStorage.setItem(RECOVERY_FLAG_KEY, timestamp);
          
          // Mark this recovery session as processed with timestamp
          await AsyncStorage.setItem(RECOVERY_PROCESSED_TIMESTAMP_KEY, timestamp);
          console.log('[DeepLink] Processing recovery URL and marking timestamp');
          console.log('[DeepLink] This recovery will be blocked for the next', RECOVERY_COOLDOWN_MS / 60000, 'minutes');
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
    [router]
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
          <QueryProvider>
        <CacheProvider>
            <DatePickerStyleProvider>
              <CategoriesProvider>
                <CategoryProductsProvider>
                  <PaperProvider theme={theme}>
                    <StatusBar style="auto" />
                    <AppContent />
                  </PaperProvider>
                </CategoryProductsProvider>
              </CategoriesProvider>
            </DatePickerStyleProvider>
            </CacheProvider>
          </QueryProvider>
          </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

