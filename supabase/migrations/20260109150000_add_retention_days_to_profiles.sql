-- Add retention_days column to profiles table
-- This allows each user to configure how long expired items are kept before auto-deletion

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS retention_days INTEGER DEFAULT 7;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.retention_days IS 'Number of days to retain expired items before auto-deletion (0 = disabled, 7 = default)';

-- Create index for efficient queries by cleanup job
CREATE INDEX IF NOT EXISTS idx_profiles_retention_days 
ON public.profiles (retention_days)
WHERE retention_days > 0;
