/**
 * Pending Items Service
 * 
 * Handles supplier intake workflow (A2):
 * - Supplier OCR/import creates pending_items
 * - NO batches/items are created yet (no expiry date estimation)
 * - When user scans barcode + expiry date, pending items are resolved
 * 
 * Key principle: Do NOT estimate expiry dates. Wait for real scan.
 * 
 * Note: This table uses `store_id` (not `owner_id`).
 * See src/lib/supabase/ownerUtils.ts for naming convention documentation.
 * 
 * OFFLINE-SAFE:
 * - Caches pending count to AsyncStorage
 * - Returns cached count when offline
 * - No network errors when offline
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../client';
import type { Database } from '@/types/database';
import { checkNetworkStatus } from '@/lib/hooks/useNetworkStatus';

const PENDING_COUNT_CACHE_KEY = (storeId: string) => `pending_count_${storeId}`;

type PendingItem = Database['public']['Tables']['pending_items']['Row'];
type PendingItemInsert = Database['public']['Tables']['pending_items']['Insert'];

export interface PendingItemResult {
  id: string;
  rawName: string | null;
  quantity: number | null;
}

/**
 * Create a pending item from supplier document/OCR.
 * This does NOT create a batch - just a placeholder waiting for real expiry date.
 * 
 * @param storeId - The store/owner ID
 * @param barcode - Optional barcode from supplier document
 * @param rawName - Optional product name from supplier document
 * @param quantity - Optional quantity
 */
export async function createPendingItem(
  storeId: string,
  barcode?: string | null,
  rawName?: string | null,
  quantity?: number | null
): Promise<string | null> {
  if (!storeId) {
    console.error('[pendingItemsService] createPendingItem: Missing storeId');
    return null;
  }

  try {
    const insertData: PendingItemInsert = {
      store_id: storeId,
      barcode: barcode || null,
      raw_name: rawName || null,
      quantity: quantity || null,
    };

    const { data, error } = await supabase
      .from('pending_items')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error('[pendingItemsService] Error creating pending item:', error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error('[pendingItemsService] Error creating pending item:', error);
    return null;
  }
}

/**
 * Create multiple pending items from a supplier batch (e.g., from OCR).
 * 
 * @param storeId - The store/owner ID
 * @param items - Array of items with optional barcode, rawName, and quantity
 */
export async function createPendingItemsBatch(
  storeId: string,
  items: Array<{ barcode?: string | null; rawName?: string | null; quantity?: number | null }>
): Promise<string[]> {
  if (!storeId || !items || items.length === 0) {
    console.error('[pendingItemsService] createPendingItemsBatch: Invalid parameters');
    return [];
  }

  try {
    const insertData: PendingItemInsert[] = items.map((item) => ({
      store_id: storeId,
      barcode: item.barcode || null,
      raw_name: item.rawName || null,
      quantity: item.quantity || null,
    }));

    const { data, error } = await supabase
      .from('pending_items')
      .insert(insertData)
      .select('id');

    if (error) {
      console.error('[pendingItemsService] Error creating pending items batch:', error);
      return [];
    }

    return data?.map((item) => item.id) || [];
  } catch (error) {
    console.error('[pendingItemsService] Error creating pending items batch:', error);
    return [];
  }
}

/**
 * Try to resolve a pending item when a barcode is scanned with an expiry date.
 * This is called during fast scan to automatically match supplier deliveries.
 * 
 * Returns the resolved pending item info (if found) for optional toast notification.
 * 
 * @param storeId - The store/owner ID
 * @param barcode - The scanned barcode
 */
export async function tryResolvePendingItem(
  storeId: string,
  barcode: string
): Promise<PendingItemResult | null> {
  if (!storeId || !barcode) {
    return null;
  }

  try {
    // Use the RPC function to find and resolve the oldest unresolved pending item
    const { data, error } = await supabase.rpc('resolve_pending_item', {
      p_store_id: storeId,
      p_barcode: barcode,
    });

    if (error) {
      console.error('[pendingItemsService] Error resolving pending item:', error);
      return null;
    }

    // The RPC returns an array, take the first result
    if (data && Array.isArray(data) && data.length > 0) {
      const result = data[0];
      return {
        id: result.pending_item_id,
        rawName: result.raw_name,
        quantity: result.quantity,
      };
    }

    return null;
  } catch (error) {
    console.error('[pendingItemsService] Error resolving pending item:', error);
    return null;
  }
}

/**
 * Get unresolved pending items for a store.
 * Useful for showing a list of items waiting for expiry dates.
 * 
 * @param storeId - The store/owner ID
 * @param limit - Maximum number of items to return (default: 100)
 */
export async function getUnresolvedPendingItems(
  storeId: string,
  limit: number = 100
): Promise<PendingItem[]> {
  if (!storeId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('pending_items')
      .select('*')
      .eq('store_id', storeId)
      .is('resolved_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[pendingItemsService] Error fetching pending items:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[pendingItemsService] Error fetching pending items:', error);
    return [];
  }
}

/**
 * Get count of unresolved pending items for a store.
 * Useful for showing a badge or indicator.
 * 
 * OFFLINE-SAFE: Returns cached count when offline
 * 
 * @param storeId - The store/owner ID
 */
export async function getUnresolvedPendingItemsCount(storeId: string): Promise<number> {
  if (!storeId) {
    return 0;
  }

  // Check if online
  const isOnline = await checkNetworkStatus();
  
  if (!isOnline) {
    // Return cached count when offline
    try {
      const cached = await AsyncStorage.getItem(PENDING_COUNT_CACHE_KEY(storeId));
      if (cached) {
        const count = parseInt(cached, 10);
        console.log('[pendingItemsService] Offline - returning cached count:', count);
        return count;
      }
    } catch (err) {
      console.warn('[pendingItemsService] Error loading cached count:', err);
    }
    // No cache - return 0
    console.log('[pendingItemsService] Offline - no cache, returning 0');
    return 0;
  }

  try {
    const { count, error } = await supabase
      .from('pending_items')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .is('resolved_at', null);

    if (error) {
      console.warn('[pendingItemsService] Error counting pending items, checking cache');
      // Try to return cached count on error
      const cached = await AsyncStorage.getItem(PENDING_COUNT_CACHE_KEY(storeId));
      if (cached) {
        return parseInt(cached, 10);
      }
      return 0;
    }

    const finalCount = count || 0;
    
    // Cache the count for offline use
    await AsyncStorage.setItem(PENDING_COUNT_CACHE_KEY(storeId), String(finalCount));
    
    return finalCount;
  } catch (error) {
    console.warn('[pendingItemsService] Error counting pending items, using cache');
    // Try to return cached count
    try {
      const cached = await AsyncStorage.getItem(PENDING_COUNT_CACHE_KEY(storeId));
      if (cached) {
        return parseInt(cached, 10);
      }
    } catch (cacheErr) {
      console.warn('[pendingItemsService] Error loading cache:', cacheErr);
    }
    return 0;
  }
}

/**
 * Delete a pending item (e.g., if user cancels or item is no longer relevant).
 * 
 * @param pendingItemId - The ID of the pending item to delete
 */
export async function deletePendingItem(pendingItemId: string): Promise<boolean> {
  if (!pendingItemId) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('pending_items')
      .delete()
      .eq('id', pendingItemId);

    if (error) {
      console.error('[pendingItemsService] Error deleting pending item:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[pendingItemsService] Error deleting pending item:', error);
    return false;
  }
}

/**
 * Manually mark a pending item as resolved (without creating a batch).
 * Useful for items that were handled differently or no longer needed.
 * 
 * @param pendingItemId - The ID of the pending item
 */
export async function markPendingItemResolved(pendingItemId: string): Promise<boolean> {
  if (!pendingItemId) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('pending_items')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', pendingItemId);

    if (error) {
      console.error('[pendingItemsService] Error marking pending item resolved:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[pendingItemsService] Error marking pending item resolved:', error);
    return false;
  }
}

