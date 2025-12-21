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

  // Show splash screen while auth status is being determined or while essential data is loading
  // This ensures smooth transition without flickering between screens
  const essentialLoading = authLoading || (profileLoading && !loadingTimeout) || (ownerLoading && !loadingTimeout);
  const nonEssentialLoading = subscriptionLoading || checkingGuide;
  
  if (status === 'loading' || essentialLoading || (nonEssentialLoading && !loadingTimeout)) {
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

