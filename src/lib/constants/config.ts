/**
 * App Configuration
 * Environment variables and app-wide constants
 */

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const APP_CONFIG = {
  name: 'Expiry App',
  version: '1.0.0',
  defaultNotificationTime: '09:00',
  defaultTimezone: 'Asia/Jerusalem',
  statusThresholdDays: 7, // Items expiring within 7 days are "soon"
} as const;

