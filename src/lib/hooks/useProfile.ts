/**
 * Hook for managing user profile
 * Fetches profile data including profile_name from profiles table
 */

import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getProfile } from '../supabase/mutations/profiles';
import type { Database } from '@/types/database';
import { supabase } from '@/lib/supabase/client';
import { onPurchaseSuccess } from '../iap/iapService';
import { reloadAppWithMessage } from '../utils/appReload';
import { useLanguage } from '@/context/LanguageContext';

type Profile = Database['public']['Tables']['profiles']['Row'];

export function useProfile() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Track previous subscription tier to detect changes
  const prevTierRef = useRef<string | null>(null);
  // Track if initial profile load is complete (to avoid false "plan changed" on login)
  const hasCompletedInitialLoadRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      // Reset state when user logs out to prevent false "plan changed" dialogs on next login
      prevTierRef.current = null;
      hasCompletedInitialLoadRef.current = false;
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const profileData = await getProfile(user.id);
        setProfile(profileData);
      } catch (err) {
        const error = err as Error;
        const errorMessage = error.message?.toLowerCase() || '';
        const isNetworkIssue = 
          errorMessage.includes('network') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('gateway error');
        
        if (isNetworkIssue) {
          console.warn('useProfile: Network error fetching profile (will retry on next render):', error.message);
          // For network errors, we'll keep the previous profile if it exists
          // and let the component retry on next mount or when user changes
        } else {
          console.error('useProfile: Error fetching profile:', error);
        }
        setError(error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  // Keep profile fresh without requiring an app restart:
  // 1) Refetch when app returns to foreground (user may come back from checkout)
  // 2) Subscribe to realtime profile changes (subscription_tier / valid_until updates)
  // 3) Refetch when IAP purchase succeeds (profile was updated by Edge Function)
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const refreshProfile = () => {
      getProfile(user.id)
        .then((p) => {
          if (isMounted) setProfile(p);
        })
        .catch(() => {
          // Non-critical
        });
    };

    const onAppState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshProfile();
      }
    });

    // Subscribe to successful IAP purchases
    const unsubscribePurchase = onPurchaseSuccess(() => {
      console.log('[useProfile] IAP purchase success - refreshing profile');
      refreshProfile();
    });

    const channel = supabase
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        async () => {
          try {
            const p = await getProfile(user.id);
            if (isMounted) setProfile(p);
          } catch {
            // Non-critical
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      onAppState.remove();
      unsubscribePurchase();
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Detect subscription tier changes and trigger app reload
  useEffect(() => {
    if (!profile?.subscription_tier) return;
    
    const currentTier = profile.subscription_tier;
    const prevTier = prevTierRef.current;
    
    // On first load after login, just record the tier without showing dialog
    if (!hasCompletedInitialLoadRef.current) {
      prevTierRef.current = currentTier;
      hasCompletedInitialLoadRef.current = true;
      return;
    }
    
    // Only trigger reload if tier actually changed (not on initial load)
    if (prevTier !== null && prevTier !== currentTier) {
      console.log(`[useProfile] Subscription tier changed: ${prevTier} → ${currentTier}`);
      
      // Determine if upgrade or downgrade
      const isUpgrade = currentTier === 'pro' && prevTier === 'free';
      const isDowngrade = currentTier === 'free' && prevTier === 'pro';
      
      if (isUpgrade) {
        reloadAppWithMessage(
          t('subscription.upgradeSuccessTitle') || 'שדרוג הושלם!',
          t('subscription.upgradeSuccessMessage') || 'התוכנית שודרגה בהצלחה. האפליקציה תטען מחדש.',
          t('common.ok') || 'אישור'
        );
      } else if (isDowngrade) {
        reloadAppWithMessage(
          t('subscription.planChangedTitle') || 'התוכנית שונתה',
          t('subscription.planChangedMessage') || 'התוכנית שלך שונתה. האפליקציה תטען מחדש.',
          t('common.ok') || 'אישור'
        );
      }
    }
    
    prevTierRef.current = currentTier;
  }, [profile?.subscription_tier, t]);

  const refetch = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      const profileData = await getProfile(user.id);
      setProfile(profileData);
    } catch (err) {
      const error = err as Error;
      const errorMessage = error.message?.toLowerCase() || '';
      const isNetworkIssue = 
        errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('gateway error');
      
      if (isNetworkIssue) {
        console.warn('useProfile: Network error refetching profile:', error.message);
      } else {
        console.error('useProfile: Error refetching profile:', error);
      }
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  return {
    profile,
    loading,
    error,
    refetch,
  };
}

