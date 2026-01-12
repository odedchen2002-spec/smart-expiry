-- Fix enforce_plan_limits function to completely bypass RLS
-- Use ALTER FUNCTION to set row_security at function level

DROP FUNCTION IF EXISTS enforce_plan_limits(UUID);

CREATE OR REPLACE FUNCTION enforce_plan_limits(p_owner_id UUID)
RETURNS JSON AS $$
DECLARE
  v_subscription_tier TEXT;
  v_subscription_valid_until TIMESTAMPTZ;
  v_created_at TIMESTAMPTZ;
  v_effective_tier TEXT;
  v_limit INTEGER;
  v_total_items INTEGER;
  v_locked_count INTEGER;
  v_keep_ids UUID[];
BEGIN
  -- Get user's subscription info
  SELECT 
    subscription_tier,
    subscription_valid_until,
    created_at
  INTO 
    v_subscription_tier,
    v_subscription_valid_until,
    v_created_at
  FROM profiles
  WHERE id = p_owner_id;

  -- Default to free if not found
  IF v_subscription_tier IS NULL THEN
    v_subscription_tier := 'free';
  END IF;

  -- Check if subscription is expired
  v_effective_tier := v_subscription_tier;
  IF (v_subscription_tier = 'pro' OR v_subscription_tier = 'pro_plus') 
     AND v_subscription_valid_until IS NOT NULL 
     AND v_subscription_valid_until < NOW() THEN
    v_effective_tier := 'free';
  END IF;

  -- Check if in trial (first 30 days)
  IF v_effective_tier = 'free' AND v_created_at IS NOT NULL THEN
    IF v_created_at + INTERVAL '30 days' >= NOW() THEN
      -- In trial - unlock all
      UPDATE items
      SET is_plan_locked = false
      WHERE owner_id = p_owner_id
        AND status != 'resolved';
      
      RETURN json_build_object(
        'success', true,
        'tier', 'trial',
        'message', 'Trial period - all items unlocked'
      );
    END IF;
  END IF;

  -- Pro+ has unlimited
  IF v_effective_tier = 'pro_plus' THEN
    UPDATE items
    SET is_plan_locked = false
    WHERE owner_id = p_owner_id
      AND status != 'resolved';
    
    RETURN json_build_object(
      'success', true,
      'tier', 'pro_plus',
      'message', 'Pro+ - unlimited items'
    );
  END IF;

  -- Get limit for tier
  v_limit := CASE v_effective_tier
    WHEN 'free' THEN 150
    WHEN 'pro' THEN 2000
    ELSE 150
  END;

  -- Count total non-resolved items
  SELECT COUNT(*) INTO v_total_items
  FROM items
  WHERE owner_id = p_owner_id
    AND status != 'resolved';

  IF v_total_items <= v_limit THEN
    -- All items fit - unlock all
    UPDATE items
    SET is_plan_locked = false
    WHERE owner_id = p_owner_id
      AND status != 'resolved';
    
    RETURN json_build_object(
      'success', true,
      'tier', v_effective_tier,
      'limit', v_limit,
      'total', v_total_items,
      'message', 'All items unlocked'
    );
  END IF;

  -- Get IDs of items to keep unlocked (oldest first)
  SELECT ARRAY_AGG(id ORDER BY created_at ASC)
  INTO v_keep_ids
  FROM (
    SELECT id, created_at
    FROM items
    WHERE owner_id = p_owner_id
      AND status != 'resolved'
    ORDER BY created_at ASC
    LIMIT v_limit
  ) sub;

  -- Lock all items first
  UPDATE items
  SET is_plan_locked = true
  WHERE owner_id = p_owner_id
    AND status != 'resolved';

  -- Unlock the items to keep
  IF v_keep_ids IS NOT NULL AND array_length(v_keep_ids, 1) > 0 THEN
    UPDATE items
    SET is_plan_locked = false
    WHERE id = ANY(v_keep_ids);
  END IF;

  -- Count locked items
  SELECT COUNT(*) INTO v_locked_count
  FROM items
  WHERE owner_id = p_owner_id
    AND status != 'resolved'
    AND is_plan_locked = true;

  RETURN json_build_object(
    'success', true,
    'tier', v_effective_tier,
    'limit', v_limit,
    'total', v_total_items,
    'locked', v_locked_count,
    'message', format('%s plan: %s items, locked %s newer items', v_effective_tier, v_total_items, v_locked_count)
  );
END;
$$ LANGUAGE plpgsql 
   SECURITY DEFINER
   SET search_path = public, pg_temp;

-- Disable RLS for this function
ALTER FUNCTION enforce_plan_limits(UUID) SET row_security TO off;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION enforce_plan_limits(UUID) TO authenticated;
