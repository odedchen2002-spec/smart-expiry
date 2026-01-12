-- ============================================================================
-- Migration: Fix promotion to pick only the largest group per barcode+locale
-- 
-- PROBLEM: When multiple normalized names for the same barcode+locale pass
-- the threshold (e.g., "חלב" with 20 stores and "חלב תנובה" with 40 stores),
-- both were returned as candidates, and the last one to be processed would
-- win (non-deterministic).
--
-- FIX: Use ROW_NUMBER() window function to select only the group with the
-- highest distinct_stores count for each (barcode, locale) combination.
-- Ties are broken by suggestion_count.
-- ============================================================================

-- Drop and recreate the function with the fix
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
    ),
    -- NEW: Rank groups within each barcode+locale, pick only the largest
    ranked_suggestions AS (
        SELECT 
            gs.*,
            ROW_NUMBER() OVER (
                PARTITION BY gs.barcode, gs.locale 
                ORDER BY gs.distinct_stores DESC, gs.suggestion_count DESC
            ) AS rank
        FROM grouped_suggestions gs
    )
    SELECT 
        rs.barcode,
        rs.locale,
        rs.normalized_name,
        rs.distinct_stores,
        rs.display_name,
        rs.suggestion_count
    FROM ranked_suggestions rs
    WHERE rs.rank = 1  -- Only the largest group per barcode+locale
    -- Only include if not already in catalog with same normalized name
    AND NOT EXISTS (
        SELECT 1 FROM public.barcode_catalog bc
        WHERE bc.barcode = rs.barcode
          AND bc.locale = rs.locale
          AND public.normalize_product_name(bc.name) = rs.normalized_name
    )
    ORDER BY rs.distinct_stores DESC, rs.suggestion_count DESC
    LIMIT p_max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_barcode_promotion_candidates IS 
'Returns barcode name suggestions that qualify for promotion to global catalog.
For each barcode+locale, returns only the group with the most distinct stores (≥10 required).
Ties are broken by suggestion_count.';

-- Ensure permissions are correct
REVOKE ALL ON FUNCTION public.get_barcode_promotion_candidates FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barcode_promotion_candidates TO service_role;

