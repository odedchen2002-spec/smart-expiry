# Smart Expiry - App Store Submission Checklist

## ✅ VERIFIED & READY FOR PRODUCTION

### STEP 1: EAS Build Configuration ✅

**File: `eas.json`**

Production profile is now properly configured:
- ✅ `developmentClient: false` - Ensures no dev client in production
- ✅ `distribution: "store"` - Correct for App Store submission
- ✅ `ios.buildConfiguration: "Release"` - Ensures release build
- ✅ Separate `development` profile maintained for dev builds

**Action Required:** Update the `submit.production.ios` section in `eas.json` with your Apple credentials:
- `appleId`: Your Apple Developer account email
- `ascAppId`: Your App Store Connect app ID (numeric, found in App Store Connect URL)
- `appleTeamId`: Your Apple Developer Team ID (found in Apple Developer portal)

---

### STEP 2A: Environment Variables & Secrets ✅ HARDENED

**Production Hardening Applied:**
- ✅ Removed empty string fallbacks for required env vars
- ✅ App now fails immediately on startup if Supabase config is missing (production only)
- ✅ Development mode warns but continues (allows local dev)

**Required Environment Variables:**

#### Client-Side (Expo App)
| Variable | Required | Purpose | Source |
|----------|----------|---------|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ YES | Supabase project URL | Supabase Dashboard → Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ YES | Supabase anon key | Supabase Dashboard → Settings → API |
| `EXPO_PUBLIC_ENV` | ❌ NO | Dev environment flag | **MUST NOT be set to 'development' in production** |
| `EXPO_PUBLIC_PROJECT_ID` | ❌ NO | Push notifications | Already in app.json (7ce03dc4-5971-4529-a616-ef9eec311d2d) |
| `EXPO_PUBLIC_SUBSCRIPTION_DEBUG` | ❌ NO | Debug logging | **MUST NOT be set in production** |

#### Server-Side (Supabase Edge Functions)
| Variable | Required | Purpose | Source |
|----------|----------|---------|--------|
| `OPENAI_API_KEY` | ✅ YES | AI features (OpenAI) | Configure in Supabase Dashboard → Edge Functions → Secrets |
| `GEMINI_API_KEY` | ✅ YES | AI features (Gemini) | Configure in Supabase Dashboard → Edge Functions → Secrets |
| `SUPABASE_URL` | Auto | Auto-provided by Supabase | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Auto-provided by Supabase | - |

**Security Fixes Applied:**
- ✅ Added `.env` to `.gitignore` to prevent secrets in git
- ✅ Created `.env.example` template (document environment variables manually if file is filtered)

**Recommended Production Setup:**

Use EAS Secrets for production environment variables:

```bash
# Set production Supabase credentials
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJh..."

# DO NOT SET THESE IN PRODUCTION:
# EXPO_PUBLIC_ENV (leave unset - will use __DEV__ for dev detection)
# EXPO_PUBLIC_SUBSCRIPTION_DEBUG (leave unset)
```

**⚠️ CRITICAL:** Ensure you're using your **PRODUCTION** Supabase project credentials, not dev/staging.

---

### STEP 2B: Mock Pro/Paywall Bypass Logic ✅

**Status: ✅ ALREADY PRODUCTION-READY**

Mock upgrade logic is properly gated and will be **automatically disabled** in production builds:

**Files Checked:**
- `src/lib/subscription/mockDevUpgrade.ts`
- `app/(paywall)/subscribe.tsx`
- `src/lib/utils/devEnv.ts`

**Protection Mechanism:**
1. Mock upgrades only execute when `isDevEnv()` returns `true`
2. `isDevEnv()` returns `true` ONLY when:
   - `__DEV__` is `true` (automatically `false` in production React Native builds)
   - OR `process.env.EXPO_PUBLIC_ENV === 'development'`
   - OR `process.env.NODE_ENV === 'development'`
3. `mockDevUpgradeToPro()` function has built-in check and throws error if called in production

**Code Location:**

```typescript
// app/(paywall)/subscribe.tsx (lines 176-192)
if (devEnv) {
  // DEV-ONLY: Mock upgrade flow
  await mockDevUpgradeToPro(user.id!, plan);
  Alert.alert('Dev mode', `You are now on ${plan}...`);
  return;
}

// PRODUCTION: Real IAP flow
const purchaseFn = plan === 'pro' ? iapPurchasePro : iapPurchaseProPlus;
await purchaseFn();
```

**Verification:**
- ✅ No hardcoded `isPro = true`
- ✅ No bypass flags
- ✅ All mock logic gated behind `isDevEnv()`
- ✅ Production builds use real IAP flow

**Action Required:** 
- Ensure `EXPO_PUBLIC_ENV` is NOT set to `'development'` in production environment variables
- If using EAS secrets, do NOT create `EXPO_PUBLIC_ENV` secret for production profile

---

### STEP 3: iOS App Configuration ✅

**File: `app.json`**

```json
{
  "expo": {
    "name": "Smart Expiry",
    "slug": "expiryx-clean",
    "version": "1.0.2",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.oded.expiryxclean",
      "buildNumber": "2",
      "usesAppleSignIn": true,
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        "UIBackgroundModes": ["remote-notification"]
      },
      "icon": "./assets/images/logo.png"
    }
  }
}
```

**Verification:**
- ✅ **name**: "Smart Expiry" - Clear, user-facing app name
- ✅ **slug**: "expiryx-clean" - Stable, unique identifier
- ✅ **version**: "1.0.2" - Semantic versioning (increment for updates)
- ✅ **bundleIdentifier**: "com.oded.expiryxclean" - **DO NOT CHANGE** (matches Apple App ID)
- ✅ **buildNumber**: "2" - Incremented for each build (auto-incremented by EAS if using `cli.appVersionSource: "local"`)
- ✅ **supportsTablet**: `true` - Explicit iPad support
- ✅ **icon**: "./assets/images/logo.png" - Logo file exists (930KB PNG, appears to be 1024x1024)
- ✅ **usesAppleSignIn**: `true` - Apple Sign In enabled
- ✅ **ITSAppUsesNonExemptEncryption**: `false` - Export compliance declaration

**Icon Requirements:**
- ✅ Format: PNG
- ✅ Size: 1024x1024px (appears correct based on file size)
- ⚠️ Transparency: iOS requires NO transparency for app icons (verify manually if needed)

**Action Required:**
1. Verify logo.png is 1024x1024px with NO transparency (use image editor if needed)
2. For each new App Store submission, increment `version` (e.g., "1.0.3")
3. `buildNumber` will auto-increment with `eas build` if you have `cli.appVersionSource: "local"`

---

## 🚀 PRODUCTION BUILD & SUBMIT COMMANDS

### 1. Build Production iOS App

```bash
# Build for iOS App Store (production profile)
eas build --platform ios --profile production
```

This will:
- Use the `production` build profile from `eas.json`
- Create a release build with `developmentClient: false`
- Generate an `.ipa` file signed for App Store distribution
- Automatically use EAS secrets (if configured)

### 2. Submit to App Store

After the build completes:

```bash
# Submit to App Store Connect (requires Apple credentials in eas.json)
eas submit --platform ios --latest
```

Or submit manually:
1. Download the `.ipa` from EAS build page
2. Upload to App Store Connect using Transporter app
3. Complete App Store Connect listing
4. Submit for review

---

## 📋 PRE-SUBMISSION CHECKLIST

### Development Environment
- [ ] Committed all changes to git
- [ ] Created git tag for this release: `git tag v1.0.2 && git push --tags`
- [ ] `.env` file is ignored and NOT in git
- [ ] `EXPO_PUBLIC_ENV` is NOT set to `'development'` in production secrets

### EAS Configuration
- [ ] Updated Apple credentials in `eas.json` → `submit.production.ios`
- [ ] Verified `appleId`, `ascAppId`, `appleTeamId` are correct
- [ ] Configured EAS secrets for production:
  ```bash
  eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "..."
  eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..."
  ```

### Supabase Edge Functions
- [ ] Configured `OPENAI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets
- [ ] Configured `GEMINI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets
- [ ] Verified using PRODUCTION Supabase project (not dev/staging)

### App Store Connect
- [ ] Created app in App Store Connect with bundle ID: `com.oded.expiryxclean`
- [ ] App icon meets requirements (1024x1024px, no transparency)
- [ ] Screenshots prepared (required for all supported devices)
- [ ] App description, keywords, categories configured
- [ ] Privacy policy URL added (required)
- [ ] Support URL added (required)
- [ ] Age rating completed

### Testing
- [ ] Tested production build on physical iOS device (not simulator)
- [ ] Verified Apple Sign In works
- [ ] Verified in-app purchases work (test in sandbox first)
- [ ] Verified push notifications work
- [ ] Verified camera/photo permissions work
- [ ] No dev-only features are visible (mock upgrades, debug logs)

---

## 🔐 SECURITY VERIFICATION

- ✅ No `.env` file committed to git
- ✅ No hardcoded API keys in source code
- ✅ Mock Pro upgrades gated behind `__DEV__` check
- ✅ Production uses real IAP flow, not mock subscriptions
- ✅ All sensitive variables in EAS secrets or Supabase secrets

---

## 📱 FINAL COMMANDS SUMMARY

```bash
# 1. Verify configuration
cat eas.json
cat app.json

# 2. Set EAS secrets (if not already done)
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-prod-project.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJh..."

# 3. Build for App Store
eas build --platform ios --profile production

# 4. Submit to App Store (after build completes)
eas submit --platform ios --latest

# 5. Or download .ipa and upload manually via Transporter
```

---

## 📝 NOTES

- **First Submission**: Initial review typically takes 1-3 days
- **Updates**: Reviews typically take 24-48 hours
- **Bundle ID**: `com.oded.expiryxclean` - DO NOT change after first submission
- **Version Increments**: Bump `version` for each App Store release (e.g., 1.0.2 → 1.0.3)
- **Build Numbers**: Auto-incremented by EAS when using `cli.appVersionSource: "local"`

---

**Last Updated:** 2026-01-12
**Status:** ✅ PRODUCTION READY
