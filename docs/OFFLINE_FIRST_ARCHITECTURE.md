# Offline-First Architecture

## Overview

This app implements a production-grade offline-first architecture using:
- **Supabase (PostgreSQL)** as the single source of truth
- **TanStack Query** for caching and data synchronization
- **Outbox Pattern** for reliable offline writes

## Core Principles

### 1. Supabase is the Source of Truth
- All data ultimately lives in Supabase
- Cache is only a performance + UX layer
- After any sync operation, Supabase data wins

### 2. Three-Layer Architecture

```
┌─────────────────────────────────────────┐
│  UI Components (React Native)           │
│  - Instant renders from cache           │
│  - Optimistic updates for writes        │
└─────────────────────────────────────────┘
                  ↕
┌─────────────────────────────────────────┐
│  TanStack Query (Cache Layer)           │
│  - Persisted to AsyncStorage            │
│  - 5min stale time, 24h GC time         │
│  - No refetchOnFocus (mobile optimized) │
└─────────────────────────────────────────┘
                  ↕
┌─────────────────────────────────────────┐
│  Outbox Pattern (Offline Writes)        │
│  - Persistent queue in AsyncStorage     │
│  - FIFO processing with retries         │
│  - Idempotency keys for creates         │
└─────────────────────────────────────────┘
                  ↕
┌─────────────────────────────────────────┐
│  Supabase (PostgreSQL + RLS)            │
│  - Source of truth                      │
│  - Row Level Security                   │
└─────────────────────────────────────────┘
```

## Behavior by Network State

### ONLINE Mode

#### Reads:
1. Check cache first (instant render)
2. If stale (>5 min), fetch from Supabase in background
3. Update cache with server data
4. React rerenders with fresh data

#### Writes (Create/Update/Delete):
1. **Optimistic Update**: Apply change to cache immediately
2. **Enqueue to Outbox**: Durable write to AsyncStorage
3. **Return**: UI updated instantly (non-blocking)
4. **Background Processing**: 
   - Outbox processor sends mutation to Supabase
   - On success: reconcile cache with server response
   - On failure: retry with exponential backoff (max 5 attempts)

### OFFLINE Mode

#### Reads:
- Serve from cache only
- No network requests
- Show offline banner if important

#### Writes:
1. **Optimistic Update**: Apply to cache (instant feedback)
2. **Enqueue to Outbox**: Store operation persistently
3. **Mark as Pending**: Item shows "_syncStatus: pending" badge
4. **Wait**: Operations stay in queue until network returns

### RECONNECT Flow

1. **Network Detection**:
   - Polling-based check every 30 seconds
   - AppState listener (when app becomes active)
   - TanStack Query's onlineManager integration

2. **Outbox Processing**:
   - Check network status first (skip if offline)
   - Process all pending operations in FIFO order
   - Sequential processing per entity (prevents conflicts)
   - Parallel processing across entities (max 3 concurrent)

3. **Reconciliation**:
   - Replace optimistic data with server response
   - Map temp IDs → real IDs
   - Remove _syncStatus flags
   - **Full refetch** from Supabase after successful batch

4. **Conflict Resolution**:
   - Supabase always wins
   - Cancel ongoing queries before reconciliation
   - Deduplicate IDs during reconciliation

## Key Components

### 1. OutboxStorage (`src/lib/outbox/outboxStorage.ts`)

Persistent queue for offline operations:
- Stores operations in AsyncStorage
- FIFO ordering by `createdAt` timestamp
- Status tracking: `pending`, `processing`, `failed`, `paused`
- Retry counter with max 5 attempts

### 2. OutboxProcessor (`src/lib/outbox/OutboxProcessor.ts`)

Background processor:
- Processes outbox entries when online
- **Network check before processing** (doesn't waste retries)
- Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s)
- Idempotency for creates (clientRequestId)
- Two-phase updates (handles deleted items gracefully)
- **Full refetch after successful batch** (Supabase as source of truth)
- Entity-level sequencing (prevents same-item conflicts)

### 3. Write Hooks

#### useCreateItem
- Generates stable IDs: `tempId`, `localItemKey`, `clientRequestId`
- Optimistic: adds temp item to cache
- Durable: enqueues to outbox
- Non-blocking: returns immediately

#### useUpdateItem
- Optimistic: updates item in cache
- Undo support for "resolved" status (5-second window)
- Enqueues to outbox
- Triggers processing in background

#### useDeleteItem
- Soft-delete: marks item as `_deleted` (visible with badge)
- Undo support (5-second window)
- After timer: removes from cache + processes outbox
- Reconciliation removes from ALL scopes (all, expired, etc.)

### 4. Read Hooks

#### useItemsQuery
- TanStack Query-based
- Cache-first strategy
- `staleTime: 5min` - no unnecessary refetches
- `refetchOnReconnect: true` - syncs after network returns
- `refetchOnMount: false` - uses cache immediately
- Persisted cache (survives app restarts)

### 5. API Layer (`src/data/itemsApi.ts`)

Pure functions (no React dependencies):
- **createItem**: Idempotent with clientRequestId
  - Handles duplicate inserts gracefully
  - Returns existing item on conflict
  
- **updateItem**: Two-phase existence check
  - Returns null if item deleted (graceful)
  - Throws RLS error if update denied
  
- **deleteItem**: Simple delete

### 6. Network Detection (`src/lib/hooks/useNetworkStatus.ts`)

- Fetch-based check to Google's generate_204 endpoint
- Polling every 30 seconds
- AppState integration
- Exported `checkNetworkStatus()` for non-React code

### 7. Sync UI Components

#### OutboxSyncBanner (`src/components/sync/OutboxSyncBanner.tsx`)
- Shows "Syncing X operations..." when processing
- Shows "X operations pending" when offline
- Auto-hides when queue is empty

#### useOutboxStats (`src/lib/outbox/useOutboxStats.ts`)
- Real-time monitoring of outbox state
- Polls every 2 seconds for UI updates
- Returns pending/failed counts

## Data Flow Examples

### Example 1: Create Item Offline

```
User creates item → 
  ├─ optimistic update (instant UI)
  ├─ enqueue to outbox (durable)
  └─ return (non-blocking)

[Offline - operation stays in queue]

Network reconnects →
  ├─ outbox processor detects online
  ├─ sends create to Supabase
  ├─ replaces temp_123 with real UUID
  ├─ invalidates queries (full refetch)
  └─ UI shows synced badge
```

### Example 2: Update Item While Online

```
User updates item →
  ├─ cancel queries (prevent race)
  ├─ optimistic update cache
  ├─ enqueue to outbox
  └─ return immediately

Background processing →
  ├─ send update to Supabase
  ├─ cancel queries again
  ├─ reconcile with server response
  └─ Supabase data replaces cache
```

### Example 3: Delete with Undo

```
User deletes item →
  ├─ soft-delete (mark _deleted: true)
  ├─ enqueue to outbox
  ├─ start 5-second timer
  └─ show undo button

User clicks undo (within 5s) →
  ├─ clear timer
  ├─ remove from outbox
  └─ restore item (remove _deleted)

OR timer expires →
  ├─ remove from cache immediately
  ├─ process outbox
  ├─ delete from Supabase
  └─ reconcile (remove from ALL scopes)
```

## Safety Mechanisms

### 1. Idempotency
- Creates use unique `clientRequestId`
- Retries return existing item (no duplicates)
- Database has unique constraint on `client_request_id`

### 2. Optimistic Consistency
- Queries cancelled before reconciliation
- Deduplication during reconciliation
- Server data always wins

### 3. Retry Logic
- Exponential backoff: 1s → 2s → 4s → 8s → 16s
- Max 5 attempts per operation
- 4xx errors pause immediately (except 408/429)
- Failed operations marked as "failed" (not retried)

### 4. Entity Sequencing
- Operations on same item processed sequentially
- Prevents update/delete conflicts
- Uses `entityKey` (= `localItemKey` for items)

### 5. Graceful Degradation
- Updates on deleted items return null (graceful success)
- RLS errors detected and reported separately
- Undo support for user mistakes

## Configuration

### TanStack Query Settings

```typescript
// Global defaults (src/providers/QueryProvider.tsx)
{
  queries: {
    gcTime: 24 hours,
    staleTime: 5 minutes,
    refetchOnMount: false,     // Use cache first
    refetchOnReconnect: true,  // Sync when network returns
    refetchOnWindowFocus: false, // N/A in React Native
    networkMode: 'offlineFirst', // Cache first, then network
  },
  mutations: {
    retry: false,              // Outbox handles retries
    networkMode: 'online',     // Mutations require network
  }
}
```

### Cache Persistence

```typescript
// Persisted to AsyncStorage
key: 'EXPIRY_X_QUERY_CACHE'
maxAge: 7 days
throttleTime: 1 second
```

### Outbox Settings

```typescript
key: '@expiryx/outbox_entries_v1'
maxRetries: 5
backoffBase: 1 second
backoffMax: 30 seconds
concurrentEntities: 3
```

## Testing Offline Behavior

### Simulate Offline:
1. Turn on Airplane Mode
2. Create/update/delete items
3. Observe optimistic updates (instant)
4. Check AsyncStorage for queued operations
5. Turn off Airplane Mode
6. Observe automatic sync
7. Verify data matches Supabase

### Test Race Conditions:
1. Create item while network is flaky
2. App crashes during sync
3. Concurrent edits to same item
4. Rapid create/delete of same item

### Test Undo:
1. Delete item
2. Click undo within 5 seconds
3. Verify item restored
4. Check outbox is empty

## Monitoring & Debugging

### Outbox Stats:
```typescript
const { pendingCount, failedCount, isProcessing } = useOutboxStats();
```

### Console Logs:
- `[OutboxStorage]` - Queue operations
- `[Outbox]` - Processing, reconciliation
- `[QueryProvider]` - Network state changes
- `[itemsApi]` - Supabase mutations

### Cache Inspection:
```typescript
// In React DevTools or console
queryClient.getQueryData(['items', ownerId, 'all'])
```

### Outbox Inspection:
```typescript
// Check AsyncStorage
await AsyncStorage.getItem('@expiryx/outbox_entries_v1')
```

## Future Improvements

### Considered but not yet implemented:

1. **NetInfo Integration**
   - Real-time network event detection
   - Faster reconnect response
   - Currently: 30s polling + AppState

2. **Batch Operations**
   - Bulk create multiple items in one transaction
   - Reduces network round-trips
   - Currently: `bulkCreate` type exists but not used

3. **Conflict Detection**
   - Version numbers or timestamps
   - Detect server-side conflicts
   - Currently: Last-write-wins

4. **Migration of add.tsx**
   - Currently uses legacy `offlineQueue.ts` pattern
   - Should migrate to outbox pattern
   - Blocked by: complex screen logic

5. **Persistent _syncStatus**
   - Store pending flags in persisted cache metadata
   - Survives app crashes
   - Currently: In-memory only

## Known Limitations

1. **Legacy Code**: `app/add.tsx` still uses old `offlineQueue.ts`
   - Plan: Migrate to outbox pattern
   - Impact: Low (add screen handles offline gracefully)

2. **No Real-time Sync**: Changes on other devices not reflected immediately
   - Plan: Add Supabase Realtime subscriptions
   - Impact: Low (acceptable for expiry tracking use case)

3. **Network Detection Delay**: Up to 30 seconds to detect reconnect
   - Plan: Add NetInfo for instant detection
   - Impact: Low (outbox processes on app foreground anyway)

## Maintenance

### When to Invalidate Cache:
- After successful outbox batch (automatic)
- On manual pull-to-refresh (user-initiated)
- On app foreground (if >5min stale)

### When to Clear Outbox:
- NEVER clear automatically (data loss risk)
- Only on explicit user action (e.g., "Reset app")
- Or after permanent failures (e.g., RLS denials)

### When to Clear Cache:
- On user logout (security)
- After breaking schema changes (version bump)
- Or on app uninstall (automatic by OS)

## Conclusion

This architecture provides:
- ✅ **Instant UI feedback** (optimistic updates)
- ✅ **Offline resilience** (operations queued)
- ✅ **Data integrity** (Supabase as source of truth)
- ✅ **Retry logic** (exponential backoff)
- ✅ **Conflict prevention** (entity-level sequencing)
- ✅ **Undo support** (5-second window)
- ✅ **Full reconciliation** (refetch after sync)

The system is production-ready for the Smart Expiry use case.
