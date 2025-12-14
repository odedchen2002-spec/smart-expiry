-- Migration: Remove unused expiry notification columns from profiles table
-- These columns were moved to user_preferences table
-- Run this SQL in your Supabase SQL editor
--
-- Dependencies checked:
-- - No views reference these columns (items_with_details does not use profiles)
-- - No RLS policies reference these columns (policies only check auth.uid() = id)
-- - Edge Function check-expiring-items now uses user_preferences, not profiles
-- - App code does not reference these columns in profiles
--
-- Safe to drop these columns.

-- Drop the unused columns from profiles table
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS expiry_notify_enabled,
  DROP COLUMN IF EXISTS expiry_notify_time,
  DROP COLUMN IF EXISTS expiry_timezone,
  DROP COLUMN IF EXISTS expiry_settings_updated_at,
  DROP COLUMN IF EXISTS expiry_last_notified_at,
  DROP COLUMN IF EXISTS expiry_last_notified_settings_updated_at;

-- Note: expo_push_token is NOT in profiles table - it's stored in user_devices table
-- So we don't need to drop it from profiles

-- Verification query (run after migration to confirm columns are removed):
-- SELECT column_name 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'profiles' 
--   AND column_name LIKE 'expiry%';

