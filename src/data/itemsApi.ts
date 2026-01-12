/**
 * Items API - Pure functions for item CRUD operations
 * 
 * No React dependencies, no UI logic
 * Called by OutboxProcessor only
 */

import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/types/database';

type Item = Database['public']['Tables']['items']['Row'];
type ItemInsert = Database['public']['Tables']['items']['Insert'];
type ItemUpdate = Database['public']['Tables']['items']['Update'];

/**
 * Create item with idempotency key
 * 
 * If clientRequestId already exists (duplicate retry), returns existing item
 * This ensures safe retries without creating duplicates
 */
export async function createItem(
  data: Omit<ItemInsert, 'client_request_id'>,
  clientRequestId: string
): Promise<Item> {
  // TODO: Update database types after migration to include client_request_id
  const payload: any = {
    ...data,
    client_request_id: clientRequestId,
    is_plan_locked: (data as any).is_plan_locked ?? false,
  };

  // Attempt insert
  const { data: result, error } = await supabase
    .from('items')
    .insert(payload)
    .select()
    .single() as { data: Item | null; error: any };

  // Success on first attempt
  if (!error && result) {
    console.log('[itemsApi] Created item:', result.id);
    return result;
  }

  // Handle unique violation (duplicate client_request_id)
  if (error.code === '23505' && error.message.includes('client_request_id')) {
    console.log('[itemsApi] Idempotency: fetching existing item for', clientRequestId);

    const { data: existing, error: fetchError } = await supabase
      .from('items')
      .select()
      .eq('owner_id', (data as any).owner_id!)
      .eq('client_request_id', clientRequestId)
      .single() as { data: Item | null; error: any };

    if (fetchError) {
      console.error('[itemsApi] Failed to fetch existing item:', fetchError);
      throw fetchError;
    }

    if (!existing) {
      throw new Error('Idempotency failed: existing item not found after conflict');
    }

    console.log('[itemsApi] Idempotent success: returning existing item:', existing.id);
    return existing;
  }

  // Other error: throw
  console.error('[itemsApi] Create failed:', error);
  throw error;
}

/**
 * Update item with two-phase existence check
 * 
 * Returns:
 * - Item: successful update
 * - null: item was deleted (graceful - Outbox should continue)
 * 
 * Throws:
 * - Regular errors: network, DB, etc.
 * - RLS_UPDATE_DENIED_SUSPECTED: item exists but update denied (RLS policy issue)
 */
export async function updateItem(itemId: string, updates: any): Promise<Item | null> {
  // Log the update request for debugging
  console.log('[itemsApi] updateItem called:', { itemId, updates });
  
  // Phase 1: Try update with minimal select (performance)
  // TODO: Update database types after migration (client_request_id column)
  
  // Build the update query
  const updateQuery = supabase
    .from('items')
    .update(updates)
    .eq('id', itemId)
    .select('id, status, resolved_reason, updated_at');
  
  console.log('[itemsApi] About to execute update query...');
  
  // @ts-ignore - Workaround for stale DB types until regeneration
  const { data, error } = await (updateQuery.maybeSingle() as Promise<{ 
    data: Partial<Item> | null; 
    error: any 
  }>);
  
  console.log('[itemsApi] Update query result:', { data, error });

  if (error) {
    console.error('[itemsApi] Update failed:', error);
    throw error;
  }

  // Success - item updated
  if (data) {
    console.log('[itemsApi] Update successful, returned data:', data);
    // Fetch full item for return (or return partial - depends on use case)
    const { data: fullItem, error: fetchError } = await (supabase
      .from('items')
      .select()
      .eq('id', itemId)
      .single() as unknown as Promise<{ data: Item; error: any }>);
    
    if (fetchError) {
      console.error('[itemsApi] Failed to fetch full item after update:', fetchError);
      throw fetchError;
    }
    
    console.log('[itemsApi] Fetched full item after update:', fullItem);
    console.log('[itemsApi] Updated item:', itemId);
    return fullItem;
  }

  // Phase 2: Update returned null - check if item exists (distinguish deleted vs RLS-denied)
  console.warn('[itemsApi] Update returned null, performing existence check:', itemId);
  
  const { data: exists, error: existsError } = await (supabase
    .from('items')
    .select('id')
    .eq('id', itemId)
    .maybeSingle() as unknown as Promise<{ data: { id: string } | null; error: any }>);

  if (existsError) {
    console.error('[itemsApi] Existence check failed:', existsError);
    throw existsError;
  }

  if (!exists) {
    // Item truly deleted - graceful
    console.log('[itemsApi] Item deleted (graceful):', itemId);
    return null;
  }

  // Item exists but update failed - RLS/permission issue
  const rlsError: any = new Error(
    `Update denied: item ${itemId} exists but update returned no rows. Likely RLS policy restriction.`
  );
  rlsError.code = 'RLS_UPDATE_DENIED_SUSPECTED';
  rlsError.itemId = itemId;
  rlsError.status = 403; // HTTP-like status for permission denied
  
  console.error('[itemsApi] RLS update denied:', rlsError.message, { itemId });
  throw rlsError;
}

/**
 * Delete item
 */
export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', itemId);

  if (error) {
    console.error('[itemsApi] Delete failed:', error.message || error.code || JSON.stringify(error));
    throw error;
  }

  console.log('[itemsApi] Deleted item:', itemId);
}

/**
 * Bulk create items with idempotency keys
 * Returns array of created items
 */
export async function bulkCreateItems(
  items: Array<{ data: Omit<ItemInsert, 'client_request_id'>; clientRequestId: string }>
): Promise<Item[]> {
  const results: Item[] = [];

  // Process sequentially to handle idempotency correctly
  for (const item of items) {
    const created = await createItem(item.data, item.clientRequestId);
    results.push(created);
  }

  console.log('[itemsApi] Bulk created', results.length, 'items');
  return results;
}
