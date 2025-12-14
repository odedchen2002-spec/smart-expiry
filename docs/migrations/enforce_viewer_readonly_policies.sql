-- Migration: Enforce read-only access for viewers
-- This migration updates RLS policies to ensure viewers can only SELECT, not INSERT/UPDATE/DELETE

-- Drop existing policies that allow editors to modify items
DROP POLICY IF EXISTS "Owner and editors can modify items" ON public.items;

-- Create separate policies for INSERT, UPDATE, DELETE that explicitly exclude viewers
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

-- Update products table policies (if they exist)
DROP POLICY IF EXISTS "Owner and editors can modify products" ON public.products;
DROP POLICY IF EXISTS "Owner and editors can insert products" ON public.products;
DROP POLICY IF EXISTS "Owner and editors can update products" ON public.products;
DROP POLICY IF EXISTS "Owner and editors can delete products" ON public.products;

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

-- Update locations table policies (if they exist)
DROP POLICY IF EXISTS "Owner and editors can modify locations" ON public.locations;
DROP POLICY IF EXISTS "Owner and editors can insert locations" ON public.locations;
DROP POLICY IF EXISTS "Owner and editors can update locations" ON public.locations;
DROP POLICY IF EXISTS "Owner and editors can delete locations" ON public.locations;

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

