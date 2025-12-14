-- Migration: Add profile_name column to profiles table
-- This migration adds a profile_name field to replace business_name
-- Run this SQL in your Supabase SQL editor

-- Add profile_name column to profiles table if it doesn't exist
alter table public.profiles
add column if not exists profile_name text;

-- Migrate existing data from business_name
update public.profiles
set profile_name = business_name
where profile_name is null and business_name is not null;

-- Create unique index (case-insensitive) for profile_name
-- This ensures no two profiles can have the same profile name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_profile_name_unique 
ON public.profiles(LOWER(TRIM(profile_name)))
WHERE profile_name IS NOT NULL AND TRIM(profile_name) != '';

-- Add comment
COMMENT ON COLUMN public.profiles.profile_name IS 'Unique profile name (replaces business_name)';

