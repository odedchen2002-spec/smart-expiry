-- Fix is_plan_locked column default
-- Current default is 'false' which resets locks on any UPDATE
-- Change default to not auto-reset

-- Remove the problematic default
ALTER TABLE items 
  ALTER COLUMN is_plan_locked DROP DEFAULT;

-- Set all items that currently have NULL to false (data cleanup)
UPDATE items 
SET is_plan_locked = false 
WHERE is_plan_locked IS NULL;

-- Now make the column NOT NULL with no default
-- This ensures is_plan_locked only changes when explicitly set
ALTER TABLE items 
  ALTER COLUMN is_plan_locked SET NOT NULL;

