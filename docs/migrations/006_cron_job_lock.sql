-- Migration: Add locking columns to cron_job_state
-- Purpose: Prevent duplicate notifications from parallel cron runs
-- 
-- The lock mechanism works as follows:
-- 1. A run tries to acquire the lock by updating locked_at and locked_by
-- 2. The update only succeeds if locked_at is NULL or expired (> 5 minutes old)
-- 3. On completion (or crash), the lock is released
-- 4. Stale locks auto-expire after 5 minutes (fail-safe)

ALTER TABLE public.cron_job_state 
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS locked_by TEXT DEFAULT NULL;

COMMENT ON COLUMN public.cron_job_state.locked_at IS 'Timestamp when lock was acquired - auto-expires after 5 minutes';
COMMENT ON COLUMN public.cron_job_state.locked_by IS 'Unique run ID that holds the lock';

-- Create index for efficient lock queries
CREATE INDEX IF NOT EXISTS idx_cron_job_state_lock 
ON public.cron_job_state (job_name, locked_at);

