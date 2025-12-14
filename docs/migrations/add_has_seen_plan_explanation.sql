-- Migration: Add has_seen_plan_explanation column to user_preferences table
-- Run this SQL in your Supabase SQL editor

-- Create user_preferences table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_token TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add has_seen_plan_explanation column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'has_seen_plan_explanation'
  ) THEN
    ALTER TABLE public.user_preferences 
    ADD COLUMN has_seen_plan_explanation BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.user_preferences.has_seen_plan_explanation IS 'Whether the user has seen the welcome explanation dialog about free plan behavior';

