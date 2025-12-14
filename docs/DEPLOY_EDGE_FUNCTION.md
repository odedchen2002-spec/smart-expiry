# How to Deploy the check-expiring-items Edge Function

This guide explains step-by-step how to deploy the `check-expiring-items` Edge Function to Supabase.

## Prerequisites

1. **Supabase CLI installed**
   ```bash
   npm install -g supabase
   ```
   Or using other package managers:
   ```bash
   # Homebrew (Mac)
   brew install supabase/tap/supabase
   
   # Scoop (Windows)
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```

2. **Logged in to Supabase**
   ```bash
   supabase login
   ```
   This will open a browser window for authentication.

3. **Linked to your project**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   You can find your project ref in:
   - Supabase Dashboard → Settings → General → Reference ID
   - Or in your project URL: `https://YOUR_PROJECT_REF.supabase.co`

## Deployment Steps

### Option 1: Deploy from Command Line (Recommended)

1. **Navigate to your project root**
   ```bash
   cd C:\dev\myapp\expiryx-clean
   ```

2. **Deploy the function**
   ```bash
   supabase functions deploy check-expiring-items
   ```

3. **Verify deployment**
   - The CLI will show deployment progress
   - You should see: `Deployed Function check-expiring-items`
   - Check Supabase Dashboard → Edge Functions → `check-expiring-items` appears

### Option 2: Deploy via Supabase Dashboard

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Open Edge Functions**
   - Click on "Edge Functions" in the left sidebar
   - Or go to: Project → Edge Functions

3. **Create/Update Function**
   - If the function doesn't exist, click "Create a new function"
   - If it exists, click on `check-expiring-items` to edit
   - Copy the contents of `supabase/functions/check-expiring-items/index.ts`
   - Paste into the editor
   - Click "Deploy" or "Save"

## Verification

### 1. Check Function Exists

In Supabase Dashboard:
- Go to Edge Functions
- You should see `check-expiring-items` in the list
- Status should be "Active" or "Deployed"

### 2. Test the Function Manually

**Via Dashboard:**
1. Go to Edge Functions → `check-expiring-items`
2. Click "Invoke function" or "Test"
3. Check the logs for output:
   - Should show: `Starting daily expiry check...`
   - Should show: `Found X enabled notification settings`
   - Should show results for each owner processed

**Via CLI:**
```bash
supabase functions invoke check-expiring-items
```

### 3. Check Function Logs

**Via Dashboard:**
- Go to Edge Functions → `check-expiring-items` → Logs
- You should see recent invocations and their output

**Via CLI:**
```bash
supabase functions logs check-expiring-items
```

## Troubleshooting

### Error: "Function not found"
- Make sure you're in the project root directory
- Verify the function file exists at: `supabase/functions/check-expiring-items/index.ts`
- Check that you're linked to the correct project: `supabase projects list`

### Error: "Authentication required"
- Run: `supabase login`
- Make sure you're logged in with the correct account

### Error: "Project not linked"
- Run: `supabase link --project-ref YOUR_PROJECT_REF`
- Get your project ref from Supabase Dashboard → Settings → General

### Function deploys but doesn't work
- Check function logs for errors
- Verify environment variables are set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are auto-provided)
- Check that the `notification_settings` table exists (run the migration first)
- Verify RLS policies allow the service role to read `notification_settings`

## Next Steps After Deployment

1. **Set up the Cron Job** (see step 3 in main guide)
2. **Test with real data**:
   - Save notification settings in the app
   - Manually trigger the function
   - Verify push notification is received

## Environment Variables

The Edge Function automatically receives these from Supabase:
- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS)

These are set automatically - you don't need to configure them manually.

## Function URL

After deployment, your function will be available at:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-expiring-items
```

This URL is used by the cron job to invoke the function.

