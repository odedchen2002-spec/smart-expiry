# APNs Credentials Diagnostic Guide

## Problem
Getting error: "Could not find APNs credentials for com.oded.expiryxclean (@odedchem/expiryx)" (InvalidCredentials)

Even after uploading APNs push key and assigning it via `eas credentials`, the error persists.

## Root Cause
The error message shows which Expo project Expo is looking for APNs credentials in. If the error shows `@odedchem/expiryx` but your app.json has slug `expiryx-clean`, there's a **project mismatch**.

The `projectId` in `app.json` (`extra.eas.projectId`) belongs to one Expo project, but the APNs key was uploaded to a different Expo project.

## Diagnostic Steps

### 1. Check Current Configuration

The app will now log detailed project information when:
- Registering for push notifications
- Sending push notifications
- Encountering APNs credential errors

Look for logs like:
```
[Notifications] Project Configuration: {
  projectId: "7ce03dc4-5971-4529-a616-ef9eec311d2d",
  appSlug: "expiryx-clean",
  bundleId: "com.oded.expiryxclean"
}
```

### 2. Verify Which Expo Project the projectId Belongs To

Run this command to see which Expo project your projectId is associated with:

```bash
npx expo whoami
npx expo projects:list
```

Or check in Expo dashboard: https://expo.dev/accounts/[your-account]/projects

### 3. Check Which Project Has APNs Credentials

Run this command to see which project has the APNs push key:

```bash
eas credentials -p ios
```

Look for:
- **Bundle ID**: Should be `com.oded.expiryxclean`
- **Push Key**: Should show your Key ID (e.g., `94ST46PVVX`)
- **Project**: Note which Expo project this is associated with

### 4. Identify the Mismatch

Compare:
- **Error message project**: `@odedchem/expiryx` (from the error)
- **Your app.json slug**: `expiryx-clean` (from app.json)
- **Project with APNs key**: Check from `eas credentials` output

If they don't match, that's the problem!

## Solutions

### Solution 1: Upload APNs Key to the Correct Project (Recommended)

If the `projectId` in app.json belongs to `@odedchem/expiryx` (the one in the error), upload the APNs key there:

```bash
# Switch to the correct project (if needed)
# Then upload the APNs key
eas credentials -p ios
# Select "Set up push notifications" or "Update push key"
# Upload your .p8 file
```

### Solution 2: Change projectId to Match the Project with APNs Key

If you want to use `@odedchem/expiryx-clean` (where the APNs key is), you need to:

1. **Get the projectId for `@odedchem/expiryx-clean`**:
   - Go to Expo dashboard
   - Select the `expiryx-clean` project
   - The projectId is shown in the project settings

2. **Update app.json**:
   ```json
   {
     "expo": {
       "extra": {
         "eas": {
           "projectId": "<new-project-id-for-expiryx-clean>"
         }
       }
     }
   }
   ```

3. **Rebuild the app**:
   ```bash
   eas build -p ios --profile development
   ```

### Solution 3: Verify Build is Using Correct projectId

After making changes, verify the build is using the correct projectId:

1. Install the new build on your device
2. Check the logs when registering for push notifications
3. Look for: `[Notifications] Project Configuration:` log
4. Verify the `projectId` matches the project where APNs key is uploaded

## Verification Checklist

- [ ] `projectId` in app.json matches the Expo project with APNs key
- [ ] Bundle ID in app.json (`com.oded.expiryxclean`) matches the bundle ID in APNs key
- [ ] App was rebuilt after changing projectId (if Solution 2 was used)
- [ ] `eas credentials -p ios` shows the push key for the correct project
- [ ] Logs show the correct projectId when registering/sending notifications
- [ ] Error message no longer shows InvalidCredentials

## How to Check Which Project a projectId Belongs To

Unfortunately, there's no direct CLI command. You can:

1. Check Expo dashboard: https://expo.dev/accounts/[your-account]/projects
2. Look at each project's settings to find the projectId
3. Or check your EAS build history - each build shows which project it belongs to

## Additional Notes

- The error message format: `"Could not find APNs credentials for <bundleId> (<expo-project>)"`
- The `<expo-project>` part shows which Expo project Expo is looking for credentials in
- This is determined by the `projectId` used when getting the push token
- The `projectId` comes from `app.json` → `extra.eas.projectId` or `EXPO_PUBLIC_PROJECT_ID` env var

## After Fixing

Once everything is aligned:
1. Rebuild the app: `eas build -p ios --profile development`
2. Install on device
3. Try saving notification settings again
4. Check logs - should see successful push token registration
5. Send a test notification - should work without InvalidCredentials error

