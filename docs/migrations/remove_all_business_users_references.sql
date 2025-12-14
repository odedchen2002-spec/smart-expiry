-- Migration: Remove all remaining references to business_users
-- This migration ensures no database objects (policies, functions, triggers, views) reference business_users
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. Drop all old RLS policies that might reference business_users
-- ============================================

-- Drop all known old policies on items table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.items;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.items;
DROP POLICY IF EXISTS "Enable update for users based on business_id" ON public.items;
DROP POLICY IF EXISTS "Enable delete for users based on business_id" ON public.items;

-- Drop all known old policies on products table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.products;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.products;
DROP POLICY IF EXISTS "Enable update for users based on business_id" ON public.products;
DROP POLICY IF EXISTS "Enable delete for users based on business_id" ON public.products;

-- Drop all known old policies on locations table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.locations;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.locations;
DROP POLICY IF EXISTS "Enable update for users based on business_id" ON public.locations;
DROP POLICY IF EXISTS "Enable delete for users based on business_id" ON public.locations;

-- Also drop any policies that might have been created with business_users in the name
-- (This is safe - we'll recreate the correct ones below)
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all policies on items, products, and locations tables
    -- We'll recreate the correct ones below
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('items', 'products', 'locations')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
            r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- ============================================
-- 2. Ensure correct RLS policies exist on items
-- ============================================

-- Enable RLS on items if not already enabled
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Drop and recreate items policies to ensure they're correct
DROP POLICY IF EXISTS "Owner and collaborators can view items" ON public.items;
CREATE POLICY "Owner and collaborators can view items"
ON public.items
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = items.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role IN ('editor', 'viewer')
  )
);

DROP POLICY IF EXISTS "Owner and editors can insert items" ON public.items;
CREATE POLICY "Owner and editors can insert items"
ON public.items
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = items.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

DROP POLICY IF EXISTS "Owner and editors can update items" ON public.items;
CREATE POLICY "Owner and editors can update items"
ON public.items
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = items.owner_id
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
    WHERE c.owner_id = items.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

DROP POLICY IF EXISTS "Owner and editors can delete items" ON public.items;
CREATE POLICY "Owner and editors can delete items"
ON public.items
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.collaborations c
    WHERE c.owner_id = items.owner_id
      AND c.member_id = auth.uid()
      AND c.status = 'active'
      AND c.role = 'editor'
  )
);

-- ============================================
-- 3. Drop any functions that reference business_users
-- ============================================

-- Find and drop functions that reference business_users
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
        AND routine_definition LIKE '%business_users%'
    ) LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.%I CASCADE', r.routine_name);
    END LOOP;
END $$;

-- ============================================
-- 4. Update items_with_details view (if it exists)
-- ============================================

-- Drop the old view if it exists
DROP VIEW IF EXISTS public.items_with_details;

-- Recreate the view using owner_id
CREATE VIEW public.items_with_details AS
SELECT 
  i.id,
  i.owner_id,
  i.product_id,
  i.expiry_date,
  i.location_id,
  i.status,
  i.resolved_reason,
  i.note,
  i.barcode_snapshot,
  i.created_at,
  i.updated_at,
  p.name AS product_name,
  p.barcode AS product_barcode,
  p.category AS product_category,
  p.image_url AS product_image_url,
  l.name AS location_name,
  l.display_order AS location_order
FROM public.items i
LEFT JOIN public.products p ON i.product_id = p.id
LEFT JOIN public.locations l ON i.location_id = l.id;

-- Grant permissions
GRANT SELECT ON public.items_with_details TO authenticated;

-- ============================================
-- 5. Add RLS policies for products (if needed)
-- ============================================

-- Enable RLS on products if not already enabled
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Drop and recreate products policies
DROP POLICY IF EXISTS "Owner and collaborators can view products" ON public.products;
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

DROP POLICY IF EXISTS "Owner and editors can insert products" ON public.products;
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

DROP POLICY IF EXISTS "Owner and editors can update products" ON public.products;
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

DROP POLICY IF EXISTS "Owner and editors can delete products" ON public.products;
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
-- 6. Add RLS policies for locations (if needed)
-- ============================================

-- Enable RLS on locations if not already enabled
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Drop and recreate locations policies
DROP POLICY IF EXISTS "Owner and collaborators can view locations" ON public.locations;
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

DROP POLICY IF EXISTS "Owner and editors can insert locations" ON public.locations;
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

DROP POLICY IF EXISTS "Owner and editors can update locations" ON public.locations;
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

DROP POLICY IF EXISTS "Owner and editors can delete locations" ON public.locations;
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

