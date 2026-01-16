/**
 * Hook for managing user profile
 * Fetches profile data including profile_name from profiles table
 * 
 * OFFLINE-SAFE:
 * - Persists profile to AsyncStorage
 * - Only fetches when online
 * - Uses cached profile when offline
 */

import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { getProfile } from '../supabase/mutations/profiles';
import type { Database } from '@/types/database';
import { supabase } from '@/lib/supabase/client';
import { onPurchaseSuccess } from '../iap/iapService';
import { reloadAppWithMessage } from '../utils/appReload';
import { useLanguage } from '@/context/LanguageContext';
import { useNetworkStatus } from './useNetworkStatus';

type Profile = Database['public']['Tables']['profiles']['Row'];

const PROFILE_CACHE_KEY = (userId: string) => `profile_cache_${userId}`;

export function useProfile() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isOnline } = useNetworkStatus();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Track previous subscription tier to detect changes
  const prevTierRef = useRef<string | null>(null);
  // Track if initial profile load is complete (to avoid false "plan changed" on login)
  const hasCompletedInitialLoadRef = useRef(false);

  // Load cached profile immediately on mount
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      prevTierRef.current = null;
      hasCompletedInitialLoadRef.current = false;
      return;
    }

    const loadCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY(user.id));
        if (cached) {
          const cachedProfile = JSON.parse(cached);
          setProfile(cachedProfile);
          setLoading(false); // Stop loading - we have cache
          console.log('[useProfile] Loaded from cache');
        }
      } catch (err) {
        console.warn('[useProfile] Failed to load cache:', err);
      }
    };

    loadCache();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    // Don't fetch if offline
    if (!isOnline) {
      console.log('[useProfile] Offline - skipping fetch, using cache');
      setLoading(false);
      setError(null); // Clear any previous error
      return;
    }

    const fetchProfile = async () => {
      try {
        setError(null);
        // Don't show loading if we have cached data
        if (!profile) {
          setLoading(true);
        }

        const profileData = await getProfile(user.id);
        setProfile(profileData);
        
        // Persist to cache
        await AsyncStorage.setItem(PROFILE_CACHE_KEY(user.id), JSON.stringify(profileData));
        console.log('[useProfile] Profile fetched and cached');
      } catch (err) {
        const error = err as Error;
        const errorMessage = error.message?.toLowerCase() || '';
        const isNetworkIssue = 
          errorMessage.includes('network') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('gateway error');
        
        if (isNetworkIssue) {
          console.warn('[useProfile] Network error - using cached data');
          // Keep cached profile, don't set error
        } else {
          console.error('[useProfile] Error fetching profile:', error);
          setError(error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, isOnline]);

  // Keep profile fresh without requiring an app restart:
  // 1) Refetch when app returns to foreground (user may come back from checkout)
  // 2) Subscribe to realtime profile changes (subscription_tier / valid_until updates)
  // 3) Refetch when IAP purchase succeeds (profile was updated by Edge Function)
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const refreshProfile = async () => {
      // Only refresh if online
      if (!isOnline) {
        console.log('[useProfile] Offline - skipping refresh');
        return;
      }
      
      try {
        const p = await getProfile(user.id);
        if (isMounted) {
          setProfile(p);
          // Update cache
          await AsyncStorage.setItem(PROFILE_CACHE_KEY(user.id), JSON.stringify(p));
        }
      } catch (err) {
        // Non-critical - keep cached data
        console.warn('[useProfile] Refresh failed, keeping cached data');
      }
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
  }, [user?.id, isOnline]);

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
    
    // Don't fetch if offline
    if (!isOnline) {
      console.log('[useProfile] Offline - skipping refetch');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const profileData = await getProfile(user.id);
      setProfile(profileData);
      
      // Update cache
      await AsyncStorage.setItem(PROFILE_CACHE_KEY(user.id), JSON.stringify(profileData));
    } catch (err) {
      const error = err as Error;
      const errorMessage = error.message?.toLowerCase() || '';
      const isNetworkIssue = 
        errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('gateway error');
      
      if (isNetworkIssue) {
        console.warn('[useProfile] Network error refetching - keeping cached data');
      } else {
        console.error('[useProfile] Error refetching profile:', error);
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

