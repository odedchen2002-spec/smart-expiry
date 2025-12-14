-- Migration: Add profile completion fields to profiles table
-- Run this SQL in your Supabase SQL editor

-- Add full_name column (nullable text)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
  END IF;
END $$;

-- Add contact_email column (nullable text)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'contact_email'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN contact_email TEXT;
  END IF;
END $$;

-- Add is_profile_complete column (boolean, NOT NULL, default false)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'is_profile_complete'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_profile_complete BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.full_name IS 'User full name (required for profile completion)';
COMMENT ON COLUMN public.profiles.contact_email IS 'User contact email (required for profile completion, especially for Apple private relay users)';
COMMENT ON COLUMN public.profiles.is_profile_complete IS 'Whether the user has completed their profile (full_name and contact_email are set)';

