# Expiry Notifications - Server-Side Implementation

This document describes the server-side expiry notification system using Supabase Edge Functions and cron jobs.

## Architecture

All expiry notification logic has been moved from the client to the server:

- **Client**: Only registers push tokens and saves notification settings
- **Server**: Edge Function runs daily via cron, checks expiring items, sends Expo push notifications

## Database Schema

### `notification_settings` Table

```sql
CREATE TABLE public.notification_settings (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  days_before INTEGER NOT NULL DEFAULT 1,
  hour INTEGER NOT NULL DEFAULT 9 CHECK (hour >= 0 AND hour <= 23),
  minute INTEGER NOT NULL DEFAULT 0 CHECK (minute >= 0 AND minute <= 59),
  timezone TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS Policy**: Users can read/write only their own settings (by `owner_id`).

## Edge Function: `check-expiring-items`

### Location
`supabase/functions/check-expiring-items/index.ts`

### Behavior

1. **Fetches enabled settings**: Gets all `notification_settings` where `enabled = true`
2. **For each owner**:
   - Computes target date based on `days_before` and `timezone`
   - Queries `items` table for items expiring on target date
   - Filters out resolved/expired/plan-locked items
   - If items found:
     - Gets push tokens for owner + active collaborators
     - Sends Expo push notifications via `https://exp.host/--/api/v2/push/send`
     - Logs to `notification_sent_log` table
3. **Time window check**: Only sends if current time is within 2-hour window around configured hour:minute

### Deployment

```bash
supabase functions deploy check-expiring-items
```

## Cron Job Setup

1. Go to Supabase Dashboard → Database → Cron Jobs
2. Create new cron job:
   - **Name**: `daily-expiry-check`
   - **Schedule**: `0 3 * * *` (runs daily at 03:00 UTC)
   - **Function**: `check-expiring-items`
   - **Enabled**: `true`

### Time Window Logic

The function respects each user's `hour`, `minute`, and `timezone`:
- Converts current UTC time to user's timezone
- Checks if current time is within `[hour:minute, hour:minute + 2h]` window
- Only sends if within window (handles cron timing variations)

## Client-Side Changes

### Removed Functions

All client-side scheduling functions have been removed:
- `scheduleDailyNotifications`
- `scheduleInitialExpiryNotification`
- `scheduleNextDayExpiryNotification`
- `checkAndSendNotifications`
- `cancelAllExpiryCheckNotifications`
- `buildNotificationBody`
- All guards (`handledNotificationIds`, `handledRunsToday`, `getTodayKey`)

### Removed Logic

- All `expiry_check` local notification scheduling
- All `expiry_check` handling in notification handler/listener
- All immediate-fire bug detection and retry logic
- All guards and duplicate prevention logic

### What Remains

- `registerForPushNotificationsAsync()` - Only for getting push token
- `sendTestNotification()` - For testing local notifications
- Notification handler/listener - Simple, shows all notifications normally

## Settings Screen

The settings screen (`app/settings/notifications.tsx`) now:

1. **Saves to Supabase**: Writes to `notification_settings` table
2. **Loads from Supabase**: Reads settings on mount (with AsyncStorage fallback)
3. **No local scheduling**: Does not call any scheduling functions

## Testing

### Manual Edge Function Test

1. Go to Supabase Dashboard → Edge Functions → `check-expiring-items`
2. Click "Invoke function"
3. Check logs for:
   - Settings fetched
   - Items found
   - Push notifications sent
   - Success/failure for each owner

### End-to-End Test

1. **In app**: Save notification settings (e.g., 2 minutes from now)
2. **In Supabase**: Manually trigger Edge Function
3. **On device**: Should receive Expo push notification

## Migration Notes

- Existing users: Settings will be migrated when they next save notification settings
- Old local notifications: Will be automatically cleaned up (no longer scheduled)
- No data migration needed: New table is created fresh

## Troubleshooting

### No notifications received

1. Check Edge Function logs in Supabase Dashboard
2. Verify `notification_settings` table has correct data
3. Verify `user_preferences` table has valid push tokens
4. Check that cron job is enabled and running
5. Verify time window logic (function only sends within 2-hour window)

### Edge Function errors

- Check Supabase logs for detailed error messages
- Verify RLS policies allow service role to read `notification_settings`
- Verify `items` table structure matches function expectations
- Check that `notification_sent_log` table exists

