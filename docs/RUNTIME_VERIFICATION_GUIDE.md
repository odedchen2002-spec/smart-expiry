# Runtime Verification Guide

## Overview

This document explains how to verify the offline-first architecture guarantees at runtime using the built-in test components and manual testing procedures.

---

## 🧪 Dev-Only Test Plan Component

### Quick Start

Add to any dev screen (e.g., Settings):

```typescript
import { OutboxTestPlan } from '@/lib/outbox/__dev__/OutboxTestPlan';

// In your component:
{__DEV__ && <OutboxTestPlan />}
```

### What It Tests

#### Test 1: Offline Create → Optimistic UI + pending_sync
**Guarantee:** When creating an item while offline (or before sync), the item appears immediately in the UI with `_syncStatus: 'pending'`.

**What it checks:**
- Item added to cache with temp ID
- `_syncStatus` flag set to `'pending'`
- Outbox entry created
- Cache update is instant (non-blocking)

**Expected Result:** ✅ Pass
- Temp ID format: `temp_<timestamp>_<random>`
- Status: `pending`
- Outbox: +1 pending count

---

#### Test 2: Reconnect → Process Once → Full Refetch
**Guarantee:** When network returns, outbox processes pending operations once, then triggers full refetch from Supabase to ensure data consistency.

**What it checks:**
- Outbox processor runs (operations attempted)
- Query invalidation triggered
- Cache refetched from Supabase (<5s ago)
- Server data replaces optimistic data

**Expected Result:** ✅ Pass
- Processed: X succeeded, 0 failed
- Refetch: <2000ms ago
- Pending count: 0

**Note:** This test requires network connectivity. If offline, it will fail with "No operations processed (might be offline)".

---

#### Test 3: Temp ID → Real ID Replacement
**Guarantee:** After successful sync, all temp IDs are replaced with real UUIDs from Supabase.

**What it checks:**
- No items with `id.startsWith('temp_')` in cache
- Synced items have `_localItemKey` for tracking
- Mapping from localItemKey → realId exists

**Expected Result:** ✅ Pass
- 0 temp IDs in cache
- X items have localItemKey mapping

**Troubleshooting:**
- If temp IDs remain: sync failed or not yet processed
- Run Test 2 first to trigger processing

---

#### Test 4: No Race Conditions (cancelQueries)
**Guarantee:** Concurrent Supabase fetches cannot overwrite optimistic updates during reconciliation.

**What it checks:**
- No duplicate IDs in cache
- Code review: `cancelQueries()` called before reconciliation
- Deduplication logic present

**Expected Result:** ✅ Pass
- No duplicates in cache
- cancelQueries verified in code

**Code verification:**
```typescript
// OutboxProcessor.reconcileCreate/Update/Delete:
await this.queryClient.cancelQueries({ queryKey });
this.queryClient.setQueryData(queryKey, ...);
```

---

#### Test 5: Idempotency (No Duplicates)
**Guarantee:** Retrying a failed create operation does not create duplicate items.

**What it checks:**
- All `clientRequestId` values are unique in outbox
- Database constraint enforced (code review)
- Retry returns existing item on conflict

**Expected Result:** ✅ Pass
- All clientRequestIds unique
- Database constraint: `client_request_id` UNIQUE

**Code verification:**
```typescript
// itemsApi.createItem:
if (error.code === '23505' && error.message.includes('client_request_id')) {
  // Return existing item instead of failing
}
```

---

### Running Tests

**Option 1: Run All (Recommended)**
```
Tap "Run All Tests"
Wait ~5 seconds
Review results
```

**Option 2: Individual Tests**
```
Tap "Test 1: Offline Create"
Tap "Test 2: Reconnect Process" (requires network)
Tap "Test 3: Temp ID Replacement"
Tap "Test 4: Race Conditions"
Tap "Test 5: Idempotency"
```

**Reset Tests:**
```
Tap "Reset" to clear results
```

---

## 🔧 Manual Testing Procedures

### Test Scenario 1: Create Item Offline

**Steps:**
1. Turn on Airplane Mode
2. Navigate to Add Item screen
3. Create a new item
4. Observe immediate UI update
5. Check Outbox: 1 pending operation
6. Turn off Airplane Mode
7. Wait 2-3 seconds
8. Item syncs automatically
9. Check Outbox: 0 pending operations

**Expected Behavior:**
- Step 3-4: Item appears instantly (optimistic)
- Step 5: OutboxSyncBanner shows "1 operations pending"
- Step 7-8: Banner shows "Syncing 1 operations..."
- Step 9: Banner disappears, item has real ID

**Verification:**
```typescript
// Before sync (step 5):
const item = items.find(i => i.barcode === 'TEST123');
console.log(item.id); // temp_1234567890_abc
console.log(item._syncStatus); // 'pending'

// After sync (step 9):
console.log(item.id); // e.g., "a1b2c3d4-..."
console.log(item._syncStatus); // 'synced' or undefined
```

---

### Test Scenario 2: Update Item Offline

**Steps:**
1. Mark item as "resolved" (update operation)
2. Turn on Airplane Mode immediately
3. Mark another item as "resolved"
4. Check Outbox: 1 pending (first one synced, second queued)
5. Turn off Airplane Mode
6. Both updates sync
7. Items disappear from expired list (correct behavior)

**Expected Behavior:**
- Optimistic removal from UI (instant)
- Undo button appears for 5 seconds
- After undo window: operation queued
- On reconnect: sync to Supabase
- Full refetch: expired list correct

---

### Test Scenario 3: Delete with Undo

**Steps:**
1. Delete an item (swipe left → delete)
2. Item shows "Deleting" badge
3. Tap "Undo" within 5 seconds
4. Item restored
5. Delete again, wait 5 seconds
6. Item removed from UI
7. Check Outbox: 1 pending delete
8. Network reconnect: delete syncs

**Expected Behavior:**
- Step 2: Soft-delete (item still visible)
- Step 3-4: Removed from outbox, badge cleared
- Step 5-6: Hard-delete (removed from cache)
- Step 7-8: Supabase delete executes

---

### Test Scenario 4: Race Condition Prevention

**Steps:**
1. Create item offline (temp ID)
2. Network flaky (on/off repeatedly)
3. Multiple sync attempts
4. Check cache for duplicates
5. Verify only one item exists

**Expected Behavior:**
- Deduplication during reconciliation
- `cancelQueries()` prevents overwrites
- Final state: one item, real ID

**Code guarantees:**
```typescript
// Before reconciliation:
await this.queryClient.cancelQueries({ queryKey });

// During reconciliation:
const seenIds = new Set();
const deduplicated = items.filter(item => {
  if (seenIds.has(item.id)) return false;
  seenIds.add(item.id);
  return true;
});
```

---

### Test Scenario 5: Idempotency

**Steps:**
1. Create item offline
2. App crashes during first sync attempt
3. App restarts
4. Outbox retries (same clientRequestId)
5. Database returns existing item (no duplicate)

**Expected Behavior:**
- First attempt: creates item in DB
- Retry: `23505` unique constraint violation
- API returns existing item instead of error
- Cache updated with real ID
- No duplicate in database

**Database verification:**
```sql
SELECT client_request_id, COUNT(*)
FROM items
GROUP BY client_request_id
HAVING COUNT(*) > 1;
-- Result: 0 rows (no duplicates)
```

---

## 💀 Dead-Letter Queue Management

### What is Dead-Letter?

Operations that fail after **5 retry attempts** are moved to "dead-letter" state:
- Status: `'failed'`
- No longer processed automatically
- Require manual intervention

### Accessing Failed Operations

**Option 1: Programmatic**
```typescript
import { outboxStorage } from '@/lib/outbox/outboxStorage';

// Get failed operations
const failed = await outboxStorage.getFailed();
console.log(`${failed.length} failed operations`);

// Retry one
await outboxStorage.retryFailed(entryId);
await triggerOutboxProcessing();

// Discard one
await outboxStorage.discardFailed(entryId);
```

**Option 2: UI Component**
```typescript
import { DeadLetterManager } from '@/components/sync/DeadLetterManager';

// In a modal or settings screen:
<DeadLetterManager onClose={() => setVisible(false)} />
```

### Manual Testing

**Simulate Permanent Failure:**
1. Turn off network
2. Create 10 items offline
3. In code, force 5 failed attempts:
   ```typescript
   // Temporarily break API:
   export async function createItem() {
     throw new Error('Simulated failure');
   }
   ```
4. Turn on network
5. Outbox processes, all fail
6. Check `OutboxStats`: `failedCount: 10`
7. Open `DeadLetterManager`
8. See 10 failed operations
9. Tap "Retry All" or individual retry
10. Operations requeue with reset attempts

**Expected Behavior:**
- After 5 attempts: status → `'failed'`
- No longer auto-processed
- UI shows red chip "Failed"
- DeadLetterManager lists all failed ops
- Retry: resets status to `'pending'`, attempts to 0
- Discard: removes from outbox permanently

---

## 🔄 Schema Versioning

### What is Schema Versioning?

Each outbox entry includes `schemaVersion: number` to prevent crashes from incompatible persisted data.

**Current Version:** `1` (see `OUTBOX_SCHEMA_VERSION` in `outboxTypes.ts`)

### When to Increment

Increment `OUTBOX_SCHEMA_VERSION` when:
- Adding/removing required fields from `OutboxEntry`
- Changing payload structure
- Modifying processing logic incompatibly

**Example:**
```typescript
// outboxTypes.ts
export const OUTBOX_SCHEMA_VERSION = 2; // Was: 1

// New field added:
export interface OutboxEntry {
  schemaVersion: number;
  id: string;
  // ... existing fields
  newRequiredField: string; // NEW
}
```

### Migration Strategy

**On Version Mismatch:**
1. Detect: stored version ≠ current version
2. Log warning
3. **Clear outbox** (safe - operations can be retried)
4. Update stored version

**Why Clear?**
- Simplest strategy for mobile apps
- Outbox is transient (operations can be retried from UI)
- Prevents crashes from incompatible data structures

**Alternative (Future):**
Implement migration logic per version:
```typescript
if (storedVersion === 1 && currentVersion === 2) {
  // Migrate v1 → v2
  entries = entries.map(entry => ({
    ...entry,
    newRequiredField: 'default_value',
  }));
}
```

### Testing Schema Migration

**Simulate Version Mismatch:**
1. Create items offline (outbox entries created)
2. In code, increment `OUTBOX_SCHEMA_VERSION` to 2
3. Restart app
4. Check console logs:
   ```
   [OutboxStorage] Schema version mismatch: stored=1, current=2
   [OutboxStorage] Clearing old outbox data due to schema change
   ```
5. Verify outbox cleared: `pendingCount: 0`

**Expected Behavior:**
- Old entries incompatible → cleared
- New entries use version 2
- No crashes
- User can re-create operations

---

## 📊 Monitoring in Production

### OutboxStats Hook

Real-time monitoring:
```typescript
import { useOutboxStats } from '@/lib/outbox/useOutboxStats';

const {
  pendingCount,    // Operations waiting to sync
  processingCount, // Currently syncing
  failedCount,     // Permanently failed
  pausedCount,     // Paused (4xx errors)
  totalCount,      // Total operations
  hasPending,      // Boolean: any pending?
  isProcessing,    // Boolean: actively syncing?
  refresh,         // Manual refresh function
} = useOutboxStats();
```

### OutboxSyncBanner

Visual indicator:
```typescript
import { OutboxSyncBanner } from '@/components/sync/OutboxSyncBanner';

// In your layout or tab screen:
<OutboxSyncBanner />
```

**Behavior:**
- Shows "Syncing X operations..." when processing
- Shows "X operations pending" when offline
- Auto-hides when queue empty
- Polling: updates every 2 seconds

### Console Logs

**Key patterns:**
```
[OutboxStorage] Enqueued entry: <id> <type>
[Outbox] Processing 3 entities
[Outbox] Create reconciled { tempId: 'temp_...', realId: 'a1b2c3...' }
[Outbox] Process complete: { processed: 3, succeeded: 3, failed: 0 }
[Outbox] Triggering full refetch after 3 successful operations
```

**Error patterns:**
```
[Outbox] Offline - skipping processing
[Outbox] Entry failed permanently { entry: {...}, error: '...' }
[OutboxStorage] Schema version mismatch: stored=1, current=2
```

---

## 🎯 Checklist: All Guarantees Verified

Use this checklist before production release:

- [ ] **Offline create** → optimistic UI + `_syncStatus: 'pending'`
- [ ] **Reconnect** → outbox processes once → full refetch triggered
- [ ] **Temp ID replacement** → all `temp_*` IDs become real UUIDs
- [ ] **No race conditions** → `cancelQueries()` prevents overwrites
- [ ] **Idempotency** → retries don't create duplicates
- [ ] **Full refetch** → Supabase data replaces cache after sync
- [ ] **Dead-letter** → failed ops can be retried/discarded
- [ ] **Schema versioning** → version mismatches handled gracefully
- [ ] **Deduplication** → no duplicate IDs in cache
- [ ] **Undo support** → 5-second window for delete/resolve

---

## 🚨 Troubleshooting

### Issue: Temp IDs not replaced

**Symptoms:**
- Items still have `temp_*` IDs after sync
- `_syncStatus: 'pending'` not clearing

**Diagnosis:**
```typescript
const stats = await outboxStorage.getStats();
console.log('Pending:', stats.pendingCount);
console.log('Failed:', stats.failedCount);

const pending = await outboxStorage.getPending();
console.log('Pending ops:', pending);
```

**Solutions:**
1. Check network: might be offline
2. Check failed count: operations might have failed
3. Manually trigger processing: `triggerOutboxProcessing()`
4. Check console for errors

---

### Issue: Duplicate items in cache

**Symptoms:**
- Same item appears multiple times
- List rendering duplicates

**Diagnosis:**
```typescript
const items = queryClient.getQueryData(['items', ownerId, 'all']);
const ids = items.map(i => i.id);
const uniqueIds = new Set(ids);
console.log('Total:', ids.length, 'Unique:', uniqueIds.size);
```

**Solutions:**
- Should not happen (deduplication built-in)
- If occurs: check reconciliation logic
- Workaround: call `rebuildMapping(ownerId)`

---

### Issue: Operations stuck in pending

**Symptoms:**
- Pending count > 0 for >1 minute
- No processing happening

**Diagnosis:**
```typescript
const pending = await outboxStorage.getPending();
console.log('Oldest pending:', pending[0]);
console.log('Attempts:', pending[0].attempts);
console.log('Last error:', pending[0].lastError);
```

**Solutions:**
1. Check network: `checkNetworkStatus()`
2. Check attempts: if >5, should be failed
3. Check last error: might be RLS or 4xx
4. Manual processing: `triggerOutboxProcessing()`

---

### Issue: Schema version mismatch

**Symptoms:**
- Console warning: "Schema version mismatch"
- Outbox cleared on app start

**This is expected behavior:**
- Occurs after app upgrade with `OUTBOX_SCHEMA_VERSION` change
- Old entries automatically cleared
- Users can re-create operations from UI

**Not an error:** This is the migration strategy (clear on breaking changes).

---

## 📚 Related Documentation

- [OFFLINE_FIRST_ARCHITECTURE.md](./OFFLINE_FIRST_ARCHITECTURE.md) - Full architecture guide
- [OFFLINE_MIGRATION_TODO.md](./OFFLINE_MIGRATION_TODO.md) - Migration plan for legacy code

---

## 🎓 Summary

This runtime verification system ensures:
1. ✅ **Instant UI** - Optimistic updates work
2. ✅ **Data integrity** - Supabase as source of truth
3. ✅ **Conflict prevention** - Race guards in place
4. ✅ **Retry logic** - Failed ops handled gracefully
5. ✅ **Schema safety** - Version mismatches caught
6. ✅ **Idempotency** - No duplicates on retry
7. ✅ **Full reconciliation** - Refetch after sync

All guarantees are testable and verifiable at runtime using the provided tools.
