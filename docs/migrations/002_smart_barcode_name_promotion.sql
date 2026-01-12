-- ============================================================================
-- Migration: Smart Global Barcode Name Promotion with Locale Awareness
-- 
-- GOAL: Promote suggested barcode names to global catalog ONLY when
-- the same name is suggested by 10 DISTINCT stores IN THE SAME LOCALE.
--
-- Core rule: Promotion unit = (barcode, locale, normalized_name)
-- No cross-locale promotion is allowed.
--
-- AFTER RUNNING THIS MIGRATION:
-- Regenerate TypeScript types with: npx supabase gen types typescript
-- ============================================================================

-- ============================================================================
-- STEP 1: Schema updates for barcode_name_suggestions
-- ============================================================================

-- 1.1) Add normalized_name column if not exists
ALTER TABLE public.barcode_name_suggestions 
ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- 1.2) Create normalization function for consistent name matching
CREATE OR REPLACE FUNCTION public.normalize_product_name(input_name TEXT)
RETURNS TEXT AS $$
BEGIN
    IF input_name IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Normalize: trim, lowercase, collapse whitespace, remove punctuation
    RETURN LOWER(
        TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    TRIM(input_name),
                    '[-/.,;:!?()''"\[\]{}]', -- Remove common punctuation
                    ' ',
                    'g'
                ),
                '\s+', -- Collapse multiple spaces
                ' ',
                'g'
            )
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.normalize_product_name IS 
'Normalizes product name for comparison: trim, lowercase, collapse whitespace, remove punctuation.';

-- 1.3) Backfill normalized_name for existing rows
UPDATE public.barcode_name_suggestions
SET normalized_name = public.normalize_product_name(suggested_name)
WHERE normalized_name IS NULL;

-- 1.4) Backfill locale for existing rows (default to 'he' for Hebrew app)
UPDATE public.barcode_name_suggestions
SET locale = 'he'
WHERE locale IS NULL;

-- 1.5) Make locale and normalized_name NOT NULL
ALTER TABLE public.barcode_name_suggestions 
ALTER COLUMN locale SET NOT NULL,
ALTER COLUMN normalized_name SET NOT NULL;

-- 1.6) Set default for locale
ALTER TABLE public.barcode_name_suggestions 
ALTER COLUMN locale SET DEFAULT 'he';

-- 1.7) Add trigger to auto-compute normalized_name on insert/update
CREATE OR REPLACE FUNCTION public.trigger_normalize_suggestion_name()
RETURNS TRIGGER AS $$
BEGIN
    NEW.normalized_name := public.normalize_product_name(NEW.suggested_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_normalize_suggestion_name ON public.barcode_name_suggestions;
CREATE TRIGGER tr_normalize_suggestion_name
    BEFORE INSERT OR UPDATE OF suggested_name ON public.barcode_name_suggestions
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_normalize_suggestion_name();

-- 1.8) Add UNIQUE constraint to prevent duplicate suggestions from same store
-- First, clean up any duplicates that might exist
DELETE FROM public.barcode_name_suggestions a
USING public.barcode_name_suggestions b
WHERE a.id > b.id
  AND a.store_id = b.store_id
  AND a.barcode = b.barcode
  AND a.locale = b.locale
  AND a.normalized_name = b.normalized_name;

-- Now add the unique constraint
ALTER TABLE public.barcode_name_suggestions
DROP CONSTRAINT IF EXISTS barcode_suggestions_unique_per_store;

ALTER TABLE public.barcode_name_suggestions
ADD CONSTRAINT barcode_suggestions_unique_per_store 
UNIQUE (store_id, barcode, locale, normalized_name);

-- 1.9) Add index for efficient grouping queries (used by promotion function)
CREATE INDEX IF NOT EXISTS idx_barcode_suggestions_promotion 
ON public.barcode_name_suggestions(barcode, locale, normalized_name);

-- ============================================================================
-- STEP 2: Schema updates for barcode_catalog (per-locale support)
-- ============================================================================

-- 2.1) Drop old primary key (barcode only)
-- First, we need to handle the transition carefully

-- Check if we have duplicate barcodes with different locales
-- If the catalog has locale-less entries, we keep them as fallback

-- 2.2) Create new composite primary key (barcode, locale)
-- We need to handle existing data carefully

-- First, update NULL locales to empty string or a default
-- But we want to keep NULL as a "fallback" locale, so let's use a different approach

-- Instead of changing the primary key (which would break existing queries),
-- we'll add a unique index that enforces (barcode, locale) uniqueness
-- while keeping barcode as the primary key for backward compatibility

-- Drop existing unique constraint if any
ALTER TABLE public.barcode_catalog
DROP CONSTRAINT IF EXISTS barcode_catalog_barcode_locale_unique;

-- Add new unique constraint for (barcode, locale)
-- Note: NULL locale is treated as a separate value in UNIQUE constraints
ALTER TABLE public.barcode_catalog
ADD CONSTRAINT barcode_catalog_barcode_locale_unique 
UNIQUE (barcode, locale);

-- 2.3) Update the resolve_barcode_name function to prefer same-locale matches
CREATE OR REPLACE FUNCTION public.resolve_barcode_name(
    p_barcode TEXT,
    p_store_id UUID DEFAULT NULL,
    p_locale TEXT DEFAULT NULL
)
RETURNS TABLE (
    name TEXT,
    source TEXT,
    confidence_score NUMERIC
) AS $$
DECLARE
    v_override_name TEXT;
    v_catalog_name TEXT;
    v_catalog_source TEXT;
    v_catalog_confidence NUMERIC;
BEGIN
    -- Step 1: Check store_barcode_overrides if store_id provided
    IF p_store_id IS NOT NULL THEN
        SELECT custom_name INTO v_override_name
        FROM public.store_barcode_overrides
        WHERE store_id = p_store_id AND barcode = p_barcode;
        
        IF v_override_name IS NOT NULL THEN
            RETURN QUERY SELECT v_override_name, 'store_override'::TEXT, 1.0::NUMERIC;
            RETURN;
        END IF;
    END IF;
    
    -- Step 2a: Check barcode_catalog with exact locale match first
    IF p_locale IS NOT NULL THEN
        SELECT bc.name, bc.source, bc.confidence_score
        INTO v_catalog_name, v_catalog_source, v_catalog_confidence
        FROM public.barcode_catalog bc
        WHERE bc.barcode = p_barcode
          AND bc.locale = p_locale;
        
        IF v_catalog_name IS NOT NULL THEN
            RETURN QUERY SELECT v_catalog_name, ('catalog_' || v_catalog_source)::TEXT, v_catalog_confidence;
            RETURN;
        END IF;
    END IF;
    
    -- Step 2b: Check barcode_catalog with NULL locale (fallback)
    SELECT bc.name, bc.source, bc.confidence_score
    INTO v_catalog_name, v_catalog_source, v_catalog_confidence
    FROM public.barcode_catalog bc
    WHERE bc.barcode = p_barcode
      AND bc.locale IS NULL;
    
    IF v_catalog_name IS NOT NULL THEN
        RETURN QUERY SELECT v_catalog_name, ('catalog_' || v_catalog_source)::TEXT, v_catalog_confidence;
        RETURN;
    END IF;
    
    -- Step 3: STUB - Return NULL (no external API yet)
    RETURN QUERY SELECT NULL::TEXT, 'not_found'::TEXT, NULL::NUMERIC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.resolve_barcode_name IS 
'Resolves barcode to product name. Order: store override → catalog (same locale) → catalog (NULL locale) → NULL.';

-- ============================================================================
-- STEP 3: Create RPC function for promotion candidates (used by Edge Function)
-- ============================================================================

-- Function to get promotion candidates (called by Edge Function with service role)
CREATE OR REPLACE FUNCTION public.get_barcode_promotion_candidates(
    p_min_stores INTEGER DEFAULT 10,
    p_max_results INTEGER DEFAULT 500
)
RETURNS TABLE (
    barcode TEXT,
    locale TEXT,
    normalized_name TEXT,
    distinct_stores BIGINT,
    display_name TEXT,
    suggestion_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH grouped_suggestions AS (
        SELECT 
            bns.barcode,
            bns.locale,
            bns.normalized_name,
            COUNT(DISTINCT bns.store_id) AS distinct_stores,
            -- Get most frequent exact suggested_name for display
            MODE() WITHIN GROUP (ORDER BY bns.suggested_name) AS display_name,
            COUNT(*) AS suggestion_count
        FROM public.barcode_name_suggestions bns
        WHERE bns.barcode IS NOT NULL
          AND bns.locale IS NOT NULL
          AND bns.normalized_name IS NOT NULL
          AND LENGTH(bns.normalized_name) >= 3
          -- Skip names with digits only
          AND bns.normalized_name !~ '^[0-9\s]+$'
        GROUP BY bns.barcode, bns.locale, bns.normalized_name
        HAVING COUNT(DISTINCT bns.store_id) >= p_min_stores
    )
    SELECT 
        gs.barcode,
        gs.locale,
        gs.normalized_name,
        gs.distinct_stores,
        gs.display_name,
        gs.suggestion_count
    FROM grouped_suggestions gs
    -- Only include if not already in catalog with same normalized name
    WHERE NOT EXISTS (
        SELECT 1 FROM public.barcode_catalog bc
        WHERE bc.barcode = gs.barcode
          AND bc.locale = gs.locale
          AND public.normalize_product_name(bc.name) = gs.normalized_name
    )
    ORDER BY gs.distinct_stores DESC, gs.suggestion_count DESC
    LIMIT p_max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_barcode_promotion_candidates IS 
'Returns barcode name suggestions that qualify for promotion to global catalog (10+ distinct stores per locale).';

-- Grant execute to service_role only (not to authenticated users)
REVOKE ALL ON FUNCTION public.get_barcode_promotion_candidates FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barcode_promotion_candidates TO service_role;

-- ============================================================================
-- STEP 4: Grant execute permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.normalize_product_name TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_product_name TO service_role;

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON TABLE public.barcode_name_suggestions IS 
'User suggestions for barcode names. Names are promoted to global catalog after 10 distinct stores suggest the same normalized name within the same locale.';

COMMENT ON TABLE public.barcode_catalog IS 
'Global barcode-to-name mapping. Read-only for clients. Names can be per-locale (barcode + locale is unique). NULL locale serves as fallback.';

