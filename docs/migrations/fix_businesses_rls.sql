-- Migration: Fix RLS policies on public.businesses table
-- This allows authenticated users to read businesses they are linked to via business_users
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. DROP EXISTING POLICIES (if any)
-- ============================================

-- Drop any existing policies that might conflict
DROP POLICY IF EXISTS "read user's businesses" ON public.businesses;
DROP POLICY IF EXISTS "read_own_business" ON public.businesses;
DROP POLICY IF EXISTS "users can read their business" ON public.businesses;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.businesses;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.businesses;
DROP POLICY IF EXISTS "insert business" ON public.businesses;
DROP POLICY IF EXISTS "Allow authenticated users to read their own businesses" ON public.businesses;
DROP POLICY IF EXISTS "Allow authenticated users to insert businesses" ON public.businesses;

-- ============================================
-- 2. ENABLE RLS (if not already enabled)
-- ============================================

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. CREATE SELECT POLICY
-- ============================================

-- Allow authenticated users to read businesses they are linked to via business_users
CREATE POLICY "read user's businesses"
ON public.businesses
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT business_id
    FROM public.business_users
    WHERE user_id = auth.uid()
  )
);

-- ============================================
-- 4. CREATE INSERT POLICY
-- ============================================

-- Allow authenticated users to insert businesses
-- Note: The RPC function create_business_with_owner uses SECURITY DEFINER,
-- but having this policy allows direct inserts if needed
CREATE POLICY "insert business"
ON public.businesses
FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================
-- 5. CREATE UPDATE POLICY (optional, for business settings)
-- ============================================

-- Allow authenticated users to update businesses they are linked to
-- Only if they are owner or admin (check via business_users.role)
DROP POLICY IF EXISTS "update user's businesses" ON public.businesses;

CREATE POLICY "update user's businesses"
ON public.businesses
FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT business_id
    FROM public.business_users
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  id IN (
    SELECT business_id
    FROM public.business_users
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

-- ============================================
-- 6. VERIFY POLICIES
-- ============================================

-- Check that policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'businesses'
ORDER BY policyname;

-- Expected output should show:
-- 1. "read user's businesses" (SELECT)
-- 2. "insert business" (INSERT)
-- 3. "update user's businesses" (UPDATE)

