-- Migration: Cleanup products and items with empty or invalid names
-- This migration removes products and items that were created with empty names or placeholder names like "---"

-- Step 1: Find and delete items that reference products with empty/invalid names
-- (We need to do this first to avoid foreign key constraint issues)
DELETE FROM items
WHERE product_id IN (
  SELECT id FROM products 
  WHERE 
    name IS NULL 
    OR TRIM(name) = '' 
    OR TRIM(name) = '—'
    OR TRIM(name) = '--'
    OR TRIM(name) = '---'
);

-- Step 2: Delete products with empty/invalid names
DELETE FROM products
WHERE 
  name IS NULL 
  OR TRIM(name) = '' 
  OR TRIM(name) = '—'
  OR TRIM(name) = '--'
  OR TRIM(name) = '---';

-- Step 3: Add a check constraint to prevent future empty product names
-- This ensures that any product created in the future must have a valid name
ALTER TABLE products
DROP CONSTRAINT IF EXISTS products_name_not_empty;

ALTER TABLE products
ADD CONSTRAINT products_name_not_empty 
CHECK (name IS NOT NULL AND TRIM(name) != '' AND LENGTH(TRIM(name)) >= 1);

-- Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Cleanup completed: Removed products and items with empty or placeholder names';
END $$;
