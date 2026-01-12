-- ============================================================================
-- Migration: RPC function to allow users to save names to barcode_catalog
-- 
-- The barcode_catalog table is read-only for clients (RLS prevents writes).
-- This RPC function uses SECURITY DEFINER to allow authenticated users
-- to save user-provided product names to the catalog.
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.upsert_barcode_catalog_name(TEXT, TEXT, TEXT);

-- Create RPC function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.upsert_barcode_catalog_name(
  p_barcode TEXT,
  p_name TEXT,
  p_locale TEXT DEFAULT 'he'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate inputs
  IF p_barcode IS NULL OR p_barcode = '' THEN
    RAISE EXCEPTION 'barcode is required';
  END IF;
  
  IF p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  -- Upsert into barcode_catalog
  -- Uses ON CONFLICT with the composite key (barcode, locale)
  INSERT INTO public.barcode_catalog (barcode, name, locale, source, confidence_score, updated_at)
  VALUES (p_barcode, p_name, p_locale, 'user', 1.0, now())
  ON CONFLICT (barcode, locale) 
  DO UPDATE SET 
    name = EXCLUDED.name,
    source = 'user',
    confidence_score = 1.0,
    updated_at = now();
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_barcode_catalog_name(TEXT, TEXT, TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.upsert_barcode_catalog_name IS 
  'Allows authenticated users to save user-provided product names to barcode_catalog. Uses SECURITY DEFINER to bypass RLS.';

