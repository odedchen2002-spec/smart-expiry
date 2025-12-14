-- Migration: add owner_id to locations and update RLS
-- Run this SQL in the Supabase SQL editor

-- 1. Add owner_id column if missing
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Backfill owner_id from business_users (owner role)
UPDATE public.locations l
SET owner_id = (
  SELECT bu.user_id
  FROM public.business_users bu
  WHERE bu.business_id = l.business_id
    AND bu.role = 'owner'
  LIMIT 1
)
WHERE l.owner_id IS NULL;

-- Fallback: use first business user if owner not found
UPDATE public.locations l
SET owner_id = (
  SELECT bu.user_id
  FROM public.business_users bu
  WHERE bu.business_id = l.business_id
  ORDER BY bu.created_at ASC
  LIMIT 1
)
WHERE l.owner_id IS NULL;

-- 3. Make business_id nullable for legacy rows
ALTER TABLE public.locations
ALTER COLUMN business_id DROP NOT NULL;

-- 4. Add index on owner_id
CREATE INDEX IF NOT EXISTS idx_locations_owner_id
ON public.locations(owner_id);

-- 5. Enable RLS (if not already)
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- 6. Drop old policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.locations;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.locations;
DROP POLICY IF EXISTS "Enable update for users based on business_id" ON public.locations;
DROP POLICY IF EXISTS "Enable delete for users based on business_id" ON public.locations;
DROP POLICY IF EXISTS "Owner and collaborators can view locations" ON public.locations;
DROP POLICY IF EXISTS "Owner and editors can modify locations" ON public.locations;

-- 7. New SELECT policy
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

-- 8. New INSERT policy
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

-- 9. New UPDATE policy
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

-- 10. New DELETE policy
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

-- 11. Verify
SELECT COUNT(*) FILTER (WHERE owner_id IS NULL) AS locations_without_owner
FROM public.locations;

