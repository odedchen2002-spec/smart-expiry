# Cleanup Old Events - Deployment Instructions

## Overview
This document explains how to deploy and configure the `cleanup-old-events` Edge Function to automatically delete expiry_events older than 1 year.

## Purpose
- **Automatically delete** `expiry_events` records older than 1 year
- **Keep database size manageable** by removing historical data
- **Preserve statistics for current year** while discarding old data

## Deployment Steps

### 1. Deploy the Edge Function

Run the following command to deploy the function to Supabase:

```bash
npx supabase functions deploy cleanup-old-events
```

### 2. Set Up Cron Job

You need to create a Cron Job in Supabase to run this function daily.

#### Option A: Using Supabase Dashboard (Recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Database** → **Cron Jobs**
4. Click **Create a new cron job**
5. Configure:
   - **Name**: `cleanup-old-events-daily`
   - **Schedule**: `0 2 * * *` (Every day at 2:00 AM UTC)
   - **Command**:
     ```sql
     SELECT
       net.http_post(
         url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/cleanup-old-events',
         headers:=jsonb_build_object(
           'Content-Type','application/json',
           'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
         ),
         body:='{}'::jsonb
       ) as request_id;
     ```
   - Replace `YOUR_PROJECT_REF` with your actual Supabase project reference

6. Click **Create cron job**

#### Option B: Using SQL Migration

Create a new migration file:

```bash
npx supabase migration new add_cleanup_old_events_cron
```

Add the following SQL to the migration file:

```sql
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the cron job
SELECT cron.schedule(
  'cleanup-old-events-daily',
  '0 2 * * *',  -- Every day at 2:00 AM UTC
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/cleanup-old-events',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body:='{}'::jsonb
    ) as request_id;
  $$
);
```

**Note**: Replace `YOUR_PROJECT_REF` with your actual Supabase project reference.

Then run:

```bash
npx supabase db push
```

### 3. Test the Function

Test the function manually before enabling the cron job:

```bash
curl -L -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/cleanup-old-events' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Expected response:

```json
{
  "success": true,
  "deletedCount": 0,
  "cutoffDate": "2025-01-11T...",
  "message": "Deleted 0 expiry_events older than 2025-01-11T..."
}
```

### 4. Verify Cron Job is Running

After a day, check the Supabase logs to verify the cron job executed:

1. Go to **Database** → **Cron Jobs** in Supabase Dashboard
2. Find `cleanup-old-events-daily`
3. Check the **Last run** timestamp
4. Review logs in **Edge Functions** → **cleanup-old-events**

## Configuration

### Change Retention Period

If you want to change the retention period (default: 1 year), edit `supabase/functions/cleanup-old-events/index.ts`:

```typescript
// Change this line (line ~27):
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);  // 1 year

// To (for example, 6 months):
oneYearAgo.setMonth(oneYearAgo.getMonth() - 6);  // 6 months
```

Then redeploy:

```bash
npx supabase functions deploy cleanup-old-events
```

### Change Cron Schedule

To run at a different time/frequency, modify the cron expression:

- `0 2 * * *` - Every day at 2:00 AM
- `0 3 * * 0` - Every Sunday at 3:00 AM
- `0 0 1 * *` - First day of every month at midnight

[Cron Expression Reference](https://crontab.guru/)

## Monitoring

### Check Deletion Count

Run this query in Supabase SQL Editor to see how many events are older than 1 year:

```sql
SELECT COUNT(*) as old_events_count
FROM expiry_events
WHERE created_at < NOW() - INTERVAL '1 year';
```

### View Recent Deletions

Check Edge Function logs:

1. Go to **Edge Functions** → **cleanup-old-events**
2. Click **Logs**
3. Look for messages like: `Successfully deleted X old events`

## Troubleshooting

### Function not running
- Verify the cron job exists: `SELECT * FROM cron.job;`
- Check Edge Function logs for errors
- Ensure service_role_key is correctly configured

### No events deleted
- This is normal if all events are less than 1 year old
- Run the test SQL query above to verify event ages

### Permission errors
- Ensure the Edge Function is using `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- Verify RLS policies on `expiry_events` table

## Rollback

To remove the cron job:

```sql
SELECT cron.unschedule('cleanup-old-events-daily');
```

To delete the Edge Function:

```bash
npx supabase functions delete cleanup-old-events
```
