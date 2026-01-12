/**
 * Debug script to check locked items
 * Run this in Supabase SQL Editor to see if items are actually locked
 */

-- Replace YOUR_USER_ID with your actual user ID from the profiles table
-- You can find it by running: SELECT id, email FROM auth.users LIMIT 1;

DO $$
DECLARE
  v_user_id UUID := 'YOUR_USER_ID_HERE'; -- Replace with actual user ID
  v_total INTEGER;
  v_locked INTEGER;
  v_unlocked INTEGER;
BEGIN
  -- Count total non-resolved items
  SELECT COUNT(*) INTO v_total
  FROM items
  WHERE owner_id = v_user_id
    AND status != 'resolved';
  
  -- Count locked items
  SELECT COUNT(*) INTO v_locked
  FROM items
  WHERE owner_id = v_user_id
    AND status != 'resolved'
    AND is_plan_locked = true;
  
  -- Count unlocked items
  SELECT COUNT(*) INTO v_unlocked
  FROM items
  WHERE owner_id = v_user_id
    AND status != 'resolved'
    AND is_plan_locked = false;
  
  RAISE NOTICE 'Total items: %', v_total;
  RAISE NOTICE 'Locked items: %', v_locked;
  RAISE NOTICE 'Unlocked items: %', v_unlocked;
END $$;

-- Show sample of newest items (should be locked if user has >2000)
SELECT 
  id,
  created_at,
  is_plan_locked,
  status,
  product_name
FROM items
WHERE owner_id = 'YOUR_USER_ID_HERE' -- Replace with actual user ID
  AND status != 'resolved'
ORDER BY created_at DESC
LIMIT 20;
