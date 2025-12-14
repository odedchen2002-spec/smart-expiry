-- Migration: Migrate from businesses to owner/collaborator model
-- This migration adds username to profiles, owner_id to items, and creates collaborations table
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. PROFILES TABLE - Add username column
-- ============================================

-- Add username column if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT;

-- Migrate data: use profile_name as username if username is null
UPDATE public.profiles
SET username = COALESCE(username, profile_name)
WHERE username IS NULL AND profile_name IS NOT NULL;

-- Create unique index on username (case-insensitive)
DROP INDEX IF EXISTS idx_profiles_username_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique
ON public.profiles(LOWER(TRIM(username)))
WHERE username IS NOT NULL AND TRIM(username) != '';

-- Add comment
COMMENT ON COLUMN public.profiles.username IS 'Unique username for the user (used for collaboration invitations)';

-- ============================================
-- 2. ITEMS TABLE - Add owner_id column
-- ============================================

-- Add owner_id column if it doesn't exist
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Migrate existing items: set owner_id from business_users relationship
-- This assumes each business has one owner (the user who created it)
UPDATE public.items i
SET owner_id = (
  SELECT bu.user_id
  FROM public.business_users bu
  WHERE bu.business_id = i.business_id
    AND bu.role = 'owner'
  LIMIT 1
)
WHERE i.owner_id IS NULL;

-- For items where we couldn't find an owner, use the first user of the business
UPDATE public.items i
SET owner_id = (
  SELECT bu.user_id
  FROM public.business_users bu
  WHERE bu.business_id = i.business_id
  ORDER BY bu.created_at ASC
  LIMIT 1
)
WHERE i.owner_id IS NULL;

-- Make owner_id NOT NULL after migration (but allow NULL temporarily for safety)
-- We'll make it NOT NULL in a separate step after verifying all items have owner_id

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_items_owner_id ON public.items(owner_id);

-- Add comment
COMMENT ON COLUMN public.items.owner_id IS 'The profile ID of the owner of this item';

-- ============================================
-- 3. COLLABORATIONS TABLE - Create new table
-- ============================================

CREATE TABLE IF NOT EXISTS public.collaborations (
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, member_id),
  CONSTRAINT collaborations_owner_member_different CHECK (owner_id != member_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_collaborations_owner_id ON public.collaborations(owner_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_member_id ON public.collaborations(member_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_status ON public.collaborations(status);

-- Add comments
COMMENT ON TABLE public.collaborations IS 'Collaboration relationships between users';
COMMENT ON COLUMN public.collaborations.owner_id IS 'The profile ID of the owner';
COMMENT ON COLUMN public.collaborations.member_id IS 'The profile ID of the collaborator';
COMMENT ON COLUMN public.collaborations.role IS 'Role: editor (can modify) or viewer (read-only)';
COMMENT ON COLUMN public.collaborations.status IS 'Status: active or inactive';

-- ============================================
-- 4. ENABLE RLS ON ITEMS AND COLLABORATIONS
-- ============================================

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. RLS POLICIES FOR ITEMS
-- ============================================

-- Drop existing policies on items if they exist
DROP POLICY IF EXISTS "Owner and collaborators can view items" ON public.items;
DROP POLICY IF EXISTS "Owner and editors can modify items" ON public.items;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.items;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.items;
DROP POLICY IF EXISTS "Enable update for users based on business_id" ON public.items;
DROP POLICY IF EXISTS "Enable delete for users based on business_id" ON public.items;

-- Items SELECT: Owner and collaborators can view items
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

-- Items INSERT: Owner and editors can insert items
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

-- Items UPDATE: Owner and editors can update items
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

-- Items DELETE: Owner and editors can delete items
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
-- 6. RLS POLICIES FOR COLLABORATIONS
-- ============================================

-- Collaborations SELECT: Owner and member can view their collaborations
CREATE POLICY "Owner and member can view their collaborations"
ON public.collaborations
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR member_id = auth.uid()
);

-- Collaborations INSERT: Only owner can insert collaborations
CREATE POLICY "Only owner can insert collaborations"
ON public.collaborations
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

-- Collaborations UPDATE: Only owner can update collaborations
CREATE POLICY "Only owner can update collaborations"
ON public.collaborations
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Collaborations DELETE: Only owner can delete collaborations
CREATE POLICY "Only owner can delete collaborations"
ON public.collaborations
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- ============================================
-- 7. VERIFY MIGRATION
-- ============================================

-- Check that all items have owner_id
SELECT 
  COUNT(*) as total_items,
  COUNT(owner_id) as items_with_owner,
  COUNT(*) - COUNT(owner_id) as items_without_owner
FROM public.items;

-- Check collaborations table exists
SELECT COUNT(*) as collaboration_count FROM public.collaborations;

-- Check username uniqueness
SELECT username, COUNT(*) as count
FROM public.profiles
WHERE username IS NOT NULL
GROUP BY username
HAVING COUNT(*) > 1;

