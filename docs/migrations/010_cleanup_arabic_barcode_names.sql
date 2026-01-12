-- Migration: Clean up Arabic barcode names that were incorrectly cached
-- This fixes a bug where OpenFoodFacts returned Arabic names and they were cached
-- Run this SQL in your Supabase SQL editor

-- ============================================
-- 1. Clean up barcode_catalog (Hebrew locale with Arabic names)
-- ============================================
DELETE FROM public.barcode_catalog
WHERE (locale ILIKE 'he%')
  AND name ~ '[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]';

-- ============================================
-- 2. Clean up store_barcode_overrides (Arabic names)
-- ============================================
-- store_barcode_overrides doesn't have locale, so we delete all Arabic names
-- Users can re-enter the name in their preferred language
DELETE FROM public.store_barcode_overrides
WHERE custom_name ~ '[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]';

-- ============================================
-- Verification queries (run separately if needed)
-- ============================================
-- SELECT COUNT(*) AS arabic_in_catalog FROM public.barcode_catalog 
-- WHERE (locale ILIKE 'he%') 
--   AND name ~ '[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]';

-- SELECT COUNT(*) AS arabic_in_overrides FROM public.store_barcode_overrides 
-- WHERE custom_name ~ '[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]';

