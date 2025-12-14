-- Migration: Create user_devices table for storing Expo push tokens
-- This table stores push notification tokens for each user device
-- Run this SQL in your Supabase SQL editor

-- Drop the table if it exists with wrong schema (optional - comment out if you have data)
-- DROP TABLE IF EXISTS public.user_devices CASCADE;

-- Create the user_devices table
CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NULL, -- Explicitly allow NULL values
  expo_push_token text NOT NULL,
  platform text,
  created_at timestamptz DEFAULT now()
);

-- If table already exists, ensure business_id allows NULL
DO $$
BEGIN
  -- Check if business_id column exists and has NOT NULL constraint
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_devices' 
      AND column_name = 'business_id'
      AND is_nullable = 'NO'
  ) THEN
    -- Remove NOT NULL constraint if it exists
    ALTER TABLE public.user_devices 
    ALTER COLUMN business_id DROP NOT NULL;
  END IF;
END $$;

-- Create unique constraint on (user_id, business_id, platform)
-- This ensures one token per user per business per platform
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_unique 
ON public.user_devices(user_id, business_id, platform);

-- Create index for faster queries by user_id
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id 
ON public.user_devices(user_id);

-- Create index for faster queries by business_id
CREATE INDEX IF NOT EXISTS idx_user_devices_business_id 
ON public.user_devices(business_id) 
WHERE business_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE public.user_devices IS 'Stores Expo push notification tokens for user devices';
COMMENT ON COLUMN public.user_devices.user_id IS 'Reference to the user who owns this device';
COMMENT ON COLUMN public.user_devices.business_id IS 'Optional reference to a business/owner context';
COMMENT ON COLUMN public.user_devices.expo_push_token IS 'Expo push notification token for this device';
COMMENT ON COLUMN public.user_devices.platform IS 'Platform of the device (ios, android, web)';
COMMENT ON COLUMN public.user_devices.created_at IS 'Timestamp when the device token was first registered';

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can read their own device tokens
CREATE POLICY "Users can view their own device tokens"
  ON public.user_devices
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own device tokens
CREATE POLICY "Users can insert their own device tokens"
  ON public.user_devices
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own device tokens
CREATE POLICY "Users can update their own device tokens"
  ON public.user_devices
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own device tokens
CREATE POLICY "Users can delete their own device tokens"
  ON public.user_devices
  FOR DELETE
  USING (auth.uid() = user_id);

