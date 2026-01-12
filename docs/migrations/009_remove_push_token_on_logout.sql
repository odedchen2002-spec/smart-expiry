-- Migration: Add RPC function to securely remove push tokens on logout
-- This ensures push tokens are always removed, bypassing any RLS issues
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. Ensure RLS policies exist for user_preferences
-- ============================================

-- First, ensure RLS is enabled on user_preferences
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.user_preferences;

-- Create comprehensive RLS policies for user_preferences
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own preferences"
ON public.user_preferences
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own preferences"
ON public.user_preferences
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own preferences"
ON public.user_preferences
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- 2. Ensure RLS policies exist for user_devices
-- ============================================

-- Ensure RLS is enabled on user_devices
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can insert their own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can update their own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can delete their own devices" ON public.user_devices;

-- Create comprehensive RLS policies for user_devices
CREATE POLICY "Users can view their own devices"
ON public.user_devices
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own devices"
ON public.user_devices
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own devices"
ON public.user_devices
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own devices"
ON public.user_devices
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- 3. Create RPC function to remove push tokens
-- ============================================
-- This function uses SECURITY DEFINER to bypass RLS
-- ensuring tokens are always removed even if there are RLS issues

CREATE OR REPLACE FUNCTION public.remove_user_push_tokens(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is the user themselves (security check)
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only remove your own push tokens';
  END IF;

  -- Remove from user_devices table
  DELETE FROM public.user_devices
  WHERE user_id = p_user_id;

  -- Clear push_token from user_preferences
  UPDATE public.user_preferences
  SET push_token = NULL
  WHERE user_id = p_user_id;

  -- Log the removal for debugging
  RAISE NOTICE 'Push tokens removed for user %', p_user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.remove_user_push_tokens(uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.remove_user_push_tokens(uuid) IS 
'Securely removes all push tokens for a user when logging out. 
Uses SECURITY DEFINER to ensure tokens are always removed regardless of RLS policies.';

-- ============================================
-- 4. Verification query
-- ============================================
-- Run this after migration to verify the function exists:
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'remove_user_push_tokens';

