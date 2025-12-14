-- Migration: Unify all name columns to profile_name
-- This migration consolidates full_name, username, and business_name into a single profile_name column
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. PROFILES TABLE
-- ============================================

-- Add profile_name if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS profile_name TEXT;

-- Migrate data: prefer profile_name → business_name → username → full_name
-- Only use columns that exist (use CASE to check column existence dynamically)
DO $$
BEGIN
  -- Check which columns exist and migrate accordingly
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'business_name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'username'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'full_name'
  ) THEN
    -- All columns exist
    UPDATE public.profiles
    SET profile_name = COALESCE(profile_name, business_name, username, full_name)
    WHERE profile_name IS NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'business_name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'username'
  ) THEN
    -- business_name and username exist, but not full_name
    UPDATE public.profiles
    SET profile_name = COALESCE(profile_name, business_name, username)
    WHERE profile_name IS NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'business_name'
  ) THEN
    -- Only business_name exists
    UPDATE public.profiles
    SET profile_name = COALESCE(profile_name, business_name)
    WHERE profile_name IS NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'username'
  ) THEN
    -- Only username exists
    UPDATE public.profiles
    SET profile_name = COALESCE(profile_name, username)
    WHERE profile_name IS NULL;
  END IF;
END $$;

-- Update unique index to use profile_name instead of business_name
-- Drop old index if it exists
DROP INDEX IF EXISTS idx_profiles_business_name_unique;
DROP INDEX IF EXISTS idx_profiles_profile_name_unique;

-- Create unique index on profile_name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_profile_name_unique
ON public.profiles(LOWER(TRIM(profile_name)))
WHERE profile_name IS NOT NULL AND TRIM(profile_name) != '';

-- Add comment
COMMENT ON COLUMN public.profiles.profile_name IS 'Unique profile name (replaces full_name, username, and business_name)';

-- ============================================
-- 2. TERMS_ACCEPTANCE TABLE
-- ============================================

-- Add profile_name if it doesn't exist
ALTER TABLE public.terms_acceptance
ADD COLUMN IF NOT EXISTS profile_name TEXT;

-- Migrate data: prefer profile_name → business_name → username → full_name
-- Only use columns that exist
DO $$
BEGIN
  -- Check which columns exist and migrate accordingly
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'business_name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'username'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'full_name'
  ) THEN
    -- All columns exist
    UPDATE public.terms_acceptance
    SET profile_name = COALESCE(profile_name, business_name, username, full_name)
    WHERE profile_name IS NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'business_name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'username'
  ) THEN
    -- business_name and username exist, but not full_name
    UPDATE public.terms_acceptance
    SET profile_name = COALESCE(profile_name, business_name, username)
    WHERE profile_name IS NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'business_name'
  ) THEN
    -- Only business_name exists
    UPDATE public.terms_acceptance
    SET profile_name = COALESCE(profile_name, business_name)
    WHERE profile_name IS NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'username'
  ) THEN
    -- Only username exists
    UPDATE public.terms_acceptance
    SET profile_name = COALESCE(profile_name, username)
    WHERE profile_name IS NULL;
  END IF;
END $$;

-- Make old columns nullable (if they exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'username'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.terms_acceptance
    ALTER COLUMN username DROP NOT NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'terms_acceptance' 
    AND column_name = 'business_name'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.terms_acceptance
    ALTER COLUMN business_name DROP NOT NULL;
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN public.terms_acceptance.profile_name IS 'Profile name (replaces full_name, username, and business_name)';

-- ============================================
-- 3. BUSINESSES TABLE
-- ============================================

-- Note: businesses table uses 'name' column, not business_name
-- If you want to add profile_name to businesses, uncomment below:
-- ALTER TABLE public.businesses
-- ADD COLUMN IF NOT EXISTS profile_name TEXT;
-- 
-- UPDATE public.businesses
-- SET profile_name = COALESCE(profile_name, name)
-- WHERE profile_name IS NULL;

-- ============================================
-- 4. VERIFY MIGRATION
-- ============================================

-- Simple verification queries
-- Run these to verify the migration worked correctly
SELECT 
  COUNT(*) as total_profiles,
  COUNT(profile_name) as profiles_with_profile_name
FROM public.profiles;

SELECT 
  COUNT(*) as total_terms,
  COUNT(profile_name) as terms_with_profile_name
FROM public.terms_acceptance;

