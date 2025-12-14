-- Migration: Update items_with_details view to use owner_id instead of business_id
-- This view is used by the app to fetch items with related product and location data
-- Run this SQL in your Supabase SQL editor

-- Drop the old view if it exists
DROP VIEW IF EXISTS public.items_with_details;

-- Recreate the view using owner_id instead of business_id
-- This view joins items with products and locations to provide a complete item view
CREATE VIEW public.items_with_details AS
SELECT 
  i.id,
  i.owner_id,  -- Changed from business_id to owner_id
  i.product_id,
  i.expiry_date,
  i.location_id,
  i.status,
  i.resolved_reason,
  i.note,
  i.barcode_snapshot,
  i.created_at,
  i.updated_at,
  p.name AS product_name,
  p.barcode AS product_barcode,
  p.category AS product_category,
  p.image_url AS product_image_url,
  l.name AS location_name,
  l.display_order AS location_order
FROM public.items i
LEFT JOIN public.products p ON i.product_id = p.id
LEFT JOIN public.locations l ON i.location_id = l.id;

-- Grant permissions to authenticated users
GRANT SELECT ON public.items_with_details TO authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.items_with_details IS 
'View that joins items with products and locations, using owner_id instead of business_id';

