/**
 * Profile mutations for Supabase
 * Handles profile table operations including profile_name management
 */

import { supabase } from '../client';
import type { Database } from '@/types/database';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/**
 * Update profile information
 */
export async function updateProfile(
  userId: string,
  updates: ProfileUpdate
): Promise<Database['public']['Tables']['profiles']['Row']> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Update failed: Profile not found or access denied');
  }

  return data;
}

interface PersistProfileParams {
  userId: string;
  profileName: string;
  email: string;
  hasAcceptedTerms: boolean;
  acceptedTermsAt?: string;
  termsHash?: string;
}

/**
 * Explicit helper to persist a complete profile row with strong logging.
 */
export async function persistProfileToSupabase(params: PersistProfileParams) {
  const {
    userId,
    profileName,
    email,
    hasAcceptedTerms,
    acceptedTermsAt,
    termsHash,
  } = params;

  console.log('[Profile] persistProfileToSupabase called', params);

  const effectiveAcceptedAt =
    hasAcceptedTerms ? acceptedTermsAt ?? new Date().toISOString() : null;

  try {
    console.log('[Profile] About to upsert profile', {
      userId,
      profileName,
      email,
      hasAcceptedTerms,
      acceptedTermsAt: effectiveAcceptedAt,
      termsHash,
    });

    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          profile_name: profileName,
          email,
          has_accepted_terms: hasAcceptedTerms,
          accepted_terms_at: effectiveAcceptedAt,
          terms_hash: termsHash ?? null,
        },
        { onConflict: 'id' }
      )
      .select('id, profile_name, email, has_accepted_terms, accepted_terms_at, terms_hash')
      .single();

    if (error) {
      console.log('[Profile] FAILED to persist profile to Supabase', { userId, error });
      return { data: null, error };
    }

    console.log('[Profile] Successfully persisted profile to Supabase', data);
    return { data, error: null };
  } catch (error: any) {
    console.log('[Profile] FAILED to persist profile to Supabase (exception)', {
      userId,
      error,
    });
    return { data: null, error };
  }
}

/**
 * Check if a profile name is unique in profiles table
 * Case-insensitive comparison
 */
export async function isProfileNameUnique(
  profileName: string,
  excludeUserId?: string
): Promise<boolean> {
  const trimmedName = profileName.trim();
  
  if (!trimmedName) {
    return false;
  }

  // Query to check if any profile (except the current user) has this profile name
  let query = supabase
    .from('profiles')
    .select('id')
    .ilike('profile_name', trimmedName) // Case-insensitive comparison
    .limit(1);

  if (excludeUserId) {
    query = query.neq('id', excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Error checking business name uniqueness:', error);
    // If it's a network or connection error, we can't check, so allow it
    // If it's a constraint violation, the name is already taken
    const isNetworkError = 
      error.message?.includes('Network request failed') ||
      error.message?.includes('fetch failed') ||
      error.message?.includes('network');
    
    if (isNetworkError) {
      // Network errors - we can't verify, so assume it's unique
      return true;
    }
    throw error;
  }

  // If data exists, the name is not unique
  return !data;
}

/**
 * Check if an error is a network/connection error
 */
function isNetworkError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';
  
  return (
    errorMessage.includes('network') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('network request failed') ||
    errorMessage.includes('gateway error') ||
    errorCode === 'network_error' ||
    errorCode === 'connection_error'
  );
}

/**
 * Get profile by user ID with retry logic for network errors
 */
export async function getProfile(
  userId: string,
  retries: number = 2
): Promise<Database['public']['Tables']['profiles']['Row'] | null> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        // If it's a network error and we have retries left, retry
        if (isNetworkError(error) && attempt < retries) {
          lastError = error;
          // Exponential backoff: wait 1s, 2s, etc.
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Non-network error or out of retries - throw immediately
        console.error('Error fetching profile:', error);
        throw error;
      }

      return data;
    } catch (err: any) {
      // If it's a network error and we have retries left, retry
      if (isNetworkError(err) && attempt < retries) {
        lastError = err;
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Re-throw if it's not a network error or we're out of retries
      throw err;
    }
  }
  
  // If we exhausted all retries, throw the last error
  if (lastError) {
    console.error('Error fetching profile after retries:', lastError);
    throw lastError;
  }
  
  return null;
}

