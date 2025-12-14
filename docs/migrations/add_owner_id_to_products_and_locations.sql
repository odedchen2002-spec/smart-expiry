-- Migration: Add owner_id to products and locations tables
-- This migration adds owner_id columns and RLS policies similar to items table
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. PRODUCTS TABLE - Add owner_id column
-- ============================================

-- Add owner_id column if it doesn't exist
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Migrate existing products: set owner_id from business_users relationship
-- Products belong to the owner of the business
UPDATE public.products p
SET owner_id = (
  SELECT bu.user_id
  FROM public.business_users bu
  WHERE bu.business_id = p.business_id
    AND bu.role = 'owner'
  LIMIT 1
)
WHERE p.owner_id IS NULL;

-- For products where we couldn't find an owner, use the first user of the business
UPDATE public.products p
SET owner_id = (
  SELECT bu.user_id
  FROM public.business_users bu
  WHERE bu.business_id = p.business_id
  ORDER BY bu.created_at ASC
  LIMIT 1
)
WHERE p.owner_id IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_owner_id ON public.products(owner_id);

-- Add comment
COMMENT ON COLUMN public.products.owner_id IS 'The profile ID of the owner of this product';

-- ============================================
-- 2. LOCATIONS TABLE - Add owner_id column
-- ============================================

-- Add owner_id column if it doesn't exist
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Migrate existing locations: set owner_id from business_users relationship
UPDATE public.locations l
SET owner_id = (
  SELECT bu.user_id
  FROM public.business_users bu
  WHERE bu.business_id = l.business_id
    AND bu.role = 'owner'
  LIMIT 1
)
WHERE l.owner_id IS NULL;

-- For locations where we couldn't find an owner, use the first user of the business
UPDATE public.locations l
SET owner_id = (
  SELECT bu.user_id
  FROM public.business_users bu
  WHERE bu.business_id = l.business_id
  ORDER BY bu.created_at ASC
  LIMIT 1
)
WHERE l.owner_id IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_locations_owner_id ON public.locations(owner_id);

-- Add comment
COMMENT ON COLUMN public.locations.owner_id IS 'The profile ID of the owner of this location';

-- ============================================
-- 3. ENABLE RLS ON PRODUCTS AND LOCATIONS
-- ============================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS POLICIES FOR PRODUCTS
-- ============================================

-- Drop existing policies on products if they exist
DROP POLICY IF EXISTS "Owner and collaborators can view products" ON public.products;
DROP POLICY IF EXISTS "Owner and editors can modify products" ON public.products;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.products;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.products;
DROP POLICY IF EXISTS "Enable update for users based on business_id" ON public.products;
DROP POLICY IF EXISTS "Enable delete for users based on business_id" ON public.products;

-- Products SELECT: Owner and collaborators can view products
CREATE POLICY "Owner and collaborators can view products"
ON public.products
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = products.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role IN ('editor', 'viewer')
  )
);

-- Products INSERT: Owner and editors can insert products
CREATE POLICY "Owner and editors can insert products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = products.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

-- Products UPDATE: Owner and editors can update products
CREATE POLICY "Owner and editors can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = products.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = products.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

-- Products DELETE: Owner and editors can delete products
CREATE POLICY "Owner and editors can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = products.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

-- ============================================
-- 5. RLS POLICIES FOR LOCATIONS
-- ============================================

-- Drop existing policies on locations if they exist
DROP POLICY IF EXISTS "Owner and collaborators can view locations" ON public.locations;
DROP POLICY IF EXISTS "Owner and editors can modify locations" ON public.locations;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.locations;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.locations;
DROP POLICY IF EXISTS "Enable update for users based on business_id" ON public.locations;
DROP POLICY IF EXISTS "Enable delete for users based on business_id" ON public.locations;

-- Locations SELECT: Owner and collaborators can view locations
CREATE POLICY "Owner and collaborators can view locations"
ON public.locations
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = locations.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role IN ('editor', 'viewer')
  )
);

-- Locations INSERT: Owner and editors can insert locations
CREATE POLICY "Owner and editors can insert locations"
ON public.locations
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = locations.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

-- Locations UPDATE: Owner and editors can update locations
CREATE POLICY "Owner and editors can update locations"
ON public.locations
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = locations.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = locations.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

-- Locations DELETE: Owner and editors can delete locations
CREATE POLICY "Owner and editors can delete locations"
ON public.locations
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = locations.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

-- ============================================
-- 6. VERIFY MIGRATION
-- ============================================

-- Check that all products have owner_id
SELECT 
  COUNT(*) as total_products,
  COUNT(owner_id) as products_with_owner,
  COUNT(*) - COUNT(owner_id) as products_without_owner
FROM public.products;

-- Check that all locations have owner_id
SELECT 
  COUNT(*) as total_locations,
  COUNT(owner_id) as locations_with_owner,
  COUNT(*) - COUNT(owner_id) as locations_without_owner
FROM public.locations;

