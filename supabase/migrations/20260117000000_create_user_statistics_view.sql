-- Migration: Create user_statistics view for real-time user metrics
-- Created: 2026-01-17
-- Description: Provides aggregated statistics about users and their subscription tiers

-- Drop existing view if it exists (to avoid column name conflicts)
DROP VIEW IF EXISTS public.user_statistics;

-- Create the view
CREATE VIEW public.user_statistics AS
SELECT
  -- Total counts by subscription tier
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE subscription_tier = 'free') AS free_users,
  COUNT(*) FILTER (WHERE subscription_tier = 'pro') AS pro_users,
  COUNT(*) FILTER (WHERE subscription_tier = 'pro_plus') AS pro_plus_users,
  COUNT(*) FILTER (WHERE subscription_tier = 'basic') AS basic_users,
  
  -- Active paid users (subscription still valid)
  COUNT(*) FILTER (
    WHERE subscription_tier IN ('pro', 'pro_plus', 'basic') 
    AND (subscription_valid_until IS NULL OR subscription_valid_until > NOW())
  ) AS active_paid_users,
  
  -- Expired paid users (had paid subscription but expired)
  COUNT(*) FILTER (
    WHERE subscription_tier IN ('pro', 'pro_plus', 'basic') 
    AND subscription_valid_until IS NOT NULL 
    AND subscription_valid_until < NOW()
  ) AS expired_paid_users,
  
  -- Users with auto-renewal enabled
  COUNT(*) FILTER (WHERE auto_renew = TRUE) AS auto_renew_users,
  
  -- New user registrations
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_users_last_7_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS new_users_last_30_days,
  
  -- Timestamp of this query (useful for caching)
  NOW() AS calculated_at
FROM public.profiles;

-- Add helpful comment
COMMENT ON VIEW public.user_statistics IS 
'Real-time aggregated user statistics including subscription tiers, active/expired users, and new registrations. 
Data is calculated dynamically on each query from the profiles table.';

-- Grant access to authenticated users (optional - remove if admin-only)
-- GRANT SELECT ON public.user_statistics TO authenticated;

-- Note: If you want to restrict this view to admins only, add RLS policies
-- or create a separate function that checks admin status before allowing access.
