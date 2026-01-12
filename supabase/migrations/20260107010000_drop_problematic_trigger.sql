-- Drop the problematic trigger that overrides is_plan_locked
DROP TRIGGER IF EXISTS items_compute_status ON items;

-- Note: This trigger was attempting to call a non-existent function
-- and was interfering with the plan limit enforcement
