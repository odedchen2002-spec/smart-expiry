-- Enable pg_cron extension if not already enabled
-- Run this in Supabase SQL Editor

-- Create the cron job for automatic cleanup of expired items
-- Runs every day at 3:00 AM UTC (5:00 AM Israel time)
SELECT cron.schedule(
  'cleanup-expired-items-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ikuvhdwsfihhqowospii.supabase.co/functions/v1/cleanup-expired-items',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-items-daily';
