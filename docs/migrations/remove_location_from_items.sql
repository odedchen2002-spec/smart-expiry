-- Migration: Remove location_id from items table
-- This migration removes the location_id column from the items table
-- as location tracking is no longer needed in the app

-- Drop the foreign key constraint if it exists
ALTER TABLE public.items 
DROP CONSTRAINT IF EXISTS items_location_id_fkey;

-- Drop the column
ALTER TABLE public.items 
DROP COLUMN IF EXISTS location_id;

-- Note: The locations table and related data are kept in the database
-- but are no longer used by the application. If you want to remove
-- the locations table entirely, you can do so in a separate migration
-- after ensuring no other dependencies exist.

