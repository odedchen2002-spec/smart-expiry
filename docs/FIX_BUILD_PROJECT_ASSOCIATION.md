# Fix Development Build Project Association

## Problem
The installed development build points to the wrong Expo project (`@odedchem/expiryx` instead of `@odedchem/expiryx-clean`), causing APNs credential errors.

## Root Cause
The `projectId` is **embedded in the build at build time**. If the build was created when the project was linked to a different Expo project, the installed build will continue to use that project's credentials, even if the local code is updated.

## Current Status
✅ **Local project is correctly linked:**
- `npx eas project:info` shows: `@odedchem/expiryx-clean` (ID: `7ce03dc4-5971-4529-a616-ef9eec311d2d`)
- `app.json` has correct `projectId`: `7ce03dc4-5971-4529-a616-ef9eec311d2d`

❌ **Installed build is from old project:**
- The build on your device was created when linked to `@odedchem/expiryx`
- It has the old projectId embedded in it
- Push notifications look for APNs credentials in the wrong project

## Solution: Rebuild the Development Build

### Step 1: Verify Local Configuration
```bash
# Verify project link
npx eas project:info
# Should show: @odedchem/expiryx-clean

# Verify app.json has correct projectId
cat app.json | grep projectId
# Should show: "projectId": "7ce03dc4-5971-4529-a616-ef9eec311d2d"
```

### Step 2: Rebuild with Correct Project Association
```bash
eas build -p ios --profile development
```

This will:
- Use the current project link (`@odedchem/expiryx-clean`)
- Embed the correct projectId (`7ce03dc4-5971-4529-a616-ef9eec311d2d`) in the build
- Create a build that looks for APNs credentials in the correct project

### Step 3: Install New Build
1. Wait for build to complete
2. Download the new build from EAS
3. Install on your iPhone
4. The new build will use the correct projectId

### Step 4: Verify Fix
After installing the new build:
1. Open the app
2. Try to save notification settings
3. Check logs - should see:
   ```
   [Notifications] Project Configuration: {
     projectId: "7ce03dc4-5971-4529-a616-ef9eec311d2d",
     embeddedProjectId: "7ce03dc4-5971-4529-a616-ef9eec311d2d",
     ...
   }
   ```
4. No more `InvalidCredentials` error
5. Push notifications should work

## Why This Happens
- Expo embeds the `projectId` in the native build at build time
- This is stored in the app's Info.plist (iOS) or similar
- Changing `app.json` after building doesn't affect the installed build
- You must rebuild to update the embedded projectId

## Prevention
1. Always verify project link before building:
   ```bash
   npx eas project:info
   ```

2. Check `app.json` has correct `projectId` before building

3. If you switch projects or update projectId:
   - Always rebuild: `eas build -p ios --profile development`
   - Don't just update `app.json` and expect it to work

4. The code now includes a warning if there's a mismatch between embedded and runtime projectId

## Additional Notes
- The `.expo/` folder is local dev cache - doesn't affect builds
- The `.eas/` folder doesn't exist (normal - it's auto-generated)
- The key files are:
  - `app.json` - source of truth for projectId
  - `eas.json` - build profiles
  - The build itself - contains embedded projectId

