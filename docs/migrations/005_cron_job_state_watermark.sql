-- Migration: Create cron_job_state table for watermark tracking
-- Purpose: Store last successful run time per cron job to prevent missed notifications

-- Create the table
CREATE TABLE IF NOT EXISTS public.cron_job_state (
  job_name TEXT PRIMARY KEY,
  last_successful_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comment
COMMENT ON TABLE public.cron_job_state IS 'Stores watermark (last successful run) for cron jobs to ensure no missed notifications';
COMMENT ON COLUMN public.cron_job_state.job_name IS 'Unique identifier for the cron job (e.g., check-expiring-items)';
COMMENT ON COLUMN public.cron_job_state.last_successful_run_at IS 'Timestamp of last successful completion - used as window_start for next run';

-- Insert initial row for check-expiring-items (start from now)
INSERT INTO public.cron_job_state (job_name, last_successful_run_at)
VALUES ('check-expiring-items', now())
ON CONFLICT (job_name) DO NOTHING;

-- Grant access to service role (Edge Functions use service role)
GRANT SELECT, UPDATE ON public.cron_job_state TO service_role;

-- RLS: Only service role can access (no user access needed)
ALTER TABLE public.cron_job_state ENABLE ROW LEVEL SECURITY;

-- No RLS policies needed - service_role bypasses RLS

