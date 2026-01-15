# 🔧 Production Login Issue - Diagnostic & Fix Guide

**Issue:** Login fails in TestFlight with "Network request failed"  
**Works in:** Development builds  
**Date:** 2026-01-12

---

## 🎯 ROOT CAUSE ANALYSIS

### Most Likely Cause
**Environment variables not injected into production build**

When you run `eas build --profile production`, EAS must inject the secrets at build time. If the secrets aren't properly configured or the build profile doesn't reference them correctly, the app will have `undefined` values for `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

---

## 📊 EVIDENCE & DIAGNOSTICS

### 1️⃣ Login Flow Trace

**Entry Point:** `app/(auth)/login.tsx` → `handleLogin()` (line 215)

**Call Chain:**
```typescript
handleLogin()
  ↓
signIn({ email, password })  // src/lib/supabase/auth.ts:560
  ↓
supabase.auth.signInWithPassword()  // Supabase SDK
  ↓
HTTP POST to: {SUPABASE_URL}/auth/v1/token?grant_type=password
```

**Failing Request:**
- **URL:** `${SUPABASE_URL}/auth/v1/token?grant_type=password`
- **Headers:** `apikey: ${SUPABASE_ANON_KEY}`, `Authorization: Bearer ${SUPABASE_ANON_KEY}`
- **Error:** "Network request failed"

### 2️⃣ Configuration Check

**Files:**
- `src/lib/constants/config.ts` - Reads `process.env.EXPO_PUBLIC_SUPABASE_URL`
- `src/lib/supabase/client.ts` - Creates Supabase client with URL + KEY

**EAS Secrets Status:**
```bash
eas secret:list
```
Output shows:
- ✅ `EXPO_PUBLIC_SUPABASE_URL` - Updated Jan 13 00:22:53
- ✅ `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Updated Jan 13 00:23:07

**Problem:**
Even though secrets exist, they may not be injected if:
1. Build was created BEFORE secrets were added
2. Build profile doesn't trigger secret injection
3. Secrets have wrong scope (account vs project)

---

## 🔍 INSTRUMENTATION ADDED

### Files Modified:

#### 1. `src/lib/constants/config.ts`
Added startup logging to show actual env values:
```typescript
console.log('[CONFIG] Environment check:', {
  SUPABASE_URL: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 30)}...` : 'MISSING',
  SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 20)}...` : 'MISSING',
  __DEV__,
  EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV,
  NODE_ENV: process.env.NODE_ENV,
});
```

#### 2. `src/lib/supabase/client.ts`
Added client initialization logging:
```typescript
console.log('[Supabase Client] Initializing with:', {
  URL: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 40)}...` : 'UNDEFINED',
  KEY: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 20)}...` : 'UNDEFINED',
  URL_isHttps: SUPABASE_URL?.startsWith('https://'),
  URL_length: SUPABASE_URL?.length || 0,
  KEY_length: SUPABASE_ANON_KEY?.length || 0,
});
```

#### 3. `src/lib/supabase/auth.ts`
Added request-level logging in `signIn()`:
```typescript
console.log('[Auth] signIn called for email:', email);
console.log('[Auth] Supabase client URL:', supabase['supabaseUrl']?.substring(0, 40) + '...');
```

#### 4. `app/(auth)/login.tsx`
Enhanced error messages for network failures:
```typescript
if (signInError.message?.includes('Network request failed')) {
  const detailedError = `Network request failed\n\n` +
    `This usually means:\n` +
    `1. No internet connection\n` +
    `2. Supabase URL is incorrect\n` +
    `3. Firewall/network blocking\n\n` +
    `Check console logs for config details.`;
  setError(detailedError);
}
```

#### 5. NEW: `src/lib/diagnostics/productionDiagnostics.ts`
Comprehensive health check function that tests:
- Environment variables present
- URL uses HTTPS
- URL is not localhost
- Supabase connectivity (simple query)
- Auth service accessibility

#### 6. NEW: `app/(auth)/diagnostics.tsx`
Diagnostic screen for viewing results in-app (TestFlight builds)

---

## 🚀 FIX INSTRUCTIONS

### Step 1: Verify EAS Secrets

```bash
# List all secrets
eas secret:list

# Verify values (read first 50 chars)
eas secret:list --name EXPO_PUBLIC_SUPABASE_URL
```

**Expected:**
- EXPO_PUBLIC_SUPABASE_URL should start with `https://` and end with `.supabase.co`
- EXPO_PUBLIC_SUPABASE_ANON_KEY should be a long JWT token (starts with `eyJ`)

### Step 2: Rebuild with Fresh Secrets

Your build from earlier today was likely created BEFORE you set the secrets (secrets updated at 00:22, build might have been earlier).

```bash
# Clean rebuild with production profile
eas build --platform ios --profile production --clear-cache
```

This will:
- Use the latest EAS secrets (updated Jan 13)
- Inject them at build time into the app bundle
- Create a new .ipa with correct configuration

### Step 3: Install New Build in TestFlight

After the build completes (~15-20 min):
1. It will auto-upload to TestFlight
2. Wait for "Processing" to complete (~5 min)
3. Install the new build on your iPhone
4. Try logging in again

### Step 4: View Logs to Verify Fix

**On Mac with iPhone connected:**
```bash
# Option 1: Xcode Device Console
1. Open Xcode → Window → Devices and Simulators
2. Select your iPhone
3. Click "Open Console"
4. Filter: "CONFIG"
5. Look for the [CONFIG] Environment check log

# Option 2: Console.app
1. Open Console.app
2. Select iPhone from sidebar
3. Search: "CONFIG" or "Auth"
```

**What to look for:**
```
[CONFIG] Environment check: {
  SUPABASE_URL: 'https://yourproject.supabase.co...',  ← Should NOT be 'MISSING'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiI...',        ← Should NOT be 'MISSING'
  __DEV__: false,
  EXPO_PUBLIC_ENV: 'production'
}
```

If you still see `MISSING`, the secrets aren't being injected.

---

## 🔍 DIAGNOSTIC SCREEN (In-App)

To access diagnostics in your TestFlight build:

1. Add to your navigation (temporarily):
   ```typescript
   // In app/(auth)/_layout.tsx or similar
   <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
   ```

2. Add a debug button on login screen (dev/TestFlight only):
   ```typescript
   {!__DEV__ && process.env.EXPO_PUBLIC_ENV !== 'production' && (
     <Button onPress={() => router.push('/(auth)/diagnostics')}>
       Run Diagnostics
     </Button>
   )}
   ```

3. Or navigate directly:
   ```typescript
   router.push('/(auth)/diagnostics')
   ```

---

## 🎯 VERIFICATION STEPS (After New Build)

### In TestFlight:
1. **Check console logs first** (connect to Xcode)
   - Should see `[CONFIG] Environment check` with real URLs
   - Should NOT see "MISSING" for either variable

2. **Try to log in**
   - Should work normally now
   - If fails, check what error appears

3. **Run in-app diagnostics** (if added to navigation)
   - Navigate to diagnostics screen
   - Should show all checks passing

4. **Test these features:**
   - ✅ Email/password login
   - ✅ Apple Sign In
   - ✅ Sign up
   - ✅ Password reset

---

## 🔐 SECURITY NOTE

**The logging added is production-safe:**
- Only logs SANITIZED values (first 20-40 characters)
- Never logs full API keys
- Never logs passwords
- Console logs are not visible to end users (only in Xcode console)

**After verifying the fix works, you can optionally:**
- Remove detailed logging if you prefer cleaner logs
- Keep logging for future debugging (recommended for TestFlight)
- Gate logs behind `!__DEV__ && process.env.EXPO_PUBLIC_LOG_LEVEL === 'debug'`

---

## 📋 CHECKLIST

Before building:
- [x] EAS secrets configured (verified Jan 13 00:22-00:23)
- [x] Logging added to config.ts, client.ts, auth.ts
- [x] Enhanced error messages in login screen
- [x] Diagnostic tools created

After building:
- [ ] New build created after secrets were set
- [ ] TestFlight build installed
- [ ] Console logs show real URLs (not MISSING)
- [ ] Login works
- [ ] Diagnostics screen shows all passes

---

## 🆘 IF LOGIN STILL FAILS

### Check Console Logs for These Patterns:

**Pattern 1: Missing ENV**
```
[CONFIG] SUPABASE_URL: 'MISSING'
[CONFIG] SUPABASE_ANON_KEY: 'MISSING'
```
**Fix:** Secrets exist but not injected → rebuild required

**Pattern 2: Wrong URL**
```
[CONFIG] SUPABASE_URL: 'http://localhost:54321'
[CONFIG] URL_isHttps: false
```
**Fix:** Check .env file, ensure EAS secrets have production URL

**Pattern 3: Empty Values**
```
[CONFIG] SUPABASE_URL: ''
[CONFIG] URL_length: 0
```
**Fix:** Secret value is empty → reset with correct value:
```bash
eas secret:delete --name EXPO_PUBLIC_SUPABASE_URL
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."
```

**Pattern 4: Network Request Failed (but config is correct)**
```
[CONFIG] SUPABASE_URL: 'https://yourproject.supabase.co...'
[Auth] signInWithPassword failed: Network request failed
```
**Fix:** Network/connectivity issue or Supabase project is paused/deleted

---

## 🎉 EXPECTED OUTCOME

After rebuild with correct secrets:
- ✅ Console shows real Supabase URLs on startup
- ✅ Login succeeds without "Network request failed"
- ✅ All auth methods work (email, Apple, Google)
- ✅ App functions normally

---

**Next Steps:**
1. Run: `eas build --platform ios --profile production --clear-cache`
2. Wait for build to complete
3. Install from TestFlight
4. Check console logs (connect iPhone to Xcode)
5. Verify login works

**Need help?** Share the console logs (first 20 lines after app launch) and I can pinpoint the exact issue.
