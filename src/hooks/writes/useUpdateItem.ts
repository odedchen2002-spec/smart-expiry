/**
 * useUpdateItem - Custom write hook for updating items
 * 
 * Updates cache optimistically, enqueues to Outbox, returns immediately
 * For 'resolved' status in 'expired' scope: supports undo (like delete)
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useOutbox } from '@/lib/outbox/useOutbox';
import { triggerOutboxProcessing } from '@/providers/QueryProvider';
import { itemsKeys, type ItemsScope } from '@/hooks/queries/useItemsQuery';
import type { ItemWithDetails } from '@/lib/supabase/queries/items';
import type { Database } from '@/types/database';

type ItemUpdate = Database['public']['Tables']['items']['Update'];

interface UpdateItemData {
  itemId: string;
  updates: ItemUpdate;
}

interface UndoState {
  itemId: string;
  outboxId: string;
  previousData: Partial<ItemWithDetails>;
  timerRef: NodeJS.Timeout | null;
}

/**
 * Hook for updating items (optimistic + Outbox)
 * Supports undo for 'resolved' status in 'expired' scope
 */
export function useUpdateItem(ownerId: string, scope: ItemsScope = 'all') {
  const queryClient = useQueryClient();
  const outbox = useOutbox();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  const updateItem = useCallback(
    async (data: UpdateItemData): Promise<void> => {
      setIsPending(true);
      setError(null);

      const { itemId, updates } = data;

      try {
        // 1. Cancel queries
        await queryClient.cancelQueries({ queryKey: itemsKeys.byOwner(ownerId) });

        // 2. Find the item in cache (for snapshot and entityKey)
        const queryKey = itemsKeys.byScope(ownerId, scope);
        const items = queryClient.getQueryData<ItemWithDetails[]>(queryKey) || [];
        const oldItem = items.find((item) => item.id === itemId);

        if (!oldItem) {
          throw new Error(`Item not found in cache: ${itemId}`);
        }

        // 3. Optimistic update
        // CRITICAL: If marking item as resolved in 'expired' scope, remove it immediately
        // (expired list should not show resolved items - matches server query behavior)
        const isResolvingExpiredItem = scope === 'expired' && updates.status === 'resolved';
        
        if (isResolvingExpiredItem) {
          // Remove item immediately (optimistic removal)
          queryClient.setQueryData<ItemWithDetails[]>(queryKey, (old = []) =>
            old.filter((item) => item.id !== itemId)
          );
        } else {
          // Normal update (keep item in list with pending status)
          queryClient.setQueryData<ItemWithDetails[]>(queryKey, (old = []) =>
            old.map((item) =>
              item.id === itemId
                ? { ...item, ...updates, _syncStatus: 'pending' }
                : item
            )
          );
        }

        // 4. Determine entityKey for sequencing
        const entityKey = (oldItem as any)._localItemKey || itemId;

        // 5. Enqueue to Outbox (await)
        const outboxId = uuid();
        await outbox.enqueue({
          id: outboxId,
          type: 'updateItem',
          payload: { itemId, updates },
          localItemKey: (oldItem as any)._localItemKey,
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

        // 6. If resolving in expired scope, setup undo timer (5 seconds)
        if (isResolvingExpiredItem) {
          const timerRef = setTimeout(() => {
            setUndoState(null); // Clear undo state after 5s
            triggerOutboxProcessing().catch(console.error); // Start processing
          }, 5000) as any;

          // Save previous state for undo
          const previousData = {
            status: oldItem.status,
            resolved_reason: oldItem.resolved_reason,
          };

          setUndoState({ itemId, outboxId, previousData, timerRef });
        } else {
          // 7. For normal updates, trigger processing immediately
          triggerOutboxProcessing().catch(console.error);
        }

        setIsPending(false);
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
   * Undo resolve (restore item to expired list)
   */
  const undoResolve = useCallback(async () => {
    if (!undoState) return;

    const { itemId, outboxId, previousData, timerRef } = undoState;

    // 1. Clear timer
    if (timerRef) {
      clearTimeout(timerRef);
    }

    // 2. Remove from Outbox
    await outbox.remove(outboxId);

    // 3. Restore item to cache (with previous status)
    const queryKey = itemsKeys.byScope(ownerId, scope);
    const items = queryClient.getQueryData<ItemWithDetails[]>(queryKey) || [];
    
    // Find item in 'all' scope to get full data
    const allItems = queryClient.getQueryData<ItemWithDetails[]>(itemsKeys.byScope(ownerId, 'all')) || [];
    const fullItem = allItems.find((i) => i.id === itemId);
    
    if (fullItem) {
      // Restore with previous status
      queryClient.setQueryData<ItemWithDetails[]>(queryKey, (old = []) => [
        { ...fullItem, ...previousData },
        ...old,
      ]);
    }

    // 4. Clear undo state
    setUndoState(null);
  }, [undoState, ownerId, scope, queryClient, outbox]);

  return {
    updateItem,
    isPending,
    error,
    canUndoResolve: !!undoState,
    undoResolve,
  };
}
