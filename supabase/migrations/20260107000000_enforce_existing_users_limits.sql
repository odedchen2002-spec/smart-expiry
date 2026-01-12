-- One-time enforcement of plan limits for existing users
-- This migration ensures all existing items are properly locked/unlocked

DO $$
DECLARE
  user_record RECORD;
BEGIN
  -- Loop through all Pro users
  FOR user_record IN 
    SELECT id, subscription_tier
    FROM profiles
    WHERE subscription_tier IN ('pro', 'pro_plus')
  LOOP
    -- Call the enforcement function for each user
    PERFORM enforce_plan_limits(user_record.id);
    RAISE NOTICE 'Enforced plan limits for user: %', user_record.id;
  END LOOP;
END $$;
