/**
 * App Configuration
 * Environment variables and app-wide constants
 */

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Production diagnostics: Log config on startup (sanitized)
console.log('[CONFIG] Environment check:', {
  SUPABASE_URL: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 30)}...` : 'MISSING',
  SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 20)}...` : 'MISSING',
  __DEV__,
  EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV,
  NODE_ENV: process.env.NODE_ENV,
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const errorMessage = 'CRITICAL: Missing required Supabase environment variables (EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY)';
  
  console.error('[CONFIG] ❌ Missing configuration detected!');
  console.error('[CONFIG] SUPABASE_URL:', SUPABASE_URL);
  console.error('[CONFIG] SUPABASE_ANON_KEY length:', SUPABASE_ANON_KEY?.length || 0);
  console.error('[CONFIG] All process.env keys:', Object.keys(process.env).filter(k => k.startsWith('EXPO_PUBLIC_')));
  
  if (!__DEV__) {
    // Production: Fail immediately - app cannot function without these
    throw new Error(errorMessage + '\n\nPlease configure EAS secrets or environment variables.');
  }
  
  // Development: Warn but continue (allows for local dev without .env)
  console.warn('[CONFIG] ' + errorMessage);
  console.warn('[CONFIG] App may not function correctly. Please configure .env file.');
}

export const APP_CONFIG = {
  name: 'Expiry App',
  version: '1.0.0',
  defaultNotificationTime: '09:00',
  defaultTimezone: 'Asia/Jerusalem',
  statusThresholdDays: 7, // Items expiring within 7 days are "soon"
} as const;

