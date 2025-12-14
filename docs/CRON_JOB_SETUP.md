# Cron Job Setup for check-expiring-items

This guide explains how to set up the cron job that runs the `check-expiring-items` Edge Function.

## Option 1: Via Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Open Database → Cron Jobs**
   - Click on "Database" in the left sidebar
   - Click on "Cron Jobs" (or go directly to: Database → Cron Jobs)

3. **Create New Cron Job**
   - Click "Create a new cron job" or "New Cron Job"
   - Fill in the details:

   **Job Name**: `expiry_check_every_minute`

   **Schedule**: `* * * * *` (every minute)

   **Command**:
   ```sql
   SELECT net.http_post(
     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-expiring-items',
     headers := jsonb_build_object(
       'Content-Type', 'application/json'
     ),
     body := '{}'
   );
   ```

   **Important**: Replace `YOUR_PROJECT_REF` with your actual project reference ID.
   - Find it in: Settings → General → Reference ID
   - Or in your project URL: `https://YOUR_PROJECT_REF.supabase.co`

   **Enabled**: ✅ Check this box

4. **Save the Cron Job**
   - Click "Save" or "Create"

## Option 2: Via SQL Editor

1. **Open SQL Editor**
   - Go to Supabase Dashboard → SQL Editor

2. **Run the Migration**
   - Open the file: `supabase/migrations/create_expiry_check_cron_job.sql`
   - **IMPORTANT**: Replace `YOUR_PROJECT_REF` with your actual project reference ID
   - Copy and paste into SQL Editor
   - Click "Run"

## Verification

### Check Cron Job Status

**Via Dashboard:**
- Go to Database → Cron Jobs
- You should see `expiry_check_every_minute` in the list
- Status should be "Active" or show last run time

**Via SQL:**
```sql
SELECT * FROM cron.job WHERE jobname = 'expiry_check_every_minute';
```

### Check Cron Job Runs

**Via Dashboard:**
- Go to Database → Cron Jobs → `expiry_check_every_minute`
- View "Job Runs" or "History" tab
- You should see entries every minute

**Via SQL:**
```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'expiry_check_every_minute')
ORDER BY start_time DESC 
LIMIT 10;
```

### Check Edge Function Logs

- Go to Edge Functions → `check-expiring-items` → Logs
- You should see invocations every minute
- The function will log "Skipping owner..." if outside time window or already sent

## Why Every Minute?

The cron job runs every minute, but the Edge Function has built-in guards:

1. **Time Window Check**: Only sends if current time is within 2-hour window around configured hour:minute
2. **Duplicate Guard**: Only sends once per day per owner + target_expiry_date + days_before

So even though it runs every minute, it will only actually send notifications:
- When the time window matches (e.g., user configured 10:00, function runs between 10:00-12:00)
- And only once per day per unique combination

This approach is more reliable than trying to schedule exactly at each user's configured time.

## Troubleshooting

### Cron Job Not Running

1. **Check pg_cron extension**:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```
   If empty, enable it:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   ```

2. **Check job exists**:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'expiry_check_every_minute';
   ```

3. **Check job is active**:
   - In Dashboard, verify "Enabled" checkbox is checked
   - Or in SQL: `SELECT active FROM cron.job WHERE jobname = 'expiry_check_every_minute';`

### Function Not Being Called

1. **Check URL is correct**: Verify the URL in the cron job command matches your project
2. **Check Edge Function is deployed**: Go to Edge Functions → verify `check-expiring-items` exists
3. **Check function logs**: Look for errors in Edge Function logs

### Function Runs But No Notifications Sent

1. **Check notification_settings**: Verify users have `enabled = true`
2. **Check time window**: Function only sends within 2-hour window
3. **Check duplicate guard**: Function skips if already sent today
4. **Check items exist**: Function skips if no active items expiring
5. **Check push tokens**: Function skips if no valid push tokens

## Updating the Cron Job

If you need to update the cron job (e.g., change URL):

1. **Via Dashboard**:
   - Go to Database → Cron Jobs → `expiry_check_every_minute`
   - Click "Edit"
   - Update the command
   - Save

2. **Via SQL**:
   ```sql
   -- Unschedule old job
   SELECT cron.unschedule('expiry_check_every_minute');
   
   -- Create new job with updated command
   SELECT cron.schedule(
     'expiry_check_every_minute',
     '* * * * *',
     $$
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-expiring-items',
       headers := jsonb_build_object('Content-Type', 'application/json'),
       body := '{}'
     );
     $$
   );
   ```

## Security Notes

- The cron job does NOT send an Authorization header
- The Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` from environment variables (auto-provided by Supabase)
- The function URL is public, but the function itself requires service role key to access database
- This is secure because:
  - The function validates all inputs
  - It only reads from `notification_settings` and `items` tables
  - It only writes to `notification_sent_log` table
  - All operations respect RLS policies (service role can bypass, but function logic is safe)

