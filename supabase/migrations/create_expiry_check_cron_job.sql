-- Create cron job to run check-expiring-items Edge Function every minute
-- The function itself checks time windows and duplicate guards, so running every minute is safe

-- First, ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing job if it exists (to allow re-running this migration)
SELECT cron.unschedule('expiry_check_every_minute') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expiry_check_every_minute'
);

-- Create the cron job
-- Schedule: * * * * * (every minute)
-- The function will check time windows internally and only send if within the 2-hour window
SELECT cron.schedule(
  'expiry_check_every_minute',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-expiring-items',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
  $$
);

-- Note: Replace YOUR_PROJECT_REF with your actual Supabase project reference ID
-- You can find it in: Supabase Dashboard → Settings → General → Reference ID
-- Or in your project URL: https://YOUR_PROJECT_REF.supabase.co

