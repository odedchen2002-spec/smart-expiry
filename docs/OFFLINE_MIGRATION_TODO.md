# Offline Architecture Migration TODO

## Status: In Progress

### ✅ Completed

1. **Core Outbox Pattern**
   - ✅ OutboxStorage with AsyncStorage persistence
   - ✅ OutboxProcessor with FIFO processing
   - ✅ Write hooks (useCreateItem, useUpdateItem, useDeleteItem)
   - ✅ Idempotency for creates
   - ✅ Retry logic with exponential backoff
   - ✅ Full refetch after successful batch

2. **TanStack Query Integration**
   - ✅ Persisted cache (7-day retention)
   - ✅ Mobile-optimized defaults (no refetchOnFocus)
   - ✅ OnlineManager integration
   - ✅ Network detection with polling

3. **Reconciliation Guards**
   - ✅ Cancel queries before reconciliation (race prevention)
   - ✅ Deduplicate IDs during reconciliation
   - ✅ Supabase data always wins
   - ✅ Remove resolved items from expired scope

4. **UI Components**
   - ✅ OutboxSyncBanner (shows sync status)
   - ✅ useOutboxStats hook (real-time monitoring)
   - ✅ Translations (sync.* keys in he/en)

5. **Safety Mechanisms**
   - ✅ Network check before processing
   - ✅ Graceful handling of deleted items
   - ✅ RLS error detection
   - ✅ Undo support (5-second window)

### 🚧 Pending Migration

#### HIGH PRIORITY: app/add.tsx

**Current State:**
- Still uses legacy `offlineQueue.ts` directly
- Has custom `saveToOfflineQueue()` function
- Also uses `itemsCache` for local storage
- Mixed pattern (outbox not used)

**Target State:**
- Use `useCreateItem` hook from `src/hooks/writes/useCreateItem.ts`
- Remove direct offlineQueue imports
- Remove itemsCache usage (TanStack Query handles caching)
- Simplify code significantly

**Migration Steps:**

1. Replace imports:
   ```typescript
   // REMOVE
   import { addToOfflineQueue } from '@/lib/offline/offlineQueue';
   import { addItemToCache, loadItemsFromCache } from '@/lib/storage/itemsCache';
   
   // ADD
   import { useCreateItem } from '@/hooks/writes/useCreateItem';
   ```

2. Replace `saveToOfflineQueue()` function:
   ```typescript
   // OLD (lines 31-75)
   async function saveToOfflineQueue(saveData, t) { ... }
   
   // NEW
   const { createItem } = useCreateItem(activeOwnerId, 'all');
   
   // Call createItem directly with proper data structure
   await createItem({
     owner_id: activeOwnerId,
     product_id: productId, // Must resolve first
     expiry_date: dbDate,
     location_id: locationId, // Must resolve first
     barcode_snapshot: barcode || null,
     note: null,
   });
   ```

3. Handle product/location resolution:
   - Keep existing product resolution logic
   - Keep existing location resolution logic
   - Only change the final item creation

4. Remove offline queue notifications:
   - `itemEvents.emit()` still works (outbox handles it)
   - Remove `AsyncStorage.setItem('offline_save_success')` (redundant)

5. Test thoroughly:
   - Online save
   - Offline save
   - Save with new product
   - Save with existing product
   - Save with barcode
   - Save without barcode

**Blocked by:**
- Complexity: add.tsx is 1600+ lines
- Risk: High-traffic screen, critical user flow
- Recommendation: Thorough testing in staging first

**Workaround (Current):**
- Legacy offlineQueue.ts left in place for add.tsx only
- Coexists with outbox pattern
- Not ideal but safe for production

---

#### MEDIUM PRIORITY: app/ai-import.tsx

**Current State:**
- May use offlineQueue (needs verification)

**Migration:**
- TBD after add.tsx migration

---

#### LOW PRIORITY: src/components/OfflineBanner.tsx

**Current State:**
- May reference offlineQueue for counts

**Migration:**
- Replace with OutboxSyncBanner
- Use useOutboxStats instead

---

### 📋 Final Cleanup (After Migrations)

Once all screens migrated to outbox pattern:

1. **Delete legacy files:**
   ```
   src/lib/offline/offlineQueue.ts
   src/lib/storage/itemsCache.ts (if fully replaced by TanStack Query)
   ```

2. **Remove from _layout.tsx:**
   ```typescript
   // Already removed: initOfflineQueue()
   ```

3. **Update documentation:**
   - Remove references to offlineQueue in comments
   - Update architecture diagrams

4. **Verify AsyncStorage keys:**
   ```typescript
   // OLD (can be cleared after migration)
   'offline_queue'
   'pending_items'
   'offline_save_success'
   
   // NEW (keep)
   '@expiryx/outbox_entries_v1'
   'EXPIRY_X_QUERY_CACHE'
   ```

---

## Testing Checklist

After migration, verify:

- [ ] Create item online → appears immediately
- [ ] Create item offline → appears immediately, syncs when online
- [ ] Update item online → updates immediately
- [ ] Update item offline → updates immediately, syncs when online
- [ ] Delete item → soft-delete, undo works, hard delete after 5s
- [ ] Network disconnect during sync → operations requeue
- [ ] App crash during sync → operations persist in queue
- [ ] Duplicate operations (same item) → process sequentially
- [ ] Idempotency → retry of create doesn't duplicate
- [ ] Full refetch after sync → Supabase data matches cache
- [ ] OutboxSyncBanner shows correct status
- [ ] Pending count badge works
- [ ] Multiple offline operations → all sync in order

---

## Performance Considerations

### Cache Size:
- TanStack Query cache persisted to AsyncStorage
- GC after 24 hours (items not accessed)
- Full cache cleared after 7 days
- ~500 items with details = ~500KB
- Acceptable for mobile (AsyncStorage limit ~6MB)

### Outbox Size:
- Typical: 0-10 operations
- Worst case (extended offline): 100-200 operations
- Each entry ~500 bytes
- Max size estimate: 100KB
- Well within AsyncStorage limits

### Processing Performance:
- 3 concurrent entity groups
- Sequential within entity (prevents conflicts)
- Typical sync time: 100ms per operation
- 10 operations = ~1 second (imperceptible)

---

## References

- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [AsyncStorage Best Practices](https://react-native-async-storage.github.io/async-storage/)
