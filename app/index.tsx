import { useAuth } from '@/context/AuthContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useProfile } from '@/lib/hooks/useProfile';
import { checkSubscriptionStatus } from '@/lib/subscription/subscription';
import { deleteExpiredItemsByRetention } from '@/lib/supabase/mutations/items';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SplashScreen } from '@/components/SplashScreen';

const GUIDE_SEEN_KEY = (userId: string) => `guide_seen_${userId}`;

export default function Index() {
  const { user, loading: authLoading, status, isRecoveryFlow, needsProfileCompletion, isProfileLoaded, isProfileComplete } = useAuth();
  const { activeOwnerId, isOwner, loading: ownerLoading } = useActiveOwner();
  const { profile, loading: profileLoading } = useProfile();
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [checkingGuide, setCheckingGuide] = useState(false);
  const [shouldShowGuide, setShouldShowGuide] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  useEffect(() => {
    const checkSubscription = async () => {
      // Only check subscription for owners, not collaborators
      // Don't wait if we don't have an owner or user is not the owner
      if (!activeOwnerId || !isOwner || authLoading || !user || profileLoading) return;
      
      try {
        setSubscriptionLoading(true);
        // Use account created date from profiles or user.created_at for trial calculation
        const accountCreatedAt = profile?.created_at || user.created_at;
        const profileTier = profile?.subscription_tier || null;
        const subscriptionValidUntil = profile?.subscription_valid_until || null;
        const subscription = await checkSubscriptionStatus(
          activeOwnerId, // Use ownerId instead of business.id
          profileTier,
          accountCreatedAt,
          subscriptionValidUntil
        );
        // Only block access if subscription is expired (paid plan that expired)
        // Free plan users can always access the app
        setSubscriptionExpired(subscription.status === 'expired');
      } catch (error) {
        console.error('Error checking subscription:', error);
        // Don't block access if subscription check fails
        setSubscriptionExpired(false);
      } finally {
        setSubscriptionLoading(false);
      }
    };

    checkSubscription();
  }, [activeOwnerId, isOwner, authLoading, ownerLoading, user, profile, profileLoading]);

  // No business creation needed - users are owners by default
  // useActiveOwner hook handles determining if user is owner or collaborator

  // Timeout for loading - don't wait forever
  useEffect(() => {
    if (!user || authLoading) {
      setLoadingTimeout(false);
      return;
    }
    
    const timer = setTimeout(() => {
      setLoadingTimeout(true);
    }, 3000); // 3 second timeout - don't wait too long
    
    return () => clearTimeout(timer);
  }, [user, authLoading]);

  // Check if user has seen the guide (first time login)
  useEffect(() => {
    // Reset guide checking state immediately when user logs out
    if (!user && !authLoading) {
      setCheckingGuide(false);
      setShouldShowGuide(false);
      return;
    }

    // Don't check guide if user is not logged in or still loading
    if (!user?.id || authLoading || ownerLoading || profileLoading) {
      return;
    }

    let isMounted = true;

    const checkGuideStatus = async () => {
      setCheckingGuide(true);
      try {
        const raw = await AsyncStorage.getItem(GUIDE_SEEN_KEY(user.id));
        const hasSeenGuide = raw === 'true';
        if (isMounted) {
          setShouldShowGuide(!hasSeenGuide);
        }
      } catch (error) {
        console.error('Error checking guide status:', error);
        if (isMounted) {
          setShouldShowGuide(false);
        }
      } finally {
        if (isMounted) {
          setCheckingGuide(false);
        }
      }
    };

    checkGuideStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id, authLoading, ownerLoading, profileLoading]);

  // Run auto-delete for expired items on app startup (only for owners)
  useEffect(() => {
    const runAutoDelete = async () => {
      // Only run auto-delete for owners, not collaborators
      if (!activeOwnerId || !isOwner || authLoading || ownerLoading) return;
      
      // Get retention days from profile (if stored there) or use default
      // TODO: Add retention_days_after_expiry to profiles table if needed
      const retentionDays = 0; // Default to disabled for now
      
      if (retentionDays <= 0) {
        return; // Auto-delete disabled
      }

      try {
        const deletedCount = await deleteExpiredItemsByRetention(activeOwnerId, retentionDays);
        if (deletedCount > 0) {
          console.log(`[Auto-Delete] Deleted ${deletedCount} expired items on app startup`);
        }
      } catch (error) {
        console.error('Error running auto-delete on app startup:', error);
        // Don't block app startup if auto-delete fails
      }
    };

    runAutoDelete();
  }, [activeOwnerId, isOwner, authLoading, ownerLoading]);

  // Show splash screen while auth status is being determined
  if (status === 'loading') {
    return <SplashScreen />;
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
    return <Redirect href="/(auth)/login" />;
  }

  // Show loading while checking auth, owner, profile, subscription, guide status
  // Only show loading if we have a user (when user is null, we already redirected above)
  // Use same background as login screen to avoid white flash
  // Don't wait forever - use timeout to prevent infinite loading
  // Only wait for essential checks: auth and profile (we need these)
  // Don't wait for subscription or guide - these can load in background
  const essentialLoading = authLoading || (profileLoading && !loadingTimeout) || (ownerLoading && !loadingTimeout);
  const nonEssentialLoading = subscriptionLoading || checkingGuide;
  
  // Show loading only for essential checks, or non-essential if timeout hasn't been reached
  if (essentialLoading || (nonEssentialLoading && !loadingTimeout)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FB' }}>
        <ActivityIndicator size="large" color="#42A5F5" />
        <Text style={{ marginTop: 16, color: '#5F6B7A' }}>Loading...</Text>
      </View>
    );
  }

  // Only proceed with authenticated user checks if status is explicitly 'authenticated'
  if (status === 'authenticated' && user) {
    // Centralized profile completion check: only redirect if profile has finished loading
    // and is not complete according to AuthContext.
    if (isProfileLoaded && !isProfileComplete) {
      return <Redirect href="/(auth)/complete-profile" />;
    }

    // Show guide on first login
    if (shouldShowGuide) {
      return <Redirect href="/settings/guide?firstTime=true" />;
    }

    // Block access if subscription is expired
    if (subscriptionExpired) {
      return <Redirect href="/(paywall)/subscribe" />;
    }

    // Otherwise, go to main app (all tab)
    return <Redirect href="/(tabs)/all" />;
  }

  // Not logged in, go to login
  return <Redirect href="/(auth)/login" />;
}

