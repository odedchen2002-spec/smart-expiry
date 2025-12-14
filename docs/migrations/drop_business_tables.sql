-- Migration: Drop business-related tables
-- This migration removes the old businesses and business_users tables
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. DROP RLS POLICIES
-- ============================================

-- Drop RLS policies on business_users (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_users') THEN
    DROP POLICY IF EXISTS "Users can view business_users for their business" ON public.business_users;
    DROP POLICY IF EXISTS "Users can insert business_users for their business" ON public.business_users;
    DROP POLICY IF EXISTS "Users can update business_users for their business" ON public.business_users;
    DROP POLICY IF EXISTS "Users can delete business_users for their business" ON public.business_users;
  END IF;
END $$;

-- Drop RLS policies on businesses (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'businesses') THEN
    DROP POLICY IF EXISTS "Users can view their businesses" ON public.businesses;
    DROP POLICY IF EXISTS "Users can insert businesses" ON public.businesses;
    DROP POLICY IF EXISTS "Users can update their businesses" ON public.businesses;
    DROP POLICY IF EXISTS "Users can delete their businesses" ON public.businesses;
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.businesses;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.businesses;
    DROP POLICY IF EXISTS "Enable update for users based on business_id" ON public.businesses;
    DROP POLICY IF EXISTS "Enable delete for users based on business_id" ON public.businesses;
  END IF;
END $$;

-- ============================================
-- 2. DROP FOREIGN KEY CONSTRAINTS
-- ============================================

-- Drop foreign keys from other tables that reference businesses/business_users
-- Note: These should already be migrated to use owner_id, but we'll drop them to be safe

-- Items table - business_id should already be nullable or removed
-- Products table - business_id should already be nullable or removed
-- Locations table - business_id should already be nullable

-- ============================================
-- 3. DROP TABLES
-- ============================================

-- Drop business_users table (if it exists)
DROP TABLE IF EXISTS public.business_users CASCADE;

-- Drop businesses table (if it exists)
DROP TABLE IF EXISTS public.businesses CASCADE;

-- ============================================
-- 4. DROP FUNCTIONS AND RPCs
-- ============================================

-- Drop RPC functions related to businesses
DROP FUNCTION IF EXISTS public.get_business_notification_settings(uuid);
DROP FUNCTION IF EXISTS public.create_business_with_unique_name(text);
DROP FUNCTION IF EXISTS public.update_business_notifications(uuid, jsonb);
DROP FUNCTION IF EXISTS public.invite_employee_to_business(uuid, text, text);
DROP FUNCTION IF EXISTS public.update_employee_role(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.remove_employee_from_business(uuid, uuid);

-- ============================================
-- 5. VERIFY CLEANUP
-- ============================================

-- Check that tables are dropped
SELECT 
  table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('businesses', 'business_users');

-- Should return 0 rows

