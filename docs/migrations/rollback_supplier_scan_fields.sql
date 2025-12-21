-- Rollback Migration: Remove Supplier Scan AI fields
-- Date: 2025-01-XX
-- Description: Reverts the "Scan Supplier Document (AI)" feature database changes

-- ============================================
-- PART 1: Drop Shelf Life Tables
-- ============================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_shelf_life_defaults_category;
DROP INDEX IF EXISTS idx_shelf_life_defaults_brand;
DROP INDEX IF EXISTS idx_shelf_life_ai_product_name;
DROP INDEX IF EXISTS idx_shelf_life_ai_category;

-- Drop tables
DROP TABLE IF EXISTS product_shelf_life_ai_generated;
DROP TABLE IF EXISTS product_shelf_life_defaults;

-- ============================================
-- PART 2: Remove columns from items table
-- ============================================

ALTER TABLE items 
DROP COLUMN IF EXISTS expiry_is_estimated;

-- ============================================
-- PART 3: Remove columns from profiles table
-- ============================================

ALTER TABLE profiles 
DROP COLUMN IF EXISTS ai_supplier_scan_used_count;

ALTER TABLE profiles 
DROP COLUMN IF EXISTS has_accepted_supplier_scan_disclaimer;

-- ============================================
-- Done
-- ============================================
-- All supplier scan related database changes have been reverted.

