-- Create notification_settings table for per-owner expiry notification preferences
-- This replaces client-side local notification scheduling

CREATE TABLE IF NOT EXISTS public.notification_settings (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  days_before INTEGER NOT NULL DEFAULT 1,
  hour INTEGER NOT NULL DEFAULT 9 CHECK (hour >= 0 AND hour <= 23),
  minute INTEGER NOT NULL DEFAULT 0 CHECK (minute >= 0 AND minute <= 59),
  timezone TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read/write their own notification settings
-- (assuming owner_id matches the authenticated user's id)
CREATE POLICY "Users can manage their own notification settings"
  ON public.notification_settings
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notification_settings_enabled 
  ON public.notification_settings(enabled) 
  WHERE enabled = true;

-- Add comment
COMMENT ON TABLE public.notification_settings IS 'Per-owner settings for expiry notifications. Used by Edge Function check-expiring-items.';

