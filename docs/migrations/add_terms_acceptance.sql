-- Migration: Add terms acceptance tracking to profiles table
-- Run this SQL in your Supabase SQL editor

-- Add columns to profiles table (if it doesn't exist, create it first)
-- Note: Adjust table name if your profile table has a different name

-- If profiles table doesn't exist, create it:
-- CREATE TABLE IF NOT EXISTS public.profiles (
--   id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   updated_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- Add terms acceptance columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS terms_hash TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_terms_hash ON public.profiles(terms_hash);
CREATE INDEX IF NOT EXISTS idx_profiles_accepted_terms_at ON public.profiles(accepted_terms_at);

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.accepted_terms_at IS 'Timestamp when user accepted the Terms of Use';
COMMENT ON COLUMN public.profiles.terms_hash IS 'SHA-256 hash of the Terms of Use version that was accepted';

