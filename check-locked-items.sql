-- Check how many items are locked for Pro user
-- Replace 'YOUR_USER_ID' with the actual user ID

-- Count total non-resolved items
SELECT 
  COUNT(*) as total_items
FROM items
WHERE owner_id = 'YOUR_USER_ID'
  AND status != 'resolved';

-- Count locked items
SELECT 
  COUNT(*) as locked_items
FROM items
WHERE owner_id = 'YOUR_USER_ID'
  AND status != 'resolved'
  AND is_plan_locked = true;

-- Count unlocked items
SELECT 
  COUNT(*) as unlocked_items
FROM items
WHERE owner_id = 'YOUR_USER_ID'
  AND status != 'resolved'
  AND is_plan_locked = false;

-- Show newest items (should be locked if over 2000)
SELECT 
  id,
  created_at,
  is_plan_locked,
  status
FROM items
WHERE owner_id = 'YOUR_USER_ID'
  AND status != 'resolved'
ORDER BY created_at DESC
LIMIT 50;
