/**
 * useItemsQuery - TanStack Query hook for fetching items
 * 
 * Replaces legacy useItems hook for read operations
 * Uses persisted cache for instant rendering
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ItemWithDetails } from '@/lib/supabase/queries/items';
import {
  getAllItems,
  getExpiredItems,
  getItemsExpiringToday,
  getItemsExpiringTomorrow,
  getItemsExpiringNextWeek,
} from '@/lib/supabase/queries/items';

export type ItemsScope = 'all' | 'today' | 'tomorrow' | 'week' | 'expired';

interface UseItemsQueryOptions {
  ownerId: string | undefined;
  scope: ItemsScope;
  enabled?: boolean; // Manual control over whether query runs
}

/**
 * Query key factory for items
 */
export const itemsKeys = {
  all: () => ['items'] as const,
  byOwner: (ownerId: string) => ['items', ownerId] as const,
  byScope: (ownerId: string, scope: ItemsScope) => ['items', ownerId, scope] as const,
  detail: (ownerId: string, itemId: string) => ['items', ownerId, 'detail', itemId] as const,
};

/**
 * Fetch items based on scope
 */
async function fetchItemsByScope(
  ownerId: string,
  scope: ItemsScope
): Promise<ItemWithDetails[]> {
  switch (scope) {
    case 'all':
      return getAllItems(ownerId);
    case 'today':
      return getItemsExpiringToday(ownerId);
    case 'tomorrow':
      return getItemsExpiringTomorrow(ownerId);
    case 'week':
      return getItemsExpiringNextWeek(ownerId);
    case 'expired':
      return getExpiredItems(ownerId);
    default:
      throw new Error(`Invalid scope: ${scope}`);
  }
}

/**
 * Hook for querying items
 * 
 * Features:
 * - Instant render from persisted cache
 * - Background revalidation
 * - Optimistic updates (from write hooks)
 * - No refetch on focus (only on reconnect)
 */
export function useItemsQuery({
  ownerId,
  scope,
  enabled = true,
}: UseItemsQueryOptions): UseQueryResult<ItemWithDetails[], Error> {
  return useQuery({
    queryKey: itemsKeys.byScope(ownerId || 'none', scope),
    queryFn: () => {
      if (!ownerId) throw new Error('Owner ID is required');
      return fetchItemsByScope(ownerId, scope);
    },
    enabled: enabled && !!ownerId,
    
    // Cache config (longer for items lists)
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    
    // Keep previous data while refetching (smooth UX)
    placeholderData: (previousData) => previousData,
    
    // React Native specific
    refetchOnMount: false, // Use cache first
    refetchOnReconnect: true, // Refetch when network reconnects
    refetchOnWindowFocus: false, // N/A in React Native
  });
}

/**
 * Hook for querying single item detail
 */
export function useItemQuery(ownerId: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: itemsKeys.detail(ownerId || 'none', itemId || 'none'),
    queryFn: async () => {
      if (!ownerId || !itemId) throw new Error('Owner ID and Item ID are required');
      
      // For now, fetch from list cache (future: add API endpoint for single item)
      const items = await getAllItems(ownerId);
      const item = items.find((i) => i.id === itemId);
      if (!item) throw new Error('Item not found');
      return item;
    },
    enabled: !!ownerId && !!itemId,
    
    // Shorter stale time for detail views (more likely to be edited)
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 1 * 60 * 60 * 1000, // 1 hour
    
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });
}
