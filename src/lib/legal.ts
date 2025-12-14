/**
 * Legal helpers
 * Functions for querying and managing terms acceptance records
 */

import { supabase } from './supabase/client';
import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

export interface TermsAcceptance {
  accepted_terms_at: string | null;
  terms_hash: string | null;
}

/**
 * Get user's terms acceptance record
 * @param userId - The user ID (from auth.users.id)
 * @returns Terms acceptance data or null if not found
 */
export async function getUserTermsAcceptance(userId: string): Promise<{
  data: TermsAcceptance | null;
  error: any;
}> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('accepted_terms_at, terms_hash')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching terms acceptance:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Exception fetching terms acceptance:', error);
    return { data: null, error };
  }
}

/**
 * Update user's terms acceptance record
 * @param userId - The user ID (from auth.users.id)
 * @param acceptedAt - ISO timestamp of acceptance
 * @param termsHash - SHA-256 hash of the terms version accepted
 * @returns Success status and error if any
 */
export async function updateUserTermsAcceptance(
  userId: string,
  acceptedAt: string,
  termsHash: string
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        accepted_terms_at: acceptedAt,
        terms_hash: termsHash,
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating terms acceptance:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Exception updating terms acceptance:', error);
    return { success: false, error };
  }
}

