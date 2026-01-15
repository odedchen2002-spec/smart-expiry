/**
 * Supabase authentication helpers
 * Enhanced with secure refresh token storage
 */

import type { AuthError, Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Alert, Platform } from 'react-native';
import { storeSessionTokens } from '../auth/refreshToken';
import { CURRENT_TERMS_TEXT, TERMS_HASH } from '../constants/legal';
import { supabase } from './client';

export interface SignUpData {
  email: string;
  password: string;
  username: string; // Changed from profileName to username
  hasAcceptedTerms?: boolean; // whether the user accepted terms on signup UI
}

export interface SignInData {
  email: string;
  password: string;
}

const REUSED_ACCOUNT_ALERT_TITLE = 'לא ניתן להירשם';
const REUSED_ACCOUNT_ALERT_MESSAGE =
  'הכתובת הזו כבר הייתה בשימוש בעבר. נסה להתחבר עם החשבון הקיים, או השתמש בכתובת אימייל אחרת.';
const REUSED_ACCOUNT_ALERT_MESSAGE_SIGNUP =
  'הכתובת הזו כבר הייתה בשימוש בעבר. אי אפשר להשתמש בה שוב להרשמה. השתמש בכתובת אימייל אחרת.';

function isReusedAccountError(error: any): boolean {
  if (!error) return false;
  const code = error.code || error.status || error?.error?.code;
  const message = (error.message || '').toString().toLowerCase();

  return (
    code === '23503' ||
    message.includes('terms_acceptance_user_id_fkey') ||
    message.includes('profiles_id_fkey') ||
    message.includes('user already registered')
  );
}

function handleReusedAccountError(): {
  user: null;
  session: null;
  error: AuthError;
  warning: null;
  requiresEmailVerification: false;
} {
  Alert.alert(REUSED_ACCOUNT_ALERT_TITLE, REUSED_ACCOUNT_ALERT_MESSAGE);
  return {
    user: null,
    session: null,
    error: { message: 'ACCOUNT_REUSED' } as AuthError,
    warning: null,
    requiresEmailVerification: false,
  };
}

function showReusedAccountSignupAlert() {
  Alert.alert(REUSED_ACCOUNT_ALERT_TITLE, REUSED_ACCOUNT_ALERT_MESSAGE_SIGNUP);
}

type SaveTermsResult =
  | { success: true; warning?: string }
  | { success: false; reusedDeletedUser: true }
  | { success: false; error: Error };

type SaveProfileResult =
  | { success: true }
  | { success: false; reusedDeletedUser: true }
  | { success: false; error: Error };

async function saveTermsAcceptance(userId: string, profileName: string): Promise<SaveTermsResult> {
  const signedAt = new Date().toISOString();
  const fallbackWarning = 'נכשל בשמירת אישור תנאי השימוש. ההרשמה הושלמה בהצלחה.';

  try {
    const { error: rpcError } = await supabase.rpc('insert_terms_acceptance', {
      p_user_id: userId,
      p_profile_name: profileName,
      p_terms_text: CURRENT_TERMS_TEXT,
      p_signed_at: signedAt,
    });

    if (rpcError) {
      // Foreign key / reused deleted user - NEVER throw, only return
      if (isReusedAccountError(rpcError)) {
        console.warn('signup: user tried to reuse a deleted account (terms)', rpcError);
        return { success: false, reusedDeletedUser: true };
      }

      if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
        console.warn('RPC function insert_terms_acceptance not found, trying direct insert');
        const { error: insertError } = await supabase
          .from('terms_acceptance')
          .insert({
            user_id: userId,
            profile_name: profileName,
            terms_text: CURRENT_TERMS_TEXT,
            signed_at: signedAt,
          });

        if (insertError) {
          // Foreign key / reused deleted user - NEVER throw, only return
          if (isReusedAccountError(insertError)) {
            console.warn('signup: user tried to reuse a deleted account (terms)', insertError);
            return { success: false, reusedDeletedUser: true };
          }
          console.error('Error saving terms acceptance:', insertError);
          return { success: true, warning: fallbackWarning };
        }
      } else {
        console.error('Error saving terms acceptance via RPC:', rpcError);
        return { success: true, warning: fallbackWarning };
      }
    }

    return { success: true };
  } catch (error: any) {
    // Foreign key / reused deleted user - NEVER throw, only return
    if (isReusedAccountError(error)) {
      console.warn('signup: user tried to reuse a deleted account (terms)', error);
      return { success: false, reusedDeletedUser: true };
    }
    console.error('signup: terms RPC threw', error);
    return { success: false, error: error as Error };
  }
}

async function saveProfileRecord(
  userId: string,
  profileName: string,
  session: Session | null
): Promise<SaveProfileResult> {
  const acceptedAt = new Date().toISOString();

  try {
    const { error: rpcError } = await supabase.rpc('upsert_profile_on_signup', {
      p_user_id: userId,
      p_profile_name: profileName,
      p_accepted_terms_at: acceptedAt,
      p_terms_hash: TERMS_HASH,
    });

    if (rpcError) {
      // Foreign key / reused deleted user - NEVER throw, only return
      if (isReusedAccountError(rpcError)) {
        console.warn('signup: user tried to reuse a deleted account (profile)', rpcError);
        return { success: false, reusedDeletedUser: true };
      }

      if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
        console.warn('RPC function upsert_profile_on_signup not found, trying direct upsert');
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: userId,
              accepted_terms_at: acceptedAt,
              terms_hash: TERMS_HASH,
              username: profileName,
              updated_at: acceptedAt,
            },
            { onConflict: 'id' }
          );

        if (profileError) {
          // Foreign key / reused deleted user - NEVER throw, only return
          if (isReusedAccountError(profileError)) {
            console.warn('signup: user tried to reuse a deleted account (profile)', profileError);
            return { success: false, reusedDeletedUser: true };
          }
          if (
            profileError.code === '23505' ||
            profileError.message?.includes('unique') ||
            profileError.message?.includes('duplicate')
          ) {
            if (session) {
              await supabase.auth.signOut();
            }
            throw new Error('Username already exists');
          }
          console.warn('Failed to save profile:', profileError);
        }
      } else {
        if (
          rpcError.code === '23505' ||
          rpcError.message?.includes('unique') ||
          rpcError.message?.includes('duplicate')
        ) {
          if (session) {
            await supabase.auth.signOut();
          }
          throw new Error('Username already exists');
        }
        console.error('signup: profile RPC error', rpcError);
        return { success: false, error: rpcError as Error };
      }
    }

    return { success: true };
  } catch (error: any) {
    // Foreign key / reused deleted user - NEVER throw, only return
    if (isReusedAccountError(error)) {
      console.warn('signup: user tried to reuse a deleted account (profile)', error);
      return { success: false, reusedDeletedUser: true };
    }

    if (
      (error as Error)?.message?.includes('Username already exists') ||
      (error as Error)?.message?.includes('already exists')
    ) {
      throw error;
    }

    console.error('signup: profile RPC threw', error);
    return { success: false, error: error as Error };
  }
}

type SyncEmailResult =
  | { success: true }
  | { success: false; error: Error };

type SyncTermsResult =
  | { success: true }
  | { success: false; error: Error };

/**
 * Ensure the user's auth email is stored on the profile row.
 * This runs after signup / on session to keep the "email" field in sync.
 * 
 * IMPORTANT: If the auth email is an Apple private relay email, we do NOT
 * overwrite an existing real email in the profile. This preserves the
 * contact email the user entered during profile completion.
 */
export async function syncAuthEmailToProfile(user: User): Promise<SyncEmailResult> {
  const authUserId = user?.id;
  const authEmail = user?.email ?? null;

  console.log('[Auth] syncAuthEmailToProfile called', { authUserId, authEmail });

  if (!authUserId || !authEmail) {
    console.log('[Auth] Missing authUserId or email, skipping profile email sync');
    return { success: true };
  }

  // Check if this is an Apple private relay email
  const isPrivateRelayEmail = authEmail.endsWith('@privaterelay.appleid.com');

  try {
    // If it's a private relay email, check if profile already has a real email
    if (isPrivateRelayEmail) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', authUserId)
        .maybeSingle();

      const existingEmail = existingProfile?.email?.trim() ?? '';
      const hasRealEmail = existingEmail !== '' && !existingEmail.endsWith('@privaterelay.appleid.com');

      if (hasRealEmail) {
        console.log('[Auth] Profile already has real email, skipping private relay email sync', {
          authUserId,
          existingEmail,
        });
        return { success: true };
      }
    }

    // First try to UPDATE existing profile row
    const { data, error } = await supabase
      .from('profiles')
      .update({ email: authEmail })
      .eq('id', authUserId)
      .select('id, email')
      .single();

    if (error) {
      // PGRST116: no rows found for update → fall back to INSERT
      if ((error as any).code === 'PGRST116') {
        console.log('[Auth] No profile row found for email sync, attempting to INSERT profile with email', {
          authUserId,
          email: authEmail,
        });

        const { data: insertData, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: authUserId,
            email: authEmail,
          })
          .select('id, email')
          .single();

        if (insertError) {
          console.log('[Auth] Failed to INSERT profile with email', { authUserId, insertError });
          return { success: false, error: insertError as Error };
        }

        console.log('[Auth] Successfully INSERTED profile with email', insertData);
        return { success: true };
      }

      console.log('[Auth] Failed to update profiles.email', { authUserId, error });
      return { success: false, error: error as Error };
    }

    console.log('[Auth] Successfully updated profiles.email', data);
    return { success: true };
  } catch (error: any) {
    console.error('[Auth] Error syncing auth email to profiles table', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Ensure the user's terms acceptance fields are written to the profiles table.
 * This is a client-side safety net in addition to any RPC logic.
 */
export async function syncTermsOnSignUp(user: User, hasAcceptedTerms: boolean): Promise<SyncTermsResult> {
  const userId = user?.id;
  if (!userId) {
    return { success: true };
  }

  if (!hasAcceptedTerms) {
    console.log('[Auth] User did not accept terms on sign-up, skipping terms update');
    return { success: true };
  }

  const nowIso = new Date().toISOString();

  try {
    // First try to UPDATE existing profile row
    const { data, error } = await supabase
      .from('profiles')
      .update({
        has_accepted_terms: true,
        accepted_terms_at: nowIso,
        terms_hash: TERMS_HASH,
      })
      .eq('id', userId)
      .select('id, has_accepted_terms, accepted_terms_at, terms_hash')
      .single();

    if (error) {
      // PGRST116: no rows found for update → fall back to INSERT
      if ((error as any).code === 'PGRST116') {
        console.log('[Auth] No profile row for terms update, attempting to INSERT one', { userId });

        const { data: insertData, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            has_accepted_terms: true,
            accepted_terms_at: nowIso,
            terms_hash: TERMS_HASH,
          })
          .select('id, has_accepted_terms, accepted_terms_at, terms_hash')
          .single();

        if (insertError) {
          console.log('[Auth] Failed to INSERT profile with terms acceptance', { userId, insertError });
          return { success: false, error: insertError as Error };
        }

        console.log('[Auth] Successfully INSERTED profile with terms acceptance', insertData);
        return { success: true };
      }

      console.log('[Auth] Failed to update terms acceptance in profiles', { userId, error });
      return { success: false, error: error as Error };
    }

    console.log('[Auth] Updated terms acceptance in profiles', data);
    return { success: true };
  } catch (error: any) {
    console.error('[Auth] Error syncing terms acceptance to profiles', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Sign up a new user
 */
export async function signUp({ email, password, username, hasAcceptedTerms }: SignUpData) {
  try {
    // Validate username
    if (!username || !username.trim()) {
      throw new Error('Username is required');
    }

    const trimmedUsername = username.trim();

    // Normalize email: trim whitespace and convert to lowercase
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new Error('Invalid email address');
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { username: trimmedUsername },
      },
    });

    if (error) {
      // Show error to the user and stop
      console.error('Signup error:', error);
      return { user: null, session: null, error: error as AuthError, warning: null, requiresEmailVerification: false };
    }

    // Do NOT require data.session here.
    // Treat a valid data.user as a successful signup.
    const user = data.user;

    if (!user) {
      console.error('Signup succeeded but no user returned');
      return { 
        user: null, 
        session: null, 
        error: { message: 'Signup failed, please try again' } as AuthError, 
        warning: null,
        requiresEmailVerification: false,
      };
    }

    const userId = user.id;

    // Store refresh token securely if session exists
    if (data.session) {
      await storeSessionTokens(data.session);
      
      // Set the session explicitly to ensure auth context is available
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    // 1) Terms acceptance
    const termsResult = await saveTermsAcceptance(userId, trimmedUsername);
    if ('reusedDeletedUser' in termsResult && termsResult.reusedDeletedUser) {
      Alert.alert(
        'לא ניתן להירשם',
        'הכתובת הזו כבר הייתה בשימוש בעבר. אי אפשר להשתמש בה שוב להרשמה. השתמש בכתובת אימייל אחרת.'
      );
      return {
        user: null,
        session: null,
        error: { message: 'ACCOUNT_REUSED' } as AuthError,
        warning: null,
        requiresEmailVerification: false,
      };
    }
    if (!termsResult.success) {
      throw termsResult.error; // keep existing generic behavior
    }
    const termsAcceptanceWarning = termsResult.warning ?? null;

    // 2) Profile
    const profileResult = await saveProfileRecord(userId, trimmedUsername, data.session);
    if ('reusedDeletedUser' in profileResult && profileResult.reusedDeletedUser) {
      Alert.alert(
        'לא ניתן להירשם',
        'הכתובת הזו כבר הייתה בשימוש בעבר. אי אפשר להשתמש בה שוב להרשמה. השתמש בכתובת אימייל אחרת.'
      );
      return {
        user: null,
        session: null,
        error: { message: 'ACCOUNT_REUSED' } as AuthError,
        warning: null,
        requiresEmailVerification: false,
      };
    }
    if (!profileResult.success) {
      throw profileResult.error; // keep existing generic behavior
    }

    // 3) Ensure auth email is written to the profiles table
    await syncAuthEmailToProfile(user);

    // 4) Ensure terms fields are written to the profiles table if user accepted terms
    // If hasAcceptedTerms is undefined, assume true because the UI enforces acceptance
    const acceptedOnUi = hasAcceptedTerms !== false;
    await syncTermsOnSignUp(user, acceptedOnUi);

    return { 
      user: user, 
      session: data.session, 
      error: null,
      warning: termsAcceptanceWarning,
      requiresEmailVerification: !data.session && !!user, // True if user created but no session (email confirmation required)
    };
  } catch (error: any) {
    console.error('signup error', error);
    console.error('SignUp function caught error:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    if (isReusedAccountError(error)) {
      return handleReusedAccountError();
    }
    // If it's a username uniqueness error, return it as an error
    if (error?.message?.includes('Username already exists') || 
        error?.message?.includes('already exists')) {
      return { 
        user: null, 
        session: null, 
        error: { message: error.message } as AuthError, 
        warning: null, 
        requiresEmailVerification: false 
      };
    }
    // For other errors, still return user: null but log the error
    return { user: null, session: null, error: error as AuthError, warning: null, requiresEmailVerification: false };
  }
}

/**
 * Helper function to check if user profile exists and sign out if it doesn't
 * Returns true if profile exists, false if it doesn't (and signs out)
 */
async function checkProfileExists(userId: string): Promise<boolean> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('Error checking profile:', profileError);
    // If there's a hard error (not just missing profile), don't sign out
    // Let the caller handle it
    return false;
  }

  if (!profile) {
    // Profile doesn't exist - sign out
    console.log('Profile not found for user:', userId, '- signing out');
    await supabase.auth.signOut();
    return false;
  }

  return true;
}

/**
 * Sign in an existing user
 */
export async function signIn({ email, password }: SignInData) {
  try {
    console.log('[Auth] signIn called for email:', email);
    console.log('[Auth] Supabase client URL:', supabase['supabaseUrl']?.substring(0, 40) + '...');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[Auth] signInWithPassword failed:', {
        message: error.message,
        status: error.status,
        name: error.name,
      });
      throw error;
    }

    const user = data.user;

    if (!user?.id) {
      throw new Error('Missing user information');
    }

    // Store refresh token securely
    if (data.session) {
      await storeSessionTokens(data.session);
    }

    // Fetch the profile to ensure the account still exists in our DB
    console.log('login: Checking profile for user:', user.id);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    console.log('login: loaded profile', profile ? 'found' : 'NOT FOUND', 'error:', profileError);

    if (profileError) {
      console.error('login: Error fetching profile', profileError);
      // If there's a hard error, throw it
      throw profileError;
    }

    if (!profile) {
      // Profile doesn't exist - account was deleted
      console.log('login: Profile not found - account was deleted, signing out');
      await supabase.auth.signOut();
      const deletedError = new Error('ACCOUNT_DELETED') as AuthError;
      deletedError.message = 'ACCOUNT_DELETED';
      return { user: null, session: null, error: deletedError };
    }

    console.log('login: Profile found, login successful');
    return { user, session: data.session, error: null };
  } catch (error) {
    return { user: null, session: null, error: error as AuthError };
  }
}

/**
 * Sign out the current user
 * Revokes refresh token, removes push tokens, and clears secure storage
 */
export async function signOut() {
  try {
    // Get current user ID before signing out (needed for push token removal)
    const { data: { user } } = await supabase.auth.getUser();
    
    // Remove push tokens to prevent notifications going to old account
    if (user?.id) {
      const { removeExpoPushToken } = await import('../notifications/pushNotifications');
      await removeExpoPushToken(user.id);
    }
    
    // Revoke refresh token and clear storage
    const { revokeRefreshToken } = await import('../auth/refreshToken');
    await revokeRefreshToken();
    
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as AuthError };
  }
}

/**
 * Get the current session
 * Attempts to refresh token if session is expired
 */
export async function getSession() {
  try {
    let { data, error } = await supabase.auth.getSession();
    
    // If no session, try to refresh using stored refresh token
    if (!data.session) {
      const { refreshAccessToken } = await import('../auth/refreshToken');
      const refreshResult = await refreshAccessToken();
      if (refreshResult.session && !refreshResult.error) {
        return { session: refreshResult.session, error: null };
      }
    }
    
    if (error) throw error;
    return { session: data.session, error: null };
  } catch (error) {
    return { session: null, error: error as AuthError };
  }
}

/**
 * Get the current user
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/**
 * Sign in with Google OAuth
 * 
 * This function handles the complete OAuth flow:
 * 1. Requests an OAuth URL from Supabase
 * 2. Opens the Google login page in a browser (Expo) or redirects (Web)
 * 3. Waits for the user to complete authentication
 * 4. Extracts the authentication tokens from the callback URL
 * 5. Sets the session in Supabase and stores tokens securely
 * 
 * IMPORTANT: Before using this function, make sure you have:
 * 1. Created a Google OAuth Client in Google Cloud Console
 * 2. Added the Client ID and Client Secret to Supabase:
 *    - Go to Supabase Dashboard → Authentication → Providers → Google
 *    - Enable Google provider
 *    - Paste your Client ID and Client Secret
 * 3. Added the redirect URL to Supabase:
 *    - Go to Authentication → URL Configuration → Redirect URLs
 *    - Add: expiryxclean://auth (for mobile)
 *    - Add: https://yourdomain.com/auth/callback (for web, if using custom domain)
 * 
 * @returns An object with user, session, and error (if any)
 */
/**
 * Sign in with Apple using native Apple Authentication
 * 
 * This function uses the native Apple SDK to get an identity token,
 * then passes it to Supabase using signInWithIdToken.
 * 
 * The Apple client secret (JWT) is configured in Supabase Dashboard:
 *    - Go to Supabase Dashboard → Authentication → Providers → Apple
 *    - Enter your Services ID and Secret Key
 *    - Client IDs must be comma-separated (NO spaces): 
 *      com.oded.expiryxclean.auth,com.oded.expiryxclean
 * 
 * After successful sign-in, Supabase will fire a SIGNED_IN event,
 * which is handled by AuthContext's onAuthStateChange listener.
 * 
 * @returns An object with user, session, and error (if any)
 */
export async function signInWithApple() {
  try {
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Apple Sign-In is not available on this device');
    }

    const randomBytes = Crypto.getRandomBytes(16);
    const rawNonce = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!appleCredential.identityToken) {
      throw new Error('No identity token returned from Apple');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: appleCredential.identityToken,
      nonce: rawNonce,
    });

    if (error) {
      throw error;
    }

    if (data.session) {
      await storeSessionTokens(data.session);
    }

    if (data.user?.id) {
      const profileExists = await checkProfileExists(data.user.id);
      if (!profileExists) {
        const deletedError = new Error('ACCOUNT_DELETED') as AuthError;
        deletedError.message = 'ACCOUNT_DELETED';
        return { 
          hasError: true, 
          error: deletedError 
        };
      }
    }

    return { 
      hasError: false, 
      hasSession: !!data.session, 
      hasUser: !!data.user 
    };
  } catch (error: any) {
    if (error?.code === 'ERR_REQUEST_CANCELED' || error?.message?.includes('canceled')) {
      return { 
        hasError: true, 
        error: new Error('Apple sign-in was cancelled') 
      };
    }

    console.error('[Auth] Apple sign-in error:', error);
    return { 
      hasError: true, 
      error: error as AuthError 
    };
  }
}

export async function signInWithGoogle() {
  try {
    const redirectUrl = 'expiryxclean://auth';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      throw error;
    }

    if (Platform.OS !== 'web') {
      if (!data.url) {
        throw new Error('No OAuth URL received from Supabase');
      }

      const { openAuthSessionAsync } = await import('expo-web-browser');
      const result = await openAuthSessionAsync(data.url, redirectUrl);
      
      if (result.type === 'success' && result.url) {
        let accessToken: string | null = null;
        let refreshToken: string | null = null;
        
        try {
          const url = new URL(result.url);
          accessToken = url.searchParams.get('access_token');
          refreshToken = url.searchParams.get('refresh_token');
          
          if (!accessToken && url.hash) {
            const hashParams = new URLSearchParams(url.hash.substring(1));
            accessToken = hashParams.get('access_token');
            refreshToken = hashParams.get('refresh_token');
          }
        } catch {
          const hashMatch = result.url.match(/#(.+)/);
          if (hashMatch) {
            const hashParams = new URLSearchParams(hashMatch[1]);
            accessToken = hashParams.get('access_token');
            refreshToken = hashParams.get('refresh_token');
          } else {
            const queryMatch = result.url.match(/[?&#](access_token|refresh_token)=([^&]+)/g);
            if (queryMatch) {
              queryMatch.forEach(param => {
                if (param.startsWith('access_token=')) {
                  accessToken = decodeURIComponent(param.split('=')[1]);
                } else if (param.startsWith('refresh_token=')) {
                  refreshToken = decodeURIComponent(param.split('=')[1]);
                }
              });
            }
          }
        }
        
        if (accessToken && refreshToken) {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (sessionError) {
            throw sessionError;
          }
          
          if (sessionData.session) {
            await storeSessionTokens(sessionData.session);
          }
          
          if (sessionData.user?.id) {
            const profileExists = await checkProfileExists(sessionData.user.id);
            if (!profileExists) {
              const deletedError = new Error('ACCOUNT_DELETED') as AuthError;
              deletedError.message = 'ACCOUNT_DELETED';
              return { 
                hasError: true, 
                error: deletedError 
              };
            }
          }
          
          return { 
            hasError: false, 
            hasSession: !!sessionData.session, 
            hasUser: !!sessionData.user 
          };
        } else {
          throw new Error('Authentication tokens not found in callback URL');
        }
      } else if (result.type === 'cancel') {
        return { 
          hasError: true, 
          error: new Error('Google sign-in was cancelled') 
        };
      } else {
        return { 
          hasError: true, 
          error: new Error('OAuth flow failed') 
        };
      }
    } else {
      return { hasError: false, hasSession: false, hasUser: false };
    }
  } catch (error: any) {
    console.error('[Auth] Google sign-in error:', error);
    return { hasError: true, error: error as AuthError };
  }
}

