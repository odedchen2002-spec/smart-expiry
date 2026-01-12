# Setup Instructions for Automatic Expired Items Cleanup

## Problem
Expired items (older than the configured retention period, e.g., 10 days) are not being deleted automatically. They only get deleted when you manually save settings in the "Manage Products" screen.

## Solution
Set up a daily cron job to automatically run the `cleanup-expired-items` Edge Function.

---

## Setup Steps

### Option 1: Using Supabase Dashboard (Recommended, Easiest)

1. **Go to Supabase Dashboard:**
   https://supabase.com/dashboard/project/ikuvhdwsfihhqowospii

2. **Navigate to Database → Cron Jobs:**
   - Click "Database" in left sidebar
   - Click "Cron Jobs"

3. **Create New Cron Job:**
   - Click "Create a new cron job" or "+ New Cron Job"
   
4. **Configure the job:**
   - **Name**: `cleanup-expired-items-daily`
   - **Schedule**: `0 3 * * *` (Every day at 3:00 AM UTC / 5:00 AM Israel time)
   - **Command**:
     ```sql
     SELECT net.http_post(
       url := 'https://ikuvhdwsfihhqowospii.supabase.co/functions/v1/cleanup-expired-items',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
       ),
       body := '{}'::jsonb
     );
     ```
   - **Enabled**: ✅ Check this box

5. **Click "Save" or "Create"**

---

### Option 2: Using SQL Editor

1. **Go to Supabase Dashboard → SQL Editor:**
   https://supabase.com/dashboard/project/ikuvhdwsfihhqowospii/sql

2. **Copy and paste this SQL:**
   ```sql
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
   ```

3. **Click "Run"**

---

## Verification

### Check if the Cron Job was created:

Run this in SQL Editor:
```sql
SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-items-daily';
```

You should see one row with the job details.

### Check Cron Job runs (after it runs once):

```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-expired-items-daily')
ORDER BY start_time DESC
LIMIT 5;
```

---

## What This Does

- **Runs daily at 3:00 AM UTC** (5:00 AM Israel time)
- **Calls the `cleanup-expired-items` Edge Function**
- **For each user:**
  - Gets their `retention_days` setting (default: 7 days, yours: 10 days)
  - Deletes items that expired more than `retention_days` ago
  - Logs deletion events to `expiry_events` for statistics

---

## Testing

To test immediately without waiting for 3:00 AM:

### Option A: Manual Edge Function Call

Run this in your terminal:
```bash
curl -X POST "https://ikuvhdwsfihhqowospii.supabase.co/functions/v1/cleanup-expired-items" \
  -H "Content-Type: application/json"
```

### Option B: Temporary Test Cron (runs every minute for 5 minutes)

```sql
-- Create temporary cron (delete after testing!)
SELECT cron.schedule(
  'cleanup-expired-items-test',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ikuvhdwsfihhqowospii.supabase.co/functions/v1/cleanup-expired-items',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Wait 1-2 minutes, then check if it worked

-- Delete the test cron:
SELECT cron.unschedule('cleanup-expired-items-test');
```

---

## Done! ✅

After setup, expired items will be automatically deleted every day at 3:00 AM UTC.
