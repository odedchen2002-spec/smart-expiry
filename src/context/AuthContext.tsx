/**
 * Authentication Context
 * Manages user authentication state with persistent login
 * Implements refresh token rotation and secure storage
 */

import { refreshAccessToken, storeSessionTokens } from '@/lib/auth/refreshToken';
import type { SignInData, SignUpData } from '@/lib/supabase/auth';
import { getSession, getCurrentUser, onAuthStateChange, signIn, signInWithApple, signInWithGoogle, signOut, signUp, syncAuthEmailToProfile } from '@/lib/supabase/auth';
import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECOVERY_FLAG_KEY = 'password_recovery_active';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'password_recovery';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  status: AuthStatus;
  isRecoveryFlow: boolean;
  needsProfileCompletion: boolean;
  profile: any;
  isProfileLoaded: boolean;
  isProfileComplete: boolean;
  markProfileAsComplete: (updatedProfile: any) => void;
  signIn: (data: SignInData) => Promise<{ error: any; user: User | null }>;
  signUp: (data: SignUpData) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithApple: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfileCompletion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [isProfileLoaded, setIsProfileLoaded] = useState<boolean>(false);

  const lastUserIdRef = useRef<string | null>(null);
  const isSignedOutRef = useRef<boolean>(false); // Track if we've signed out to prevent stale async operations

  /**
   * Check if user needs to complete their profile
   *
   * A profile is considered incomplete if:
   * - profile_name is null or empty
   * - OR email is null or empty
   * - OR is_profile_complete is false
   * - OR terms have not been accepted yet
   * - OR (auth email is an Apple private relay AND there is no real profile email yet)
   */
  const checkNeedsProfileCompletion = (user: User | null, profile: any): boolean => {
    if (!user) {
      return false;
    }
    
    if (!profile) {
      return true; // user exists but no profile row -> force completion
    }

    // Check both profile_name and full_name fields (some profiles might use one or the other)
    const profileName = (profile.profile_name ?? profile.full_name ?? '').trim();
    const profileEmail = (profile.email ?? '').trim();
    const authEmail = (user.email ?? '').trim();
    const effectiveEmail = profileEmail || authEmail;
    const isProfileComplete = profile.is_profile_complete === true;
    // Terms acceptance can be represented by either the legacy fields
    // (accepted_terms_at + terms_hash) or the boolean has_accepted_terms flag.
    const hasAcceptedTermsLegacy = !!profile.accepted_terms_at && !!profile.terms_hash;
    const hasAcceptedTermsFlag = profile.has_accepted_terms === true;
    const hasAcceptedTerms = hasAcceptedTermsLegacy || hasAcceptedTermsFlag;

    const missingProfileName = profileName === '';
    // Consider email present if it exists either in profile or on the auth user
    const missingEmail = effectiveEmail === '';
    const isMarkedIncomplete = profile.is_profile_complete === false;

    const hasPrivateRelayEmail =
      user.email?.endsWith('@privaterelay.appleid.com') ?? false;
    const hasRealProfileEmail = profileEmail !== '';

    const needsCompletion = (
      missingProfileName ||
      missingEmail ||
      isMarkedIncomplete ||
      !hasAcceptedTerms ||
      (hasPrivateRelayEmail && !hasRealProfileEmail)
    );

    return needsCompletion;
  };

  useEffect(() => {
    const applyAuthState = async (nextSession: Session | null) => {
      // Early return if no session - do not run profile checks or set authenticated status
      if (!nextSession || !nextSession.user || !nextSession.user.id) {
        setUser(null);
        setSession(null);
        setProfile(null);
        setNeedsProfileCompletion(false);
        setLoading(false);
        setStatus('unauthenticated');
        lastUserIdRef.current = null; // Clear cached user id
        return;
      }

      const nextUser = nextSession.user;
      const nextUserId = nextUser.id;

      // At this point we're guaranteed to have a valid session with a user

      // Store refresh token when session changes (handles token rotation)
      if (nextSession?.refresh_token) {
        await storeSessionTokens(nextSession);
      }

      // Load profile - we know nextUser.id exists at this point
      // But first check if we've been signed out during this async operation
      if (isSignedOutRef.current) {
        return;
      }
      
      let profileData: any = null;
      const { supabase } = await import('../lib/supabase/client');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', nextUser.id)
        .maybeSingle();

      // Check again after async operation - we might have been signed out
      if (isSignedOutRef.current) {
        return;
      }

      if (profileError) {
        console.error('[AuthContext] Error loading profile:', profileError);
      }

      // Final check before setting state - ensure we haven't been signed out
      if (isSignedOutRef.current) {
        return;
      }

      profileData = profile;
      setProfile(profileData);
      setIsProfileLoaded(true);

      // After we know profile row exists (or not), sync auth email and terms (best-effort)
      try {
        await syncAuthEmailToProfile(nextUser);
        // If terms are not fully accepted yet, and user accepted in UI at signup,
        // sync terms again on login as a safety net
        if (
          profileData &&
          profileData.has_accepted_terms !== true &&
          !(profileData.accepted_terms_at && profileData.terms_hash)
        ) {
          await syncTermsOnSignUp(nextUser, true);
        }
      } catch (syncError) {
        console.error('[AuthContext] Failed to sync auth email/terms to profile:', syncError);
      }

      // Check if profile needs completion (handles missing profile row as incomplete)
      const needsCompletion = checkNeedsProfileCompletion(nextUser, profileData);
      setNeedsProfileCompletion(needsCompletion);

      // Update user state - we have a valid user at this point
      if (lastUserIdRef.current !== nextUserId) {
        setUser(nextUser);
        lastUserIdRef.current = nextUserId;
      }
      
      // Update session state
      const prevSessionToken = session?.access_token;
      const nextSessionToken = nextSession?.access_token;
      const shouldUpdateSession = prevSessionToken !== nextSessionToken;
      
      if (shouldUpdateSession || !session) {
        setSession(nextSession);
      }
      
      // Final check before setting authenticated status
      if (isSignedOutRef.current) {
        return;
      }

      setLoading(false);
      
      // At this point we have a valid session and user, so status must be authenticated
      setStatus('authenticated');
    };

    // On app start: try to refresh token silently
    const initializeAuth = async () => {
      try {
        // Set status to loading while checking
        setStatus('loading');
        
        // First, try to get existing or refreshed session
        let { session: existingSession } = await getSession();

        // If no session at all, treat as signed out
        if (!existingSession) {
          await applyAuthState(null);
          return;
        }

        // Double-check with the auth service that the user still exists.
        // This catches cases where the user was deleted in Supabase Auth
        // but we still have an old token on the device.
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          console.log('[Auth] getUser returned null or error, treating as signed out');
          try {
            await signOut();
          } catch {
            // ignore signOut errors
          }
          await applyAuthState(null);
          return;
        }

        await applyAuthState(existingSession);
      } catch (error) {
        console.error('Error initializing auth:', error);
        await applyAuthState(null);
      }
    };

    initializeAuth();

    // Setup interceptor for token rotation (after client is initialized)
    import('../lib/supabase/client').then(({ setupSupabaseInterceptor }) => {
      setupSupabaseInterceptor();
    });

    // Listen for auth changes (handles token rotation from Supabase and signout)
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      // Handle SIGNED_OUT or no session/user - clear everything and DO NOT run profile checks
      // Check both session existence AND session.user existence to be safe
      if (event === 'SIGNED_OUT' || !session || !session.user || !session.user.id) {
        // Mark as signed out to prevent any async profile loading from completing
        isSignedOutRef.current = true;
        setUser(null);
        setSession(null);
        setProfile(null);
        setNeedsProfileCompletion(false);
        setIsProfileLoaded(false);
        setLoading(false);
        setIsRecoveryFlow(false);
        setStatus('unauthenticated');
        lastUserIdRef.current = null; // IMPORTANT: clear any cached user id
        // Clear recovery flag
        try {
          await AsyncStorage.removeItem(RECOVERY_FLAG_KEY);
        } catch (error) {
          // Ignore errors
        }
        // CRITICAL: Return immediately - do NOT call applyAuthState or any profile loaders
        return;
      }

      // If we reach here, we have a valid session - mark as signed in
      isSignedOutRef.current = false;

      // From here on, we know we have a valid session with a user

      // Password recovery / reset flow detection
      // Check for PASSWORD_RECOVERY event or recovery flag in AsyncStorage
      let isRecoverySession = event === 'PASSWORD_RECOVERY';
      
      // Check AsyncStorage flag if SIGNED_IN event (since Supabase may fire SIGNED_IN instead of PASSWORD_RECOVERY)
      if (event === 'SIGNED_IN' && session) {
        try {
          const recoveryFlag = await AsyncStorage.getItem(RECOVERY_FLAG_KEY);
          if (recoveryFlag === 'true') {
            isRecoverySession = true;
            // Clear the flag after checking
            await AsyncStorage.removeItem(RECOVERY_FLAG_KEY);
          }
        } catch (error) {
          console.error('[AuthContext] Error checking recovery flag:', error);
        }
      }

      if (isRecoverySession) {
        // Set session and user for recovery flow
        setSession(session ?? null);
        setUser(session?.user ?? null);
        setIsRecoveryFlow(true);
        setStatus('password_recovery');
        setLoading(false);
        // Don't check profile or apply normal auth state for recovery flow
        return;
      }
      
      try {
        // Normal authentication flow - only runs when we have a valid session
        setIsRecoveryFlow(false);
        await applyAuthState(session);
      } catch (error) {
        console.error('[AuthContext] applyAuthState error:', error);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async (data: SignInData) => {
    const result = await signIn(data);
    if (result.error) {
      return { error: result.error, user: null };
    }
    return { error: null, user: result.user ?? null };
  };

  const handleSignUp = async (data: SignUpData) => {
    const result = await signUp(data);
    if (result.error) {
      return { error: result.error };
    }
    return { error: null };
  };

  const handleSignInWithGoogle = async () => {
    try {
      const result = await signInWithGoogle();
      if (result.hasError) {
        return { error: result.error };
      }
      return { error: null };
    } catch (err: any) {
      console.error('[AuthContext] Auth error:', err);
      return { error: err };
    }
  };

  const handleSignInWithApple = async () => {
    try {
      const result = await signInWithApple();
      if (result.hasError) {
        return { error: result.error };
      }
      return { error: null };
    } catch (err: any) {
      console.error('[AuthContext] Auth error:', err);
      return { error: err };
    }
  };

  const handleSignOut = async () => {
    // Set loading to false and clear user immediately to prevent white screen
    setLoading(false);
    setStatus('unauthenticated');
    setIsRecoveryFlow(false);
    setNeedsProfileCompletion(false);
    setProfile(null);
    lastUserIdRef.current = null;
    setUser(null);
    setSession(null);
    // Clear recovery flag if it exists
    try {
      await AsyncStorage.removeItem(RECOVERY_FLAG_KEY);
    } catch (error) {
      // Ignore errors
    }
    // Then call signOut to clear server-side session
    await signOut();
  };

  const refreshProfileCompletion = async () => {
    if (!user?.id) {
      setNeedsProfileCompletion(false);
      return;
    }

    try {
      const { supabase } = await import('../lib/supabase/client');
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[AuthContext] Error loading profile for refresh:', error);
        setProfile(null);
        const needsCompletion = checkNeedsProfileCompletion(user, null);
        setNeedsProfileCompletion(needsCompletion);
        return;
      }

      // Update profile state first (may be null if row is missing)
      setProfile(profileData);
      setIsProfileLoaded(true);
      
      // Then check and update needsProfileCompletion
      const needsCompletion = checkNeedsProfileCompletion(user, profileData);
      setNeedsProfileCompletion(needsCompletion);
      
      // Return a promise that resolves after state update
      // This gives React time to process the state update
      return new Promise<void>((resolve) => {
        // Use setTimeout to ensure state update is processed
        setTimeout(() => {
          resolve();
        }, 100);
      });
    } catch (error) {
      console.error('[AuthContext] Error refreshing profile completion:', error);
      const needsCompletion = checkNeedsProfileCompletion(user, profile);
      setNeedsProfileCompletion(needsCompletion);
    }
  };

  const markProfileAsComplete = (updatedProfile: any) => {
    setProfile(updatedProfile);
    setIsProfileLoaded(true);
    const needsCompletion = checkNeedsProfileCompletion(user, updatedProfile);
    setNeedsProfileCompletion(needsCompletion);
  };

  const isProfileComplete = !!profile && (() => {
    const name =
      (profile.profile_name ?? profile.full_name ?? profile.name ?? '').trim();
    const email = (profile.email ?? '').trim();
    const hasAcceptedTerms = profile.has_accepted_terms === true;
    return !!name && !!email && hasAcceptedTerms;
  })();

  const value: AuthContextType = {
    user,
    session,
    loading,
    status,
    isRecoveryFlow,
    needsProfileCompletion,
    profile,
    isProfileLoaded,
    isProfileComplete,
    markProfileAsComplete,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithApple: handleSignInWithApple,
    signOut: handleSignOut,
    refreshProfileCompletion,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

