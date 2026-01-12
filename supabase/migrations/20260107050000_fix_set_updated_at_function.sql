-- Replace set_updated_at function to ensure it doesn't override is_plan_locked
-- This trigger runs BEFORE UPDATE on items table

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update the updated_at timestamp
  -- Preserve all other fields from NEW (including is_plan_locked)
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comment for clarity
COMMENT ON FUNCTION set_updated_at() IS 'Automatically sets updated_at timestamp on UPDATE. Preserves all other fields including is_plan_locked.';
