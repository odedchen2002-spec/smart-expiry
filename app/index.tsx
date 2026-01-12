import { useAuth } from '@/context/AuthContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useProfile } from '@/lib/hooks/useProfile';
import { checkSubscriptionStatus } from '@/lib/subscription/subscription';
import { deleteExpiredItemsByRetention } from '@/lib/supabase/mutations/items';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SplashScreen } from '@/components/SplashScreen';

// Onboarding key - shown once on first app launch
const ONBOARDING_SEEN_KEY = (userId: string) => `onboarding_seen_${userId}`;

// Performance timing - only in development
const PERF_ENABLED = __DEV__;
const perfLog = (label: string, startTime?: number) => {
  if (!PERF_ENABLED) return;
  const now = Date.now();
  if (startTime) {
    console.log(`[PERF] ${label}: ${now - startTime}ms`);
  } else {
    console.log(`[PERF] ${label}: ${new Date(now).toISOString()}`);
  }
  return now;
};

export default function Index() {
  const { user, loading: authLoading, status, isRecoveryFlow, needsProfileCompletion, isProfileLoaded, isProfileComplete } = useAuth();
  const { activeOwnerId, isOwner, loading: ownerLoading } = useActiveOwner();
  const { profile, loading: profileLoading } = useProfile();
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  // Performance tracking
  const startTimeRef = useRef<number>(Date.now());
  const hasLoggedFirstRender = useRef(false);
  
  // Log first render timing
  useEffect(() => {
    if (!hasLoggedFirstRender.current) {
      hasLoggedFirstRender.current = true;
      perfLog('Index first render', startTimeRef.current);
    }
  }, []);

  // Subscription check - NON-BLOCKING: runs in background after initial navigation
  // This doesn't block app startup - user goes to Home first, then gets redirected if expired
  useEffect(() => {
    const checkSubscription = async () => {
      // Only check subscription for owners, not collaborators
      if (!activeOwnerId || !isOwner || !user) return;
      
      try {
        perfLog('Subscription check start', startTimeRef.current);
        // Use auth user created date (not profile) to prevent trial reset after account deletion
        const accountCreatedAt = user.created_at || profile?.created_at;
        const profileTier = profile?.subscription_tier || null;
        const subscriptionValidUntil = profile?.subscription_valid_until || null;
        const subscription = await checkSubscriptionStatus(
          activeOwnerId,
          profileTier,
          accountCreatedAt,
          subscriptionValidUntil
        );
        perfLog('Subscription check done', startTimeRef.current);
        // Only block access if subscription is expired (paid plan that expired)
        // Free plan users can always access the app
        setSubscriptionExpired(subscription.status === 'expired');
      } catch (error) {
        console.error('Error checking subscription:', error);
        // Don't block access if subscription check fails
        setSubscriptionExpired(false);
      }
    };

    // Run subscription check after a small delay so it doesn't block initial render
    const timeoutId = setTimeout(checkSubscription, 100);
    return () => clearTimeout(timeoutId);
  }, [activeOwnerId, isOwner, user, profile]);

  // No business creation needed - users are owners by default
  // useActiveOwner hook handles determining if user is owner or collaborator

  // Timeout for loading - reduced from 3s to 1.5s since non-critical stuff is now truly non-blocking
  useEffect(() => {
    if (!user || authLoading) {
      setLoadingTimeout(false);
      return;
    }
    
    const timer = setTimeout(() => {
      perfLog('Loading timeout reached', startTimeRef.current);
      setLoadingTimeout(true);
    }, 1500); // 1.5 second timeout - faster than before
    
    return () => clearTimeout(timer);
  }, [user, authLoading]);

  // Check if user has seen the onboarding (first time login) - FAST: only depends on user.id
  useEffect(() => {
    // Reset onboarding checking state immediately when user logs out
    if (!user && !authLoading) {
      setCheckingOnboarding(false);
      setShouldShowOnboarding(false);
      return;
    }

    // Start checking as soon as we have user.id - don't wait for profile/owner
    if (!user?.id || authLoading) {
      return;
    }

    let isMounted = true;

    const checkOnboardingStatus = async () => {
      setCheckingOnboarding(true);
      try {
        perfLog('Onboarding check start', startTimeRef.current);
        const raw = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY(user.id));
        const hasSeenOnboarding = raw === 'true';
        perfLog('Onboarding check done', startTimeRef.current);
        if (isMounted) {
          setShouldShowOnboarding(!hasSeenOnboarding);
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        if (isMounted) {
          setShouldShowOnboarding(false);
        }
      } finally {
        if (isMounted) {
          setCheckingOnboarding(false);
        }
      }
    };

    checkOnboardingStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id, authLoading]); // Removed ownerLoading, profileLoading - not needed for this check

  // Run auto-delete for expired items on app startup (only for owners)
  // Default: 7 days retention period (delete items expired more than 7 days ago)
  const DEFAULT_RETENTION_DAYS = 7;
  
  useEffect(() => {
    const runAutoDelete = async () => {
      // Only run auto-delete for owners, not collaborators
      if (!activeOwnerId || !isOwner || authLoading || ownerLoading) return;
      
      try {
        // Get retention days from AsyncStorage, use default if not set
        const key = `retention_days_${activeOwnerId}`;
        const saved = await AsyncStorage.getItem(key);
        
        // Use saved value if exists, otherwise use default (7 days)
        // Value of "0" means explicitly disabled by user
        let retentionDays: number;
        if (saved !== null) {
          const parsed = parseInt(saved, 10);
          retentionDays = isNaN(parsed) ? DEFAULT_RETENTION_DAYS : parsed;
        } else {
          retentionDays = DEFAULT_RETENTION_DAYS; // Default enabled
        }
        
        if (retentionDays <= 0) {
          return; // Explicitly disabled by user
        }

        const deletedCount = await deleteExpiredItemsByRetention(activeOwnerId, retentionDays);
        if (deletedCount > 0) {
          console.log(`[Auto-Delete] Deleted ${deletedCount} expired items on app startup (retention: ${retentionDays} days)`);
        }
      } catch (error) {
        console.error('Error running auto-delete on app startup:', error);
        // Don't block app startup if auto-delete fails
      }
    };

    runAutoDelete();
  }, [activeOwnerId, isOwner, authLoading, ownerLoading]);

  // Show splash screen ONLY for critical auth decision
  // CRITICAL: auth status - need to know if logged in or not to choose correct stack
  // NON-CRITICAL (runs in background): profile, owner, subscription, onboarding check
  const criticalLoading = authLoading || status === 'loading';
  
  // For authenticated users, wait briefly for onboarding check to prevent flicker
  // But use short timeout so we don't block for too long
  const waitingForOnboarding = user && checkingOnboarding && !loadingTimeout;
  
  if (criticalLoading || waitingForOnboarding) {
    return <SplashScreen />;
  }
  
  // Log auth decision timing
  if (PERF_ENABLED && status !== 'loading') {
    perfLog(`Auth decision: ${status}`, startTimeRef.current);
  }

  // Password recovery flow: stay in auth stack, don't redirect to tabs
  if (status === 'password_recovery' || isRecoveryFlow) {
    // Let the auth stack handle the reset-password screen
    // Don't redirect here - user should stay on reset-password screen
    return <Redirect href="/(auth)/reset-password" />;
  }

  // CRITICAL: Check if user is logged out FIRST, before any loading checks
  // This ensures immediate redirect to login without white screen
  if (status === 'unauthenticated' || !user) {
    console.log('[Index] User logged out, redirecting to login. Status:', status, 'User:', !!user);
    return <Redirect href="/(auth)/login" />;
  }

  // Only proceed with authenticated user checks if status is explicitly 'authenticated'
  if (status === 'authenticated' && user) {
    console.log('[Index] 🏠 User authenticated, checking profile and navigation. Status:', status);
    // Centralized profile completion check: only redirect if profile has finished loading
    // and is not complete according to AuthContext.
    if (isProfileLoaded && !isProfileComplete) {
      console.log('[Index] → Redirecting to complete-profile');
      return <Redirect href="/(auth)/complete-profile" />;
    }

    // Show onboarding on first login (not guide)
    if (shouldShowOnboarding) {
      console.log('[Index] → Redirecting to onboarding');
      return <Redirect href="/onboarding" />;
    }

    // Block access if subscription is expired
    if (subscriptionExpired) {
      console.log('[Index] → Redirecting to subscribe (expired)');
      return <Redirect href="/(paywall)/subscribe" />;
    }

    // Otherwise, go to main app (home tab)
    console.log('[Index] → Redirecting to home tab');
    return <Redirect href="/(tabs)/home" />;
  }

  // Fallback: Not logged in, go to login
  console.log('[Index] 🔄 Fallback redirect to login. Status:', status, 'User:', !!user);
  return <Redirect href="/(auth)/login" />;
}

