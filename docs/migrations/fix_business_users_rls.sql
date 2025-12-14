-- Migration: Fix business_users RLS policies to prevent infinite recursion
-- This migration removes all recursive RLS policies and creates a simple, non-recursive policy
-- Run this SQL in your Supabase SQL editor

-- Drop all existing policies on business_users to start fresh
-- This ensures we remove any recursive policies that might exist
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'business_users'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.business_users', r.policyname);
    END LOOP;
END $$;

-- Create a single, simple, non-recursive policy
-- This policy only checks user_id = auth.uid() without any subqueries or joins
DROP POLICY IF EXISTS "business_users_by_user" ON public.business_users;

CREATE POLICY "business_users_by_user"
ON public.business_users
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add comment for documentation
COMMENT ON POLICY "business_users_by_user" ON public.business_users IS 
'Simple, non-recursive RLS policy: users can only access their own business_users rows';

