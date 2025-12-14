/**
 * Hook to get the Supabase client
 * Returns the singleton Supabase client instance
 */

import { supabase } from './client';

export function useSupabaseClient() {
  return supabase;
}

