# Delete Account Edge Function - Deployment Guide

This guide walks through deploying and configuring the `delete-account` Edge Function.

## Prerequisites

1. Supabase CLI installed: `npm install -g supabase`
2. Logged into Supabase CLI: `supabase login`
3. Project reference ID (found in Supabase Dashboard → Project Settings → General)

## Step 1: Verify the Edge Function Source

The function source is located at:
```
supabase/functions/delete-account/index.ts
```

The function:
- Uses modern handler pattern (`export default async function handler`)
- Validates environment variables
- Authenticates user via Bearer token
- Deletes all user data from relevant tables
- Deletes the Auth user using service role key
- Includes comprehensive logging

## Step 2: Configure Supabase Secrets

The function requires these environment variables (all auto-provided by Supabase):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Note:** These are automatically available to Edge Functions. You don't need to set them manually.

However, if you want to verify or set them explicitly:

```bash
# Get your project reference
# Find it in: Supabase Dashboard → Project Settings → General → Reference ID

# Set secrets (optional - they're auto-provided)
supabase secrets set \
  SUPABASE_URL="https://<your-project>.supabase.co" \
  SUPABASE_ANON_KEY="<anon-public-key>" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  --project-ref <PROJECT_REF>
```

**Important:** The service role key should NEVER be exposed to client-side code. It's only used inside the Edge Function.

## Step 3: Deploy the Function

From the project root directory:

```bash
# Make sure you're linked to your project
supabase link --project-ref <PROJECT_REF>

# Deploy the function
supabase functions deploy delete-account --project-ref <PROJECT_REF>
```

After deployment, you should see:
```
Deploying delete-account...
Function delete-account deployed successfully
```

## Step 4: Verify Deployment

1. Go to **Supabase Dashboard** → **Edge Functions**
2. You should now see `delete-account` in the list
3. Click on it to see details
4. The URL should be: `https://<project>.supabase.co/functions/v1/delete-account`

## Step 5: Verify Client Configuration

The client code is already configured in:
- `src/lib/supabase/mutations/auth.ts` - `deleteUserAccount()` function
- `app/settings/profile.tsx` - UI handler

The client:
- Gets the current session
- Extracts the access token
- Sends POST request to `/functions/v1/delete-account` with `Authorization: Bearer <token>`
- Handles errors appropriately

## Step 6: Test the Function

### Option 1: Test via App

1. Run the app: `npm start`
2. Log in with a test account
3. Go to Settings → Profile
4. Click "Delete Account" button
5. Confirm deletion
6. Verify:
   - Account is deleted
   - User is signed out
   - Navigated to login screen

### Option 2: Test via cURL

```bash
# Get your access token from the app (check browser DevTools Network tab)
# Or use Supabase Dashboard → Authentication → Users → Create test user → Get token

curl -X POST https://<project>.supabase.co/functions/v1/delete-account \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json"
```

Expected response on success:
```json
{"success": true}
```

## Step 7: Debug Issues

If the function fails:

1. **Check Edge Function Logs:**
   ```bash
   supabase functions logs delete-account --project-ref <PROJECT_REF>
   ```

2. **Or view in Dashboard:**
   - Go to Supabase Dashboard → Edge Functions → delete-account → Logs
   - Look for error messages with prefix `delete-account:`

3. **Common Issues:**

   - **401 Unauthorized**: User token is invalid or expired
     - Solution: User needs to log in again

   - **500 Server Error**: Missing environment variables
     - Solution: Verify secrets are set (they should be auto-provided)

   - **Function not found**: Function not deployed
     - Solution: Run `supabase functions deploy delete-account --project-ref <PROJECT_REF>`

   - **Table/Column errors**: Database schema mismatch
     - Solution: Check that all referenced tables exist. The function gracefully skips missing tables/columns.

## Verification Checklist

- [ ] Function source exists at `supabase/functions/delete-account/index.ts`
- [ ] Function uses modern handler pattern
- [ ] Function has proper logging (all logs prefixed with `delete-account:`)
- [ ] Function deployed successfully
- [ ] Function appears in Supabase Dashboard → Edge Functions
- [ ] Client code calls correct URL: `${SUPABASE_URL}/functions/v1/delete-account`
- [ ] Client sends `Authorization: Bearer <token>` header
- [ ] Test deletion works end-to-end
- [ ] User data is deleted from all tables
- [ ] Auth user is removed from Authentication → Users
- [ ] App signs out user and navigates to login

## Security Reminders

1. **Service Role Key**: Only used server-side in Edge Function, never exposed to client
2. **Authentication**: Function validates user token before deletion
3. **Authorization**: Users can only delete their own account
4. **Logging**: All operations are logged for audit purposes

## Troubleshooting

### "אירעה שגיאה, failed to delete account"

This error means the Edge Function call failed. Check:

1. Is the function deployed? (Supabase Dashboard → Edge Functions)
2. Are logs showing errors? (`supabase functions logs delete-account`)
3. Is the access token valid? (User might need to log in again)
4. Is the URL correct? (Should be `${SUPABASE_URL}/functions/v1/delete-account`)

### Function deployed but not visible in Dashboard

- Wait a few seconds and refresh
- Check you're looking at the correct project
- Verify deployment succeeded (check CLI output)

### Deletion succeeds but user still exists

- Check Edge Function logs for errors
- Verify service role key has proper permissions
- Check if there are database constraints preventing deletion

