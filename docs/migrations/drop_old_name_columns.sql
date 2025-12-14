-- Migration: Drop old name columns after migration to profile_name is complete
-- ⚠️ WARNING: Only run this migration AFTER verifying the app works correctly with profile_name only
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. PROFILES TABLE
-- ============================================

-- Drop old name columns from profiles table
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS full_name,
DROP COLUMN IF EXISTS username,
DROP COLUMN IF EXISTS business_name;

-- ============================================
-- 2. TERMS_ACCEPTANCE TABLE
-- ============================================

-- Drop old name columns from terms_acceptance table
ALTER TABLE public.terms_acceptance
DROP COLUMN IF EXISTS full_name,
DROP COLUMN IF EXISTS username,
DROP COLUMN IF EXISTS business_name;

-- ============================================
-- 3. VERIFY DROPPED COLUMNS
-- ============================================

-- Check that old columns are gone and profile_name exists
SELECT 
  'profiles' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'profiles'
AND column_name IN ('profile_name', 'full_name', 'username', 'business_name')
ORDER BY column_name;

SELECT 
  'terms_acceptance' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'terms_acceptance'
AND column_name IN ('profile_name', 'full_name', 'username', 'business_name')
ORDER BY column_name;

