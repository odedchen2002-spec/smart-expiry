-- Migration: Update collaborations status constraint to support pending invitations
-- This migration adds 'pending' and 'revoked' as valid status values
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. DROP OLD CHECK CONSTRAINT
-- ============================================

-- Drop the existing check constraint on status
ALTER TABLE public.collaborations
DROP CONSTRAINT IF EXISTS collaborations_status_check;

-- Also drop any constraint that might have been created with a different name
-- (PostgreSQL sometimes auto-names constraints)
DO $$
BEGIN
  -- Try to drop constraint if it exists with auto-generated name
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname LIKE '%status%' 
    AND conrelid = 'public.collaborations'::regclass
    AND contype = 'c'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.collaborations DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conname LIKE '%status%'
      AND conrelid = 'public.collaborations'::regclass
      AND contype = 'c'
      LIMIT 1
    );
  END IF;
END $$;

-- ============================================
-- 2. ADD NEW CHECK CONSTRAINT
-- ============================================

-- Add new check constraint that allows: 'pending', 'active', 'revoked', 'inactive'
ALTER TABLE public.collaborations
ADD CONSTRAINT collaborations_status_check 
CHECK (status IN ('pending', 'active', 'revoked', 'inactive'));

-- Update the comment to reflect the new status values
COMMENT ON COLUMN public.collaborations.status IS 'Status: pending (invitation sent, awaiting approval), active (accepted and active), revoked (declined or removed), inactive (deprecated, use revoked instead)';

-- ============================================
-- 3. VERIFY MIGRATION
-- ============================================

-- Check the constraint was created correctly
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.collaborations'::regclass
  AND conname = 'collaborations_status_check';

