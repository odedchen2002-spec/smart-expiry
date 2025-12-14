-- Migration: Drop privacy_accepted_at column
-- This column is no longer needed as we use accepted_terms_at instead
-- Run this SQL in your Supabase SQL editor

-- Drop privacy_accepted_at from profiles table if it exists
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS privacy_accepted_at;

-- Drop privacy_accepted_at from terms_acceptance table if it exists
ALTER TABLE public.terms_acceptance
DROP COLUMN IF EXISTS privacy_accepted_at;

-- Verify the column has been dropped
SELECT 
  'profiles' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'profiles'
AND column_name = 'privacy_accepted_at';

SELECT 
  'terms_acceptance' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'terms_acceptance'
AND column_name = 'privacy_accepted_at';

-- Both queries should return 0 rows if the column was successfully dropped

