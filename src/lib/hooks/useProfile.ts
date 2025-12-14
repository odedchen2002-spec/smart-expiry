/**
 * Hook for managing user profile
 * Fetches profile data including profile_name from profiles table
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getProfile } from '../supabase/mutations/profiles';
import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
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

