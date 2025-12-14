-- Migration: Add profile_name column to terms_acceptance table
-- This migration adds a single profile_name field to replace username and business_name
-- Run this SQL in your Supabase SQL editor

-- Add profile_name column to terms_acceptance table if it doesn't exist
alter table public.terms_acceptance
add column if not exists profile_name text;

-- Make old columns nullable (so we can stop using them)
alter table public.terms_acceptance
alter column username drop not null;

alter table public.terms_acceptance
alter column business_name drop not null;

-- Migrate existing data: use business_name if available, otherwise username
update public.terms_acceptance
set profile_name = coalesce(business_name, username)
where profile_name is null;

-- Add comment
comment on column public.terms_acceptance.profile_name is 'Profile name (replaces username and business_name)';

