-- RPC Function: check_and_use_intake_pages
-- Atomic function to check quota, reset if needed, and increment usage
-- Returns: { allowed: boolean, pages_used: int, pages_limit: int, remaining: int, reset_at: timestamptz, error_code: text }

DROP FUNCTION IF EXISTS public.check_and_use_intake_pages(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.check_and_use_intake_pages(
  p_user_id UUID,
  p_pages_to_use INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_subscription_created_at TIMESTAMPTZ;
  v_created_at TIMESTAMPTZ;
  v_pages_used INTEGER;
  v_reset_at TIMESTAMPTZ;
  v_next_reset TIMESTAMPTZ;
  v_limit INTEGER;
  v_anchor_date TIMESTAMPTZ;
  v_anchor_day INTEGER;
  v_now TIMESTAMPTZ := NOW();
  v_result JSONB;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT 
    subscription_tier,
    subscription_created_at,
    created_at,
    COALESCE(supplier_intake_pages_used, 0),
    supplier_intake_pages_reset_at
  INTO 
    v_tier,
    v_subscription_created_at,
    v_created_at,
    v_pages_used,
    v_reset_at
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  -- User not found
  IF v_tier IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error_code', 'USER_NOT_FOUND',
      'pages_used', 0,
      'pages_limit', 0,
      'remaining', 0,
      'reset_at', NULL
    );
  END IF;
  
  -- Determine limit based on tier
  -- Pro: 20 pages/month
  -- Pro+: 1000 pages/month (high limit, fair use - not displayed as "unlimited")
  -- Free/Trial: handled separately (5/10 lifetime, not monthly reset)
  CASE v_tier
    WHEN 'pro' THEN v_limit := 20;
    WHEN 'pro_plus' THEN v_limit := 1000; -- Fair use, high limit
    ELSE 
      -- Free/trial users don't use this monthly reset system
      RETURN jsonb_build_object(
        'allowed', true,
        'error_code', 'NOT_MONTHLY_PLAN',
        'pages_used', v_pages_used,
        'pages_limit', 0,
        'remaining', 0,
        'reset_at', NULL
      );
  END CASE;
  
  -- Determine anchor date for reset calculation
  -- Priority: subscription_created_at > created_at > now
  v_anchor_date := COALESCE(v_subscription_created_at, v_created_at, v_now);
  v_anchor_day := EXTRACT(DAY FROM v_anchor_date)::INTEGER;
  
  -- Calculate next reset date if not set or if we need to advance
  IF v_reset_at IS NULL THEN
    -- First time: calculate initial reset date
    v_next_reset := calculate_next_reset_date(v_anchor_day, v_now);
    v_reset_at := v_next_reset;
    v_pages_used := 0; -- Start fresh
  ELSIF v_now >= v_reset_at THEN
    -- Reset time has passed - need to reset and advance
    -- Calculate how many cycles have passed (in case user was away for months)
    v_next_reset := v_reset_at;
    WHILE v_next_reset <= v_now LOOP
      v_next_reset := calculate_next_reset_date(v_anchor_day, v_next_reset + INTERVAL '1 day');
    END LOOP;
    v_reset_at := v_next_reset;
    v_pages_used := 0; -- Reset counter
  ELSE
    v_next_reset := v_reset_at;
  END IF;
  
  -- Check if usage would exceed limit (Pro only, Pro+ has very high limit)
  IF v_tier = 'pro' AND (v_pages_used + p_pages_to_use) > v_limit THEN
    -- Update reset_at even if denied (in case it was just calculated)
    UPDATE profiles
    SET 
      supplier_intake_pages_reset_at = v_next_reset,
      supplier_intake_pages_used = v_pages_used
    WHERE id = p_user_id;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'error_code', 'QUOTA_EXCEEDED',
      'pages_used', v_pages_used,
      'pages_limit', v_limit,
      'remaining', GREATEST(0, v_limit - v_pages_used),
      'reset_at', v_next_reset
    );
  END IF;
  
  -- Increment usage and update reset date
  v_pages_used := v_pages_used + p_pages_to_use;
  
  UPDATE profiles
  SET 
    supplier_intake_pages_used = v_pages_used,
    supplier_intake_pages_reset_at = v_next_reset
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'error_code', NULL,
    'pages_used', v_pages_used,
    'pages_limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_pages_used),
    'reset_at', v_next_reset
  );
END;
$$;

-- Helper function to calculate next reset date
DROP FUNCTION IF EXISTS public.calculate_next_reset_date(INTEGER, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.calculate_next_reset_date(
  p_day_of_month INTEGER,
  p_from_date TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_year INTEGER;
  v_month INTEGER;
  v_target_day INTEGER;
  v_last_day_of_month INTEGER;
  v_result DATE;
BEGIN
  v_year := EXTRACT(YEAR FROM p_from_date)::INTEGER;
  v_month := EXTRACT(MONTH FROM p_from_date)::INTEGER;
  
  -- Get last day of current month
  v_last_day_of_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_from_date) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
  
  -- Target day, capped at last day of month
  v_target_day := LEAST(p_day_of_month, v_last_day_of_month);
  
  -- Try current month first
  v_result := MAKE_DATE(v_year, v_month, v_target_day);
  
  -- If that date has passed, move to next month
  IF v_result <= p_from_date::DATE THEN
    v_month := v_month + 1;
    IF v_month > 12 THEN
      v_month := 1;
      v_year := v_year + 1;
    END IF;
    
    -- Recalculate last day for next month
    v_last_day_of_month := EXTRACT(DAY FROM (MAKE_DATE(v_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    v_target_day := LEAST(p_day_of_month, v_last_day_of_month);
    v_result := MAKE_DATE(v_year, v_month, v_target_day);
  END IF;
  
  RETURN v_result::TIMESTAMPTZ;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_and_use_intake_pages(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_next_reset_date(INTEGER, TIMESTAMPTZ) TO authenticated;

-- Add RPC to get current quota status without using pages
DROP FUNCTION IF EXISTS public.get_intake_pages_quota(UUID);

CREATE OR REPLACE FUNCTION public.get_intake_pages_quota(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_subscription_created_at TIMESTAMPTZ;
  v_created_at TIMESTAMPTZ;
  v_pages_used INTEGER;
  v_reset_at TIMESTAMPTZ;
  v_next_reset TIMESTAMPTZ;
  v_limit INTEGER;
  v_anchor_date TIMESTAMPTZ;
  v_anchor_day INTEGER;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT 
    subscription_tier,
    subscription_created_at,
    created_at,
    COALESCE(supplier_intake_pages_used, 0),
    supplier_intake_pages_reset_at
  INTO 
    v_tier,
    v_subscription_created_at,
    v_created_at,
    v_pages_used,
    v_reset_at
  FROM profiles
  WHERE id = p_user_id;
  
  IF v_tier IS NULL THEN
    RETURN jsonb_build_object(
      'pages_used', 0,
      'pages_limit', 0,
      'remaining', 0,
      'reset_at', NULL,
      'tier', 'free'
    );
  END IF;
  
  -- Determine limit
  CASE v_tier
    WHEN 'pro' THEN v_limit := 20;
    WHEN 'pro_plus' THEN v_limit := 1000;
    ELSE v_limit := 0;
  END CASE;
  
  -- For non-monthly plans, return basic info
  IF v_tier NOT IN ('pro', 'pro_plus') THEN
    RETURN jsonb_build_object(
      'pages_used', v_pages_used,
      'pages_limit', v_limit,
      'remaining', 0,
      'reset_at', NULL,
      'tier', v_tier
    );
  END IF;
  
  -- Calculate reset date
  v_anchor_date := COALESCE(v_subscription_created_at, v_created_at, v_now);
  v_anchor_day := EXTRACT(DAY FROM v_anchor_date)::INTEGER;
  
  IF v_reset_at IS NULL THEN
    v_next_reset := calculate_next_reset_date(v_anchor_day, v_now);
  ELSIF v_now >= v_reset_at THEN
    -- Would reset, so pages_used is effectively 0
    v_next_reset := v_reset_at;
    WHILE v_next_reset <= v_now LOOP
      v_next_reset := calculate_next_reset_date(v_anchor_day, v_next_reset + INTERVAL '1 day');
    END LOOP;
    v_pages_used := 0;
  ELSE
    v_next_reset := v_reset_at;
  END IF;
  
  RETURN jsonb_build_object(
    'pages_used', v_pages_used,
    'pages_limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_pages_used),
    'reset_at', v_next_reset,
    'tier', v_tier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_intake_pages_quota(UUID) TO authenticated;

