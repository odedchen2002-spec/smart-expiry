-- Add is_plan_locked to items_with_details view
-- This ensures the view includes the plan lock status

DROP VIEW IF EXISTS items_with_details CASCADE;

CREATE OR REPLACE VIEW items_with_details AS
SELECT 
  i.id,
  i.owner_id,
  i.business_id,
  i.product_id,
  i.expiry_date,
  i.status,
  i.created_at,
  i.updated_at,
  i.is_plan_locked,  -- THIS IS THE IMPORTANT FIELD!
  
  -- Product fields
  p.name as product_name,
  p.barcode,
  p.image_url
FROM items i
LEFT JOIN products p ON i.product_id = p.id;

-- Grant SELECT permission to authenticated users
GRANT SELECT ON items_with_details TO authenticated;

-- Add comment
COMMENT ON VIEW items_with_details IS 'View that joins items with their related products. Includes is_plan_locked field for subscription limits.';
