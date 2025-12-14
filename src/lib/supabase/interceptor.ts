/**
 * HTTP interceptor for Supabase client
 * Automatically handles 401 errors with token refresh and retry
 * 
 * Note: Supabase already handles token refresh automatically with autoRefreshToken: true
 * This interceptor adds additional retry logic and ensures refresh tokens are stored securely
 */

import type { SupabaseClient } from '@supabase/supabase-js';

let isRefreshing = false;
let refreshPromise: Promise<{ session: any; error: Error | null }> | null = null;

/**
 * Make an authenticated request with automatic token refresh on 401
 * 
 * Usage:
 * const result = await withAuthRefresh(() => 
 *   supabase.from('items').select('*')
 * );
 */
export async function withAuthRefresh<T>(
  requestFn: () => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any }> {
  // First attempt
  let result = await requestFn();
  
  // Check if we got a 401 Unauthorized error
  const isUnauthorized = result.error && (
    (result.error as any).status === 401 ||
    (result.error as any).code === 'PGRST301' ||
    (result.error as any).message?.includes('JWT') ||
    (result.error as any).message?.includes('token')
  );
  
  // If we get a 401, try to refresh the token
  if (isUnauthorized) {
    // Prevent multiple simultaneous refresh attempts
    if (!isRefreshing) {
      isRefreshing = true;
      // Lazy import to break circular dependency
      const { refreshAccessToken } = await import('../auth/refreshToken');
      refreshPromise = refreshAccessToken();
    }
    
    // Wait for refresh to complete
    const refreshResult = await refreshPromise!;
    isRefreshing = false;
    refreshPromise = null;
    
    if (refreshResult.error || !refreshResult.session) {
      // Refresh failed, return original error
      return result;
    }
    
    // Retry the original request with new token
    result = await requestFn();
  }
  
  return result;
}

/**
 * Setup Supabase auth state listener to handle token rotation
 * This ensures refresh tokens are stored securely when Supabase auto-refreshes
 */
export function setupAuthInterceptor(supabaseClient: SupabaseClient<any>) {
  // Listen for token refresh events from Supabase
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && session?.refresh_token) {
      // Store the new refresh token (token rotation)
      // Lazy import to break circular dependency
      import('../auth/refreshToken').then(({ storeSessionTokens }) => {
        storeSessionTokens(session);
      });
    }
  });
}

