/**
 * Refresh token service with rotation
 * Handles token refresh and rotation logic
 */

import { supabase } from '../supabase/client';
import { storeRefreshToken, getRefreshToken, removeRefreshToken } from '../storage/tokenStorage';
import type { Session } from '@supabase/supabase-js';

/**
 * Refresh the access token using the refresh token
 * Implements token rotation - new refresh token is issued on each refresh
 */
export async function refreshAccessToken(): Promise<{ session: Session | null; error: Error | null }> {
  try {
    const refreshToken = await getRefreshToken();
    
    if (!refreshToken) {
      return { session: null, error: new Error('No refresh token found') };
    }

    // Check if Supabase already has a session
    const { data: currentSession } = await supabase.auth.getSession();
    
    if (currentSession.session) {
      // Supabase has a session, try to refresh it
      // Supabase will automatically use the refresh token from the session
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        // If refresh fails, try setting session with our stored refresh token
        await removeRefreshToken();
        return { session: null, error: error as Error };
      }
      
      if (data.session) {
        // Store the new refresh token (token rotation)
        if (data.session.refresh_token) {
          await storeRefreshToken(data.session.refresh_token);
        }
        return { session: data.session, error: null };
      }
    } else {
      // No current session, set it using our stored refresh token
      // We need to get a user first - try to get user with the refresh token
      // Actually, we can set a session with just the refresh token
      const { data, error } = await supabase.auth.setSession({
        access_token: '', // Empty access token, Supabase will refresh it
        refresh_token: refreshToken,
      });
      
      if (error) {
        await removeRefreshToken();
        return { session: null, error: error as Error };
      }
      
      if (data.session) {
        // Store the new refresh token (token rotation)
        if (data.session.refresh_token) {
          await storeRefreshToken(data.session.refresh_token);
        }
        return { session: data.session, error: null };
      }
    }

    return { session: null, error: new Error('No session returned from refresh') };
  } catch (error) {
    await removeRefreshToken();
    return { session: null, error: error as Error };
  }
}

/**
 * Store session tokens (called after sign in/sign up)
 */
export async function storeSessionTokens(session: Session | null): Promise<void> {
  if (session?.refresh_token) {
    await storeRefreshToken(session.refresh_token);
  }
}

/**
 * Revoke refresh token and clear storage
 */
export async function revokeRefreshToken(): Promise<void> {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      // Revoke the token with Supabase
      await supabase.auth.signOut();
    }
  } catch (error) {
    console.error('Error revoking refresh token:', error);
  } finally {
    // Always clear local storage
    await removeRefreshToken();
  }
}

