/**
 * Hook for subscription status
 */

import { useState, useEffect, useRef } from 'react';
import { useActiveOwner } from './useActiveOwner';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from './useProfile';
import { checkSubscriptionStatus, type SubscriptionInfo } from '../subscription/subscription';
import { logSubscription } from '../logging/subscriptionLogger';

export function useSubscription() {
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const prevSubscriptionRef = useRef<SubscriptionInfo | null>(null);

  useEffect(() => {
    if (!activeOwnerId || ownerLoading || !user || profileLoading) {
      setSubscription(null);
      setLoading(ownerLoading || profileLoading);
      return;
    }

    const fetchSubscription = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Use account created date from profiles table (or user.created_at as fallback)
        // profiles.created_at should match the account creation date
        const accountCreatedAt = profile?.created_at || user.created_at;
        
        const profileSubscriptionTier = profile?.subscription_tier || 'free';
        const profileSubscriptionValidUntil = profile?.subscription_valid_until || null;
        
        const info = await checkSubscriptionStatus(
          activeOwnerId,
          profileSubscriptionTier,
          accountCreatedAt,
          profile?.subscription_tier || null,
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
          const isFreeTrialActive = isFreeTier && info.isTrialActive && !isPro;
          
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
        }
        
        prevSubscriptionRef.current = info;
        setSubscription(info);
      } catch (err) {
        setError(err as Error);
        console.error('[useSubscription] Error fetching subscription:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [activeOwnerId, ownerLoading, user, profile, profileLoading]);

  // Derive clear precedence flags
  const isPro = subscription?.plan === 'pro' && subscription?.isPaidActive;
  const isFreeTier = subscription?.plan === 'free';
  const isFreeTrialActive = isFreeTier && (subscription?.isTrialActive || false) && !isPro;

  return {
    subscription,
    loading,
    error,
    // Clear precedence flags
    isPro,
    isFreeTier,
    isFreeTrialActive,
  };
}

