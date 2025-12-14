# Fix Project Association for Development Build

## Problem
The installed development build was created when the project was linked to `@odedchem/expiryx` (old project), but now the local project is correctly linked to `@odedchem/expiryx-clean` with projectId `7ce03dc4-5971-4529-a616-ef9eec311d2d`.

The build contains the projectId embedded in it, so even though the local code is correct, the installed build still points to the old project, causing APNs credential errors.

## Solution: Rebuild with Correct Project Association

### Step 1: Verify Local Project Link
```bash
npx eas project:info
```
Should show:
```
fullName  @odedchem/expiryx-clean
ID        7ce03dc4-5971-4529-a616-ef9eec311d2d
```

### Step 2: Verify app.json Configuration
Check that `app.json` has:
```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "7ce03dc4-5971-4529-a616-ef9eec311d2d"
      }
    }
  }
}
```

### Step 3: Rebuild Development Build
```bash
eas build -p ios --profile development
```

This will create a new build with the correct projectId embedded, linking it to `@odedchem/expiryx-clean`.

### Step 4: Install New Build
After the build completes:
1. Download and install the new build on your iPhone
2. The new build will use projectId `7ce03dc4-5971-4529-a616-ef9eec311d2d`
3. Push notifications will look for APNs credentials in `@odedchem/expiryx-clean` (correct project)

### Step 5: Verify APNs Credentials
After installing the new build:
```bash
eas credentials -p ios
```
Verify that the push key for `com.oded.expiryxclean` is in `@odedchem/expiryx-clean` project.

## Why This Happens
- The projectId is embedded in the build at build time
- If the build was created when the project was linked to a different Expo project, it will continue to use that project's credentials
- Rebuilding with the current (correct) project link fixes this

## Prevention
- Always verify `npx eas project:info` shows the correct project before building
- Check that `app.json` has the correct `projectId` before building
- If you switch projects, always rebuild

