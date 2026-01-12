# TanStack Query Migration - Implementation Progress Report

## ✅ COMPLETED (Phase 1-3)

### Phase 1: Infrastructure ✓
1. **DB Migration** - `supabase/migrations/20260111000000_add_client_request_id.sql`
   - Added `client_request_id UUID` column to `items` table
   - Created UNIQUE constraint on `(owner_id, client_request_id)`
   - No RLS changes needed (existing policies allow field)

2. **Dependencies** - Updated `package.json`
   - @tanstack/react-query ^5.62.8
   - @tanstack/react-query-persist-client ^5.62.8
   - react-native-mmkv ^3.1.0
   - uuid ^11.0.3
   - @react-native-community/netinfo ^11.4.1

3. **Outbox System** (MMKV-based)
   - `src/lib/outbox/outboxTypes.ts` - Type definitions
   - `src/lib/outbox/outboxStorage.ts` - Durable MMKV storage with verification
   - `src/lib/outbox/OutboxProcessor.ts` - DI-based processor with sequencing
   - `src/lib/outbox/useOutbox.ts` - React hook for outbox access

4. **API Layer** - `src/data/itemsApi.ts`
   - `createItem(data, clientRequestId)` with idempotency (INSERT + SELECT fallback)
   - `updateItem(id, updates)`
   - `deleteItem(id)`
   - `bulkCreateItems(...)` for future use

5. **QueryClient Setup** - `src/providers/QueryProvider.tsx`
   - QueryClient with RN-optimized defaults (no focus refetch)
   - Persisted cache to AsyncStorage (7-day retention)
   - OutboxProcessor integration with network/app state listeners
   - Auto-processing on reconnect and app foreground

6. **App Integration** - `app/_layout.tsx`
   - Added QueryProvider to root (after LanguageProvider, before CacheProvider)

### Phase 2: Query Hooks ✓
- `src/hooks/queries/useItemsQuery.ts`
  - `useItemsQuery(ownerId, scope)` - Main items query hook
  - `useItemQuery(ownerId, itemId)` - Single item detail
  - Cache keys: `['items', ownerId, scope]`
  - 5min stale time, 24h gc time
  - `placeholderData` for smooth refetching

### Phase 3: Write Hooks (Outbox-Only) ✓
1. **`src/hooks/writes/useCreateItem.ts`**
   - Generates `localItemKey`, `clientRequestId`, `tempId`
   - Optimistic cache update with temp item
   - Enqueues to Outbox (await for durability)
   - Returns immediately (no network wait)

2. **`src/hooks/writes/useUpdateItem.ts`**
   - Optimistic update in cache
   - Determines `entityKey` from `_localItemKey` or itemId
   - Enqueues to Outbox with sequencing

3. **`src/hooks/writes/useDeleteItem.ts`**
   - Soft-delete (mark `_deleted: true`, keep visible)
   - 5-second undo window
   - `undoDelete()` removes Outbox entry + restores item
   - Enqueues with entityKey for sequencing

---

## 🚧 PARTIALLY COMPLETED (Phase 4)

### app/(tabs)/all.tsx - Migration Started
**Changes Made:**
- ✅ Replaced `useItems` import with `useItemsQuery`
- ✅ Replaced `deleteItem, resolveItem, updateItem` imports with write hooks
- ✅ Added Snackbar to imports
- ✅ Updated component state to use `useItemsQuery` result
- ✅ Initialized write hooks: `useDeleteItem`, `useUpdateItem`
- ✅ Removed `useFocusEffect` refetch logic (no longer needed)
- ✅ Kept `itemEvents.subscribe` for backward compatibility during migration

**Changes Still Needed:**
1. **Update `handleDelete` function** (line 289-321)
   - Remove `optimisticRemove` call
   - Use `deleteItem(item.id)` from hook
   - Add undo button in snackbar: `canUndoDelete ? <Button onPress={undoDelete}>Undo</Button> : null`

2. **Update `handleSoldFinished` function** (line 230-286)
   - Remove `optimisticRemove` and `rollback()` calls
   - Replace direct `resolveItem()` call with `updateItem({ itemId: item.id, updates: { status: 'resolved', resolved_reason: 'sold' } })`
   - Remove `itemEvents.emit()` call (Outbox processor handles invalidation)

3. **Update Snackbar component** (line 670+)
   - Add undo button for delete: show if `canUndoDelete`
   - Call `undoDelete()` on undo press

4. **Remove unused imports/code:**
   - Remove `optimisticRemove` from destructuring
   - Remove unused `lastAction` state (if only used for delete - check sold/finished undo)

---

## ❌ NOT STARTED (Phase 5+)

### Other Screens to Migrate
- `app/(tabs)/expired.tsx`
- `app/(tabs)/home.tsx` (use `useHomeStatsQuery`)
- `app/add.tsx` (replace fire-and-forget IIFE with `useCreateItem`)
- `app/ai-import.tsx` (use bulk create)
- `app/supplier-intake.tsx`
- `app/fast-scan.tsx`

### Cleanup (After All Screens Migrated)
- Remove `src/lib/events/itemEvents.ts`
- Remove `src/lib/offline/offlineQueue.ts`
- Remove manual cache code from `src/lib/hooks/useItems.ts`
- Remove `src/context/CacheContext.tsx` (redundant with TanStack Query)

---

## 🐛 KNOWN ISSUES / TODO

### Linter Errors (Not Yet Checked)
- Run `read_lints` on all new files
- Fix any TypeScript errors
- Ensure imports are correct

### Testing Required
1. **Compile Test**: `npm run ios` or `npm run android`
2. **Offline Create**: Create item offline, go online, verify sync
3. **Delete Undo**: Delete item, press undo within 5s, verify restored
4. **Idempotency**: Force timeout during create, retry, verify no duplicate
5. **Sequencing**: Create item offline, immediately edit, verify order
6. **Persisted Cache**: Close app, reopen, verify instant render from cache

### Missing Pieces
1. **Soft-delete UI**: Need to style items with `_deleted: true` (dim, show badge)
2. **Snackbar with Undo**: Need to add undo button to snackbar component
3. **Error Handling**: Show toasts for Outbox errors (4xx paused, max retries failed)
4. **Outbox Status UI**: Show "X items syncing..." in header or banner

---

## 📋 NEXT STEPS (Priority Order)

1. **Complete all.tsx Migration**
   - Finish updating `handleDelete` and `handleSoldFinished`
   - Update snackbar with undo button
   - Test delete + undo flow

2. **Fix Linter Errors**
   - Run `read_lints` on all new files
   - Fix TypeScript errors
   - Ensure app compiles

3. **Test Basic Functionality**
   - Items load from cache instantly
   - Delete shows "deleting" state
   - Undo works
   - Reconnect triggers sync

4. **Document**
   - Update README with migration status
   - Document remaining work for other screens
   - Note breaking changes (if any)

---

## 📝 FILES CHANGED

### New Files (15)
1. `supabase/migrations/20260111000000_add_client_request_id.sql`
2. `src/lib/outbox/outboxTypes.ts`
3. `src/lib/outbox/outboxStorage.ts`
4. `src/lib/outbox/OutboxProcessor.ts`
5. `src/lib/outbox/useOutbox.ts`
6. `src/data/itemsApi.ts`
7. `src/providers/QueryProvider.tsx`
8. `src/hooks/queries/useItemsQuery.ts`
9. `src/hooks/writes/useCreateItem.ts`
10. `src/hooks/writes/useUpdateItem.ts`
11. `src/hooks/writes/useDeleteItem.ts`

### Modified Files (3)
1. `package.json` - Added dependencies
2. `app/_layout.tsx` - Added QueryProvider
3. `app/(tabs)/all.tsx` - Partially migrated (in progress)

### Unchanged (Legacy, Keep for Now)
- `src/lib/hooks/useItems.ts` - Keep for other screens
- `src/lib/events/itemEvents.ts` - Keep during migration
- `src/lib/offline/offlineQueue.ts` - Keep until Outbox proven

---

## ⚠️ IMPORTANT NOTES

1. **DO NOT delete legacy systems yet** - Other screens still use them
2. **itemEvents kept** - Used as adapter during gradual migration
3. **CacheContext kept** - Other hooks (useHomeStats) still use it
4. **Compile status**: **NOT TESTED YET** - Likely has linter errors
5. **Manual testing**: **NOT DONE** - Need to verify Outbox, undo, etc.

---

## 🎯 SUCCESS CRITERIA (all.tsx)

- [ ] App compiles without errors
- [ ] Items list renders instantly from persisted cache
- [ ] Delete marks item as "deleting" (dimmed, badge)
- [ ] Undo button appears in snackbar for 5 seconds
- [ ] Undo restores item immediately
- [ ] Offline delete stays visible until sync
- [ ] Reconnect triggers Outbox processing
- [ ] No `useFocusEffect` refetch (only pull-to-refresh)
- [ ] Code reduced by ~50 lines (removed manual cache logic)

---

**Report Generated**: 2026-01-11
**Status**: Foundation Complete, First Screen 80% Migrated
**Next**: Finish all.tsx + Fix Linter Errors
