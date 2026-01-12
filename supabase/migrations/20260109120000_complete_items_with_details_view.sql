-- Complete items_with_details view with all required fields including is_plan_locked
-- This fixes the issue where locked items were not showing correctly

DROP VIEW IF EXISTS items_with_details CASCADE;

CREATE OR REPLACE VIEW items_with_details AS
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
  i.is_plan_locked,  -- Plan lock status for subscription limits
  
  -- Product fields
  p.name AS product_name,
  p.barcode AS product_barcode,
  p.category AS product_category,
  p.image_url AS product_image_url,
  
  -- Location fields
  l.name AS location_name,
  l.display_order AS location_order
FROM items i
LEFT JOIN products p ON i.product_id = p.id
LEFT JOIN locations l ON i.location_id = l.id;

-- Grant SELECT permission to authenticated users
GRANT SELECT ON items_with_details TO authenticated;

-- Add comment
COMMENT ON VIEW items_with_details IS 'Complete view that joins items with products and locations. Includes is_plan_locked field for subscription limits.';
