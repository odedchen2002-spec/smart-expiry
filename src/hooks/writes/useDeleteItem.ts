/**
 * useDeleteItem - Custom write hook for deleting items
 * 
 * Features:
 * - Soft-delete (mark as deleting, keep visible)
 * - Undo support (5-second window)
 * - Enqueues to Outbox
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { useOutbox } from '@/lib/outbox/useOutbox';
import { triggerOutboxProcessing } from '@/providers/QueryProvider';
import { itemsKeys, type ItemsScope } from '@/hooks/queries/useItemsQuery';
import type { ItemWithDetails } from '@/lib/supabase/queries/items';

interface UndoState {
  itemId: string;
  outboxId: string;
  timerRef: NodeJS.Timeout | null;
}

interface DeleteItemResult {
  itemId: string;
  canUndo: true;
}

/**
 * Hook for deleting items (soft-delete with undo)
 */
export function useDeleteItem(ownerId: string, scope: ItemsScope = 'all') {
  const queryClient = useQueryClient();
  const outbox = useOutbox();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  /**
   * Delete item (soft-delete with undo window)
   */
  const deleteItem = useCallback(
    async (itemId: string): Promise<DeleteItemResult> => {
      setIsPending(true);
      setError(null);

      try {
        // 1. Cancel queries
        await queryClient.cancelQueries({ queryKey: itemsKeys.byOwner(ownerId) });

        // 2. Find item in cache
        const queryKey = itemsKeys.byScope(ownerId, scope);
        const items = queryClient.getQueryData<ItemWithDetails[]>(queryKey) || [];
        const deletedItem = items.find((i) => i.id === itemId);

        if (!deletedItem) {
          throw new Error(`Item not found in cache: ${itemId}`);
        }

        // 3. Soft-delete: mark as deleting (keep visible with badge)
        queryClient.setQueryData<ItemWithDetails[]>(queryKey, (old = []) =>
          old.map((item) =>
            item.id === itemId
              ? { ...item, _syncStatus: 'deleting', _deleted: true }
              : item
          )
        );

        // 4. Determine entityKey
        const entityKey = (deletedItem as any)._localItemKey || itemId;

        // 5. Enqueue to Outbox (await)
        const outboxId = uuid();
        await outbox.enqueue({
          id: outboxId,
          type: 'deleteItem',
          payload: { itemId },
          localItemKey: (deletedItem as any)._localItemKey,
          clientRequestId: undefined,
          tempId: undefined,
          entityKey,
          ownerId,
          scope,
          createdAt: Date.now(),
          attempts: 0,
          lastAttemptAt: null,
          lastError: null,
          status: 'pending',
        });

        // 6. Setup undo timer (5 seconds)
        const timerRef = setTimeout(() => {
          // CRITICAL: Remove item from ALL caches immediately (before Outbox processing)
          // This prevents "no items" flash while Outbox is processing
          console.log('[useDeleteItem] Timer expired, removing item from cache:', itemId);
          const scopes: Array<'all' | 'expired'> = ['all', 'expired'];
          scopes.forEach((s) => {
            const queryKey = itemsKeys.byScope(ownerId, s);
            const oldItems = queryClient.getQueryData<ItemWithDetails[]>(queryKey) || [];
            console.log(`[useDeleteItem] Cache ${s} before remove:`, oldItems.length, 'items');
            
            queryClient.setQueryData<ItemWithDetails[]>(queryKey, (old = []) => {
              const filtered = old.filter((item) => item.id !== itemId);
              console.log(`[useDeleteItem] Cache ${s} after remove:`, filtered.length, 'items (removed:', old.length - filtered.length, ')');
              return filtered;
            });
          });
          
          setUndoState(null); // Clear undo state after 5s
          triggerOutboxProcessing().catch(console.error); // Start processing in background
        }, 5000) as any;

        setUndoState({ itemId, outboxId, timerRef });
        setIsPending(false);

        return { itemId, canUndo: true };
      } catch (err) {
        const error = err as Error;
        setError(error);
        setIsPending(false);
        throw error;
      }
    },
    [ownerId, scope, queryClient, outbox]
  );

  /**
   * Undo delete (within 5-second window)
   */
  const undoDelete = useCallback(async () => {
    if (!undoState) return;

    const { itemId, outboxId, timerRef } = undoState;

    try {
      // 1. Clear timer
      if (timerRef) clearTimeout(timerRef);

      // 2. Remove from Outbox
      await outbox.remove(outboxId);

      // 3. Restore item in cache (remove _deleted flag)
      const queryKey = itemsKeys.byScope(ownerId, scope);
      queryClient.setQueryData<ItemWithDetails[]>(queryKey, (old = []) =>
        old.map((item) =>
          item.id === itemId
            ? { ...item, _syncStatus: 'synced', _deleted: false }
            : item
        )
      );

      // 4. Clear undo state
      setUndoState(null);

      console.log('[useDeleteItem] Undo successful:', itemId);
    } catch (err) {
      console.error('[useDeleteItem] Undo failed:', err);
      setError(err as Error);
    }
  }, [undoState, ownerId, scope, queryClient, outbox]);

  return {
    deleteItem,
    undoDelete,
    canUndo: !!undoState,
    isPending,
    error,
  };
}
