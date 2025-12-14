# Terms Acceptance Implementation

This document describes the implementation of cryptographic hash tracking for Terms of Use acceptance.

## Overview

The system stores a SHA-256 hash of the Terms of Use text that each user accepted, allowing us to prove exactly which version of the terms they agreed to.

## Database Schema

### Profiles Table

The `profiles` table has been extended with two new columns:

- `accepted_terms_at` (TIMESTAMPTZ) - Timestamp when user accepted the terms
- `terms_hash` (TEXT) - SHA-256 hash of the Terms of Use version accepted

### Migration SQL

Run the SQL migration in `docs/migrations/add_terms_acceptance.sql` to add these columns to your database.

## Implementation Details

### 1. Terms Hash Constant

**File:** `src/lib/constants/legal.ts`

Contains the SHA-256 hash of the current Terms of Use text:
- Hash: `845940b69e9cac676933443da5612d8e2dc0d45228aec11dbad75455b327611d`
- Generated from: `app/(info)/terms.tsx`
- Algorithm: SHA-256

**Important:** When Terms of Use are updated, generate a new hash and update this constant.

### 2. Signup Flow

**File:** `src/lib/supabase/auth.ts`

The `signUp()` function now:
1. Creates the user account
2. Creates the business
3. Saves terms acceptance to the profile table (non-blocking)

The terms acceptance is only saved if:
- User successfully signed up
- User checked the "I agree to Terms and Privacy Policy" checkbox (validated in UI)

### 3. Helper Functions

**File:** `src/lib/legal.ts`

Provides two helper functions:

- `getUserTermsAcceptance(userId)` - Query a user's terms acceptance record
- `updateUserTermsAcceptance(userId, acceptedAt, termsHash)` - Update a user's terms acceptance

These can be used from admin panels or scripts for auditing/legal purposes.

## Usage

### Querying Terms Acceptance

```typescript
import { getUserTermsAcceptance } from '@/lib/legal';

const { data, error } = await getUserTermsAcceptance(userId);
if (data) {
  console.log('Accepted at:', data.accepted_terms_at);
  console.log('Terms hash:', data.terms_hash);
}
```

### Updating Terms Hash

When Terms of Use are updated:

1. Extract the new Terms of Use text from `app/(info)/terms.tsx`
2. Compute SHA-256 hash (use `scripts/compute-terms-hash.js`)
3. Update `TERMS_HASH` constant in `src/lib/constants/legal.ts`
4. New signups will use the new hash automatically

## Notes

- Terms acceptance saving is **non-blocking** - if it fails, signup still succeeds
- Existing users without `terms_hash` are not blocked from login
- The system only tracks new signups going forward
- Future re-acceptance flows can use `updateUserTermsAcceptance()`

## Legal Compliance

This implementation provides:
- Cryptographic proof of which terms version was accepted
- Timestamp of acceptance
- Queryable records for legal/audit purposes

