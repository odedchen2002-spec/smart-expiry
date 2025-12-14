-- Migration: Add business_name column to profiles table
-- This migration adds a unique business_name field to the profiles table
-- to keep it in sync with the app

-- Add business_name column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'business_name'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN business_name TEXT;
    END IF;
END $$;

-- Add UNIQUE constraint on business_name (case-insensitive)
-- First, drop the constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'profiles_business_name_unique'
    ) THEN
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_business_name_unique;
    END IF;
END $$;

-- Create unique index (case-insensitive) for business_name
-- This ensures no two profiles can have the same business name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_business_name_unique 
ON public.profiles(LOWER(TRIM(business_name)))
WHERE business_name IS NOT NULL AND TRIM(business_name) != '';

-- Add comment
COMMENT ON COLUMN public.profiles.business_name IS 'Unique business name associated with the user profile';

