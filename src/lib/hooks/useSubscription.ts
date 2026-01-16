/**
 * Hook for subscription status
 * 
 * OFFLINE-SAFE:
 * - Uses cached subscription data when offline
 * - Only fetches when online
 * - Never shows "trial ended" when offline
 */

import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { logSubscription } from '../logging/subscriptionLogger';
import { checkSubscriptionStatus, type SubscriptionInfo } from '../subscription/subscription';
import { supabase } from '../supabase/client';
import { enforcePlanLimitAfterCreate } from '../supabase/mutations/enforcePlanLimits';
import { useActiveOwner } from './useActiveOwner';
import { useProfile } from './useProfile';
import { useNetworkStatus } from './useNetworkStatus';

const SUBSCRIPTION_CACHE_KEY = 'subscription_cache';

export function useSubscription() {
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { isOnline } = useNetworkStatus();

  // Initialize with a default 'free' plan so we never show "Loading..."
  // IMPORTANT: canAddItems starts as false until we verify actual item count
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>({
    plan: 'free',
    status: 'free',
    isPaidActive: false,
    isTrialActive: false,
    trialDaysRemaining: 0,
    trialEndDate: null,
    subscriptionEndDate: null,
    activeItemsCount: 0,
    totalItemsCount: 0,
    maxItems: 150,
    canAddItems: false, // Default to false for security - will be updated after fetching
  });

  const [loading, setLoading] = useState(true); // Start as loading, will be set to false after first fetch
  const [error, setError] = useState<Error | null>(null);
  const prevSubscriptionRef = useRef<SubscriptionInfo | null>(null);
  const hasFetchedRef = useRef(false);

  // Load cached subscription data immediately on mount (runs every time)
  useEffect(() => {
    if (!activeOwnerId) {
      setLoading(false);
      return;
    }

    const loadCachedSubscription = async () => {
      try {
        const cached = await AsyncStorage.getItem(SUBSCRIPTION_CACHE_KEY);
        if (cached) {
          const cachedData = JSON.parse(cached);
          // Only use cache if it's for the same user
          if (cachedData.ownerId === activeOwnerId) {
            setSubscription(cachedData.data);
            prevSubscriptionRef.current = cachedData.data;
            setLoading(false); // CRITICAL: Cache loaded, stop loading
            console.log('[useSubscription] Loaded from cache for owner:', activeOwnerId);
            return; // Exit early - we have cache
          }
        }
        // No cache found - keep showing default 'free' plan, will update after fetch
        // DON'T set loading to false here - wait for actual fetch to complete
        console.log('[useSubscription] No cache found, showing default free plan');
      } catch (err) {
        console.warn('[useSubscription] Failed to load cache:', err);
        // On cache error, don't set loading to false - wait for fetch
      }
    };

    loadCachedSubscription();
  }, [activeOwnerId]);

  useEffect(() => {
    if (!activeOwnerId || ownerLoading || !user) {
      // Don't clear subscription - keep showing last known state
      return;
    }

    // OFFLINE-SAFE: Don't fetch if offline, use cache
    if (!isOnline) {
      console.log('[useSubscription] Offline - using cached subscription data');
      setLoading(false);
      setError(null); // Clear any error state
      return;
    }

    const fetchSubscription = async () => {
      try {
        // Never show loading - always update silently in background
        setError(null);

        // CRITICAL: Fetch the OWNER's profile, not the current user's profile!
        // This is crucial for collaborators - we need the owner's subscription info, not theirs
        const { data: ownerProfile, error: ownerProfileError } = await supabase
          .from('profiles')
          .select('subscription_tier, subscription_valid_until, created_at')
          .eq('id', activeOwnerId)
          .single();

        if (ownerProfileError) {
          console.warn('[useSubscription] Error fetching owner profile - using cached data');
          // Don't proceed if we can't fetch - keep cached data
          setLoading(false);
          return;
        }

        // Use OWNER's subscription info (not current user's!)
        const profileSubscriptionTier = ownerProfile?.subscription_tier || 'free';
        const profileSubscriptionValidUntil = ownerProfile?.subscription_valid_until || null;
        const accountCreatedAt = ownerProfile?.created_at || user.created_at || undefined;

        const info = await checkSubscriptionStatus(
          activeOwnerId,
          profileSubscriptionTier,
          accountCreatedAt,
          ownerProfile?.subscription_tier || null,
          profileSubscriptionValidUntil
        );

        // Only log if subscription state actually changed
        const prev = prevSubscriptionRef.current;
        const stateChanged = !prev ||
          prev.plan !== info.plan ||
          prev.isPaidActive !== info.isPaidActive ||
          prev.isTrialActive !== info.isTrialActive ||
          prev.status !== info.status;

        if (stateChanged) {
          const isPro = info.plan === 'pro' && info.isPaidActive;
          const isFreeTier = info.plan === 'free';
          // FIXED: Trial users have plan='trial' (not 'free'), so we need to check isTrialActive directly
          const isFreeTrialActive = info.isTrialActive && !isPro;

          logSubscription('[useSubscription] Subscription state changed:', {
            ownerId: activeOwnerId,
            tier: info.plan,
            isPro,
            isFreeTier,
            isFreeTrialActive,
            isTrialActive: info.isTrialActive,
            isPaidActive: info.isPaidActive,
            status: info.status,
          });

          // Enforce plan limits when subscription tier changes
          // This handles:
          // 1. Pro+ -> Pro downgrade (lock items beyond 2000)
          // 2. Pro -> Free downgrade (lock items beyond 150)
          // 3. Free -> Pro upgrade (unlock items up to 2000)
          if (prev && prev.plan !== info.plan) {
            console.log(`[useSubscription] Plan changed from ${prev.plan} to ${info.plan}, enforcing limits...`);
            enforcePlanLimitAfterCreate(activeOwnerId).catch((err) => {
              console.error('[useSubscription] Error enforcing plan limit after tier change:', err);
            });
          }
        }

        prevSubscriptionRef.current = info;
        setSubscription(info);
        hasFetchedRef.current = true;

        // Save to cache for next time
        try {
          await AsyncStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify({
            ownerId: activeOwnerId,
            data: info,
            timestamp: Date.now(),
          }));
          console.log('[useSubscription] Saved to cache for owner:', activeOwnerId);
        } catch (cacheError) {
          console.warn('[useSubscription] Failed to save cache:', cacheError);
        }
      } catch (err) {
        // Network errors when offline - keep cached data
        const error = err as Error;
        const errorMessage = error.message?.toLowerCase() || '';
        const isNetworkIssue = 
          errorMessage.includes('network') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('fetch');
        
        if (isNetworkIssue) {
          console.warn('[useSubscription] Network error - keeping cached subscription');
          // Don't set error - keep cached state
        } else {
          console.error('[useSubscription] Error fetching subscription:', err);
          setError(err as Error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [activeOwnerId, ownerLoading, user, isOnline]);

  // Derive clear precedence flags
  const isProPlus = subscription?.plan === 'pro_plus' && subscription?.isPaidActive;
  const isPro = (subscription?.plan === 'pro' && subscription?.isPaidActive) || isProPlus;
  const isFreeTier = subscription?.plan === 'free';
  // FIXED: Trial users have plan='trial' (not 'free'), so we need to check isTrialActive directly
  // A user is in free trial if: isTrialActive is true AND not on a paid plan
  const isFreeTrialActive = (subscription?.isTrialActive || false) && !isPro;

  // Refresh subscription data (e.g., after adding/deleting items)
  const refresh = useCallback(async () => {
    if (!activeOwnerId || !user) return;
    
    // Don't refresh if offline
    if (!isOnline) {
      console.log('[useSubscription] Offline - skipping refresh');
      return;
    }
    
    try {
      // CRITICAL: Fetch the OWNER's profile, not the current user's profile!
      const { data: ownerProfile, error: ownerProfileError } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_valid_until, created_at')
        .eq('id', activeOwnerId)
        .single();

      if (ownerProfileError) {
        console.warn('[useSubscription] Error fetching owner profile in refresh - keeping cached data');
        return;
      }

      const accountCreatedAt = ownerProfile.created_at || user.created_at || undefined;
      const profileSubscriptionTier = ownerProfile.subscription_tier || 'free';
      const profileSubscriptionValidUntil = ownerProfile.subscription_valid_until || null;

      const info = await checkSubscriptionStatus(
        activeOwnerId,
        profileSubscriptionTier,
        accountCreatedAt,
        ownerProfile.subscription_tier || null,
        profileSubscriptionValidUntil
      );

      setSubscription(info);
      prevSubscriptionRef.current = info;

      // Save to cache
      try {
        await AsyncStorage.setItem(
          SUBSCRIPTION_CACHE_KEY,
          JSON.stringify({
            ownerId: activeOwnerId,
            data: info,
          })
        );
      } catch (cacheError) {
        console.warn('[useSubscription] Failed to cache subscription:', cacheError);
      }
    } catch (error) {
      const err = error as Error;
      const errorMessage = err.message?.toLowerCase() || '';
      const isNetworkIssue = 
        errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('fetch');
      
      if (isNetworkIssue) {
        console.warn('[useSubscription] Network error during refresh - keeping cached data');
      } else {
        console.error('[useSubscription] Error refreshing subscription:', error);
      }
    }
  }, [activeOwnerId, user, isOnline]);

  return {
    subscription,
    loading,
    error,
    refresh, // Export refresh function
    // Clear precedence flags
    isProPlus,
    isPro,
    isFreeTier,
    isFreeTrialActive,
  };
}

