/**
 * useItemsQuery - TanStack Query hook for fetching items
 * 
 * Replaces legacy useItems hook for read operations
 * Uses persisted cache for instant rendering
 * Offline-safe: Only fetches when online, uses cache when offline
 */

import { useQuery, useQueryClient, type UseQueryResult, type QueryClient } from '@tanstack/react-query';
import type { ItemWithDetails } from '@/lib/supabase/queries/items';
import {
  getAllItems,
  getExpiredItems,
  getItemsExpiringToday,
  getItemsExpiringTomorrow,
  getItemsExpiringNextWeek,
} from '@/lib/supabase/queries/items';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';

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
  const { isOnline } = useNetworkStatus();
  
  return useQuery({
    queryKey: itemsKeys.byScope(ownerId || 'none', scope),
    queryFn: () => {
      if (!ownerId) throw new Error('Owner ID is required');
      return fetchItemsByScope(ownerId, scope);
    },
    // OFFLINE-SAFE: Only fetch when online AND enabled AND has ownerId
    enabled: enabled && !!ownerId && isOnline,
    
    // Cache config (longer for items lists)
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    
    // Keep previous data while refetching (smooth UX)
    placeholderData: (previousData) => previousData,
    
    // Offline-first: Serve from cache when offline, don't show errors
    networkMode: 'offlineFirst',
    retry: false, // Don't retry when offline
    
    // React Native specific
    refetchOnMount: false, // Use cache first
    refetchOnReconnect: true, // Refetch when network reconnects
    refetchOnWindowFocus: false, // N/A in React Native
  });
}

/**
 * Search TanStack Query cache for an item across all cached queries
 * Useful for offline-first detail views
 */
function findItemInCache(
  queryClient: QueryClient,
  ownerId: string,
  itemId: string
): ItemWithDetails | undefined {
  const queryCache = queryClient.getQueryCache();
  const allQueries = queryCache.getAll();
  
  // Search through all cached queries that match ['items', ownerId, ...]
  for (const query of allQueries) {
    const queryKey = query.queryKey;
    
    // Check if this is an items query for this owner
    if (
      Array.isArray(queryKey) &&
      queryKey[0] === 'items' &&
      queryKey[1] === ownerId
    ) {
      const cachedData = query.state.data as ItemWithDetails[] | undefined;
      
      if (Array.isArray(cachedData)) {
        const item = cachedData.find((i) => i.id === itemId);
        if (item) {
          console.log('[findItemInCache] Found item in cache:', {
            itemId,
            queryKey,
            itemName: item.product_name,
          });
          return item;
        }
      }
    }
  }
  
  console.log('[findItemInCache] Item not found in any cached query');
  return undefined;
}

/**
 * Hook for querying single item detail
 * 
 * OFFLINE-FIRST:
 * - Attempts to serve from cache if available (even when offline)
 * - Only fetches from network when online
 * - Gracefully handles offline cache miss
 */
export function useItemQuery(ownerId: string | undefined, itemId: string | undefined) {
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: itemsKeys.detail(ownerId || 'none', itemId || 'none'),
    queryFn: async () => {
      if (!ownerId || !itemId) throw new Error('Owner ID and Item ID are required');
      
      // Network fetch (requires online)
      const items = await getAllItems(ownerId);
      const item = items.find((i) => i.id === itemId);
      if (!item) throw new Error('Item not found');
      return item;
    },
    
    // Serve from cache if available (works offline)
    initialData: () => {
      if (!ownerId || !itemId) return undefined;
      return findItemInCache(queryClient, ownerId, itemId);
    },
    
    // Only fetch when online AND (no cache OR data is stale)
    enabled: !!ownerId && !!itemId && isOnline,
    
    // Shorter stale time for detail views (more likely to be edited)
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 1 * 60 * 60 * 1000, // 1 hour
    
    // Offline-first: Serve from cache when offline
    networkMode: 'offlineFirst',
    retry: false, // Don't retry when offline
    
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });
}
