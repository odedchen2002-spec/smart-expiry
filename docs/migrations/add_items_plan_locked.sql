-- Migration: Add is_plan_locked flag to items for free plan limits
-- Run this SQL in the Supabase SQL editor or include it in your migration pipeline

-- 1. Add column to items table (if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'items'
      AND column_name = 'is_plan_locked'
  ) THEN
    ALTER TABLE public.items
      ADD COLUMN is_plan_locked boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Optionally, expose is_plan_locked via items_with_details view
--    (update view only if you want the app to read the flag from the view)

DROP VIEW IF EXISTS public.items_with_details;

CREATE VIEW public.items_with_details AS
SELECT 
  i.id,
  i.owner_id,
  i.product_id,
  i.expiry_date,
  i.location_id,
  i.status,
  i.resolved_reason,
  i.note,
  i.barcode_snapshot,
  i.created_at,
  i.updated_at,
  i.is_plan_locked,
  p.name AS product_name,
  p.barcode AS product_barcode,
  p.category AS product_category,
  p.image_url AS product_image_url,
  l.name AS location_name,
  l.display_order AS location_order
FROM public.items i
LEFT JOIN public.products p ON i.product_id = p.id
LEFT JOIN public.locations l ON i.location_id = l.id;

GRANT SELECT ON public.items_with_details TO authenticated;

COMMENT ON VIEW public.items_with_details IS
'View that joins items with products and locations, including is_plan_locked flag.';


