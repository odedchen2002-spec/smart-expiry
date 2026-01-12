/**
 * useCreateItem - Custom write hook for creating items
 * 
 * NOT a useMutation - this is a custom hook that:
 * 1. Updates cache optimistically
 * 2. Enqueues to Outbox (durable)
 * 3. Returns immediately
 * 4. Outbox processor handles network execution
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useOutbox } from '@/lib/outbox/useOutbox';
import { triggerOutboxProcessing } from '@/providers/QueryProvider';
import { itemsKeys, type ItemsScope } from '@/hooks/queries/useItemsQuery';
import type { ItemWithDetails } from '@/lib/supabase/queries/items';
import type { Database } from '@/types/database';

type ItemInsert = Database['public']['Tables']['items']['Insert'];

interface CreateItemData {
  owner_id: string;
  product_id: string;
  expiry_date: string;
  location_id: string;
  barcode_snapshot?: string | null;
  note?: string | null;
}

interface CreateItemResult {
  tempId: string;
  localItemKey: string;
}

/**
 * Hook for creating items (optimistic + Outbox)
 */
export function useCreateItem(ownerId: string, scope: ItemsScope = 'all') {
  const queryClient = useQueryClient();
  const outbox = useOutbox();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stable refs for IDs (survive re-renders, reset after success)
  const localItemKeyRef = useRef<string | null>(null);
  const clientRequestIdRef = useRef<string | null>(null);
  const tempIdRef = useRef<string | null>(null);

  const createItem = useCallback(
    async (data: CreateItemData): Promise<CreateItemResult> => {
      setIsPending(true);
      setError(null);

      try {
        // 1. Generate stable IDs (once per attempt)
        if (!localItemKeyRef.current) {
          localItemKeyRef.current = uuid();
          clientRequestIdRef.current = uuid();
          tempIdRef.current = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }

        const localItemKey = localItemKeyRef.current;
        const clientRequestId = clientRequestIdRef.current;
        const tempId = tempIdRef.current;

        // 2. Cancel outgoing queries (prevent race conditions)
        await queryClient.cancelQueries({ queryKey: itemsKeys.byOwner(ownerId) });

        // 3. Optimistic cache update
        const queryKey = itemsKeys.byScope(ownerId, scope);
        queryClient.setQueryData<ItemWithDetails[]>(queryKey, (old = []) => [
          ...old,
          {
            ...data,
            id: tempId,
            status: undefined as any,
            resolved_reason: null,
            note: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_plan_locked: false,
            product_name: null, // Will be populated from product
            product_barcode: null,
            product_category: null,
            product_image_url: null,
            location_name: null,
            location_order: null,
            _optimistic: true,
            _localItemKey: localItemKey,
            _clientRequestId: clientRequestId,
            _syncStatus: 'pending',
          } as any,
        ]);

        // 4. Enqueue to Outbox (durable write - await)
        await outbox.enqueue({
          id: uuid(),
          type: 'createItem',
          payload: data,
          localItemKey,
          clientRequestId,
          tempId,
          entityKey: localItemKey,
          ownerId,
          scope,
          createdAt: Date.now(),
          attempts: 0,
          lastAttemptAt: null,
          lastError: null,
          status: 'pending',
        });

        // 5. Trigger background processing (non-blocking)
        triggerOutboxProcessing().catch(console.error);

        // 6. Return immediately
        setIsPending(false);

        // Reset refs for next mutation
        localItemKeyRef.current = null;
        clientRequestIdRef.current = null;
        tempIdRef.current = null;

        return { tempId, localItemKey };
      } catch (err) {
        // Only fails if Outbox write fails (rare)
        const error = err as Error;
        setError(error);
        setIsPending(false);
        throw error;
      }
    },
    [ownerId, scope, queryClient, outbox]
  );

  return {
    createItem,
    isPending,
    error,
  };
}
