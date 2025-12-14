-- Migration: Add subscription fields to profiles table
-- Run this SQL in your Supabase SQL editor

-- First, create the profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_terms_at TIMESTAMPTZ,
  terms_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add subscription columns to profiles table (one at a time to ensure they're created)
DO $$ 
BEGIN
  -- Add subscription_tier column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN subscription_tier TEXT DEFAULT 'free';
  END IF;

  -- Add subscription_valid_until column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'subscription_valid_until'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN subscription_valid_until TIMESTAMPTZ;
  END IF;

  -- Add subscription_created_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'subscription_created_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN subscription_created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Add auto_renew column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'auto_renew'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN auto_renew BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add constraint to ensure subscription_tier is one of the valid values
-- Only add constraint if subscription_tier column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'subscription_tier'
  ) THEN
    -- Drop constraint if it exists
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_subscription_tier;
    
    -- Add constraint
    ALTER TABLE public.profiles
    ADD CONSTRAINT check_subscription_tier 
    CHECK (subscription_tier IS NULL OR subscription_tier IN ('free', 'basic', 'pro'));
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_valid_until ON public.profiles(subscription_valid_until);

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.subscription_tier IS 'Subscription tier: free, basic, or pro';
COMMENT ON COLUMN public.profiles.subscription_valid_until IS 'Date when the subscription expires (null for free tier)';
COMMENT ON COLUMN public.profiles.subscription_created_at IS 'Date when the subscription was created';
COMMENT ON COLUMN public.profiles.auto_renew IS 'Whether the subscription auto-renews';

-- Enable Row Level Security (RLS) on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Users can only read/update their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

