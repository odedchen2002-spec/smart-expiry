-- Migration: Supplier Intake Pages Tracking
-- Replaces supplier_intake_count with a pages-based system with monthly reset

-- 1. Add new columns for pages tracking
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS supplier_intake_pages_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS supplier_intake_pages_reset_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Ensure subscription_created_at exists
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_created_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Migrate existing data: copy supplier_intake_count to supplier_intake_pages_used
UPDATE public.profiles
SET supplier_intake_pages_used = COALESCE(supplier_intake_count, 0)
WHERE supplier_intake_pages_used = 0 OR supplier_intake_pages_used IS NULL;

-- 4. For users with subscription_created_at, set initial reset date
-- Calculate the next reset date based on subscription start day
UPDATE public.profiles
SET supplier_intake_pages_reset_at = (
  CASE 
    -- If subscription_created_at exists, calculate next reset
    WHEN subscription_created_at IS NOT NULL THEN
      -- Get the day of month from subscription start
      -- Find the next occurrence of that day
      CASE 
        WHEN EXTRACT(DAY FROM subscription_created_at) <= EXTRACT(DAY FROM CURRENT_DATE) THEN
          -- Next month
          (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + 
           (LEAST(EXTRACT(DAY FROM subscription_created_at)::int, 
                  EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '2 months' - INTERVAL '1 day'))::int) - 1) * INTERVAL '1 day')::timestamptz
        ELSE
          -- This month
          (DATE_TRUNC('month', CURRENT_DATE) + 
           (LEAST(EXTRACT(DAY FROM subscription_created_at)::int,
                  EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1) * INTERVAL '1 day')::timestamptz
      END
    -- Fallback: use created_at if subscription_created_at is null
    WHEN created_at IS NOT NULL THEN
      CASE 
        WHEN EXTRACT(DAY FROM created_at) <= EXTRACT(DAY FROM CURRENT_DATE) THEN
          (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + 
           (LEAST(EXTRACT(DAY FROM created_at)::int,
                  EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '2 months' - INTERVAL '1 day'))::int) - 1) * INTERVAL '1 day')::timestamptz
        ELSE
          (DATE_TRUNC('month', CURRENT_DATE) + 
           (LEAST(EXTRACT(DAY FROM created_at)::int,
                  EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1) * INTERVAL '1 day')::timestamptz
      END
    ELSE
      -- Ultimate fallback: reset on first of next month
      (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::timestamptz
  END
)
WHERE supplier_intake_pages_reset_at IS NULL
  AND subscription_tier IN ('pro', 'pro_plus');

-- 5. Add comments for documentation
COMMENT ON COLUMN public.profiles.supplier_intake_pages_used IS 'Number of AI intake pages used in current billing cycle';
COMMENT ON COLUMN public.profiles.supplier_intake_pages_reset_at IS 'Next reset date for intake pages counter (based on subscription_created_at)';

-- 6. Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_intake_reset 
ON public.profiles (supplier_intake_pages_reset_at)
WHERE subscription_tier IN ('pro', 'pro_plus');
