/**
 * Items mutations for Supabase
 * 
 * Note: The `items` table uses `owner_id` (not `store_id`).
 * See src/lib/supabase/ownerUtils.ts for naming convention documentation.
 */

import { supabase } from '../client';
import type { Database } from '@/types/database';

type ItemInsert = Database['public']['Tables']['items']['Insert'];
type ItemUpdate = Database['public']['Tables']['items']['Update'];

/**
 * Enforce free plan item limit after creating a new item
 * Locks items beyond the first 150 (by created_at ASC)
 */
async function enforceFreePlanLimitAfterCreate(ownerId: string) {
  try {
    // Fetch all items for this owner, ordered by created_at ASC (oldest first)
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });

    if (itemsError || !items) {
      console.error('[createItem] Error fetching items for limit enforcement:', itemsError);
      return;
    }

    if (items.length === 0) {
      return;
    }

    const FREE_PLAN_LIMIT = 150;
    
    // Compute the list of item IDs to keep unlocked (first 150 items)
    const keepIds = items.slice(0, FREE_PLAN_LIMIT).map((item: any) => item.id);
    const totalItems = items.length;
    
    if (totalItems > FREE_PLAN_LIMIT) {
      // Lock all items first
      const { error: lockAllError } = await supabase
        .from('items')
        .update({ is_plan_locked: true })
        .eq('owner_id', ownerId);

      if (lockAllError) {
        console.error('[createItem] Failed to lock items:', lockAllError);
        return;
      }

      // Then unlock the first 150 items
      if (keepIds.length > 0) {
        const { error: unlockError } = await supabase
          .from('items')
          .update({ is_plan_locked: false })
          .eq('owner_id', ownerId)
          .in('id', keepIds);

        if (unlockError) {
          console.error('[createItem] Failed to unlock kept items:', unlockError);
        }
      }
    } else {
      // All items fit within the limit, ensure all are unlocked
      const { error: unlockAllError } = await supabase
        .from('items')
        .update({ is_plan_locked: false })
        .eq('owner_id', ownerId);

      if (unlockAllError) {
        console.error('[createItem] Failed to unlock all items:', unlockAllError);
      }
    }
  } catch (error) {
    console.error('[createItem] Exception while enforcing free plan limit:', error);
  }
}

/**
 * Create a new item
 */
export async function createItem(item: ItemInsert) {
  const { data, error } = await supabase
    .from('items')
    .insert(item as any)
    .select()
    .single();

  if (error) {
    console.error('Error creating item:', error);
    throw error;
  }

  // After creating the item, enforce free plan limits if needed
  // This ensures new items beyond the limit are locked
  if (data && item.owner_id) {
    // Run in background (don't wait for it)
    enforceFreePlanLimitAfterCreate(item.owner_id).catch((err) => {
      console.error('[createItem] Error enforcing free plan limit:', err);
    });
  }

  return data;
}

/**
 * Update an item
 */
export async function updateItem(itemId: string, updates: ItemUpdate) {
  // Type assertion needed due to Supabase strict typing
  const query = supabase.from('items') as any;
  const { data, error } = await query
    .update(updates)
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    console.error('Error updating item:', error);
    throw error;
  }

  return data;
}

/**
 * Delete an item
 * Also deletes the associated product if it has no other items
 */
export async function deleteItem(itemId: string) {
  // First, get the item to retrieve product_id and owner_id
  const { data: item, error: fetchError } = await supabase
    .from('items')
    .select('product_id, owner_id')
    .eq('id', itemId)
    .single();

  if (fetchError) {
    console.error('Error fetching item:', fetchError);
    throw fetchError;
  }

  if (!item) {
    throw new Error('Item not found');
  }

  // Delete the item
  const { error: deleteError } = await supabase
    .from('items')
    .delete()
    .eq('id', itemId);

  if (deleteError) {
    console.error('Error deleting item:', deleteError);
    throw deleteError;
  }

  // If the item had a product_id, check if the product has any remaining items
  if (item.product_id) {
    const { data: remainingItems, error: checkError } = await supabase
      .from('items')
      .select('id')
      .eq('product_id', item.product_id)
      .eq('owner_id', item.owner_id)
      .limit(1);

    if (checkError) {
      console.error('Error checking remaining items:', checkError);
      // Don't throw - the item was already deleted successfully
      return;
    }

    // If no remaining items, delete the product
    if (!remainingItems || remainingItems.length === 0) {
      const { error: productDeleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', item.product_id)
        .eq('owner_id', item.owner_id);

      if (productDeleteError) {
        console.error('Error deleting product:', productDeleteError);
        // Don't throw - the item was already deleted successfully
      }
    }
  }
}

/**
 * Delete multiple items by IDs
 * Also deletes associated products if they have no other items
 */
export async function deleteItems(itemIds: string[]): Promise<void> {
  if (!itemIds || itemIds.length === 0) {
    return;
  }

  // First, get all items to retrieve product_id and owner_id
  const { data: items, error: fetchError } = await supabase
    .from('items')
    .select('product_id, owner_id')
    .in('id', itemIds);

  if (fetchError) {
    console.error('Error fetching items:', fetchError);
    throw fetchError;
  }

  if (!items || items.length === 0) {
    return;
  }

  // Delete the items
  const { error: deleteError } = await supabase
    .from('items')
    .delete()
    .in('id', itemIds);

  if (deleteError) {
    console.error('Error deleting items:', deleteError);
    throw deleteError;
  }

  // Group items by product_id and owner_id to check which products need to be deleted
  const productOwnerMap = new Map<string, { productId: string; ownerId: string }>();
  items.forEach((item) => {
    if (item.product_id) {
      const key = `${item.product_id}-${item.owner_id}`;
      if (!productOwnerMap.has(key)) {
        productOwnerMap.set(key, { productId: item.product_id, ownerId: item.owner_id });
      }
    }
  });

  // Check each product and delete if it has no remaining items
  for (const { productId, ownerId } of productOwnerMap.values()) {
    const { data: remainingItems, error: checkError } = await supabase
      .from('items')
      .select('id')
      .eq('product_id', productId)
      .eq('owner_id', ownerId)
      .limit(1);

    if (checkError) {
      console.error('Error checking remaining items for product:', checkError);
      continue;
    }

    // If no remaining items, delete the product
    if (!remainingItems || remainingItems.length === 0) {
      const { error: productDeleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('owner_id', ownerId);

      if (productDeleteError) {
        console.error('Error deleting product:', productDeleteError);
        // Don't throw - items were already deleted successfully
      }
    }
  }
}

/**
 * Delete all items for an owner
 * Also deletes all associated products
 */
export async function deleteAllItems(ownerId: string): Promise<number> {
  // First, get all items for this owner
  const { data: items, error: fetchError } = await supabase
    .from('items')
    .select('id, product_id')
    .eq('owner_id', ownerId);

  if (fetchError) {
    console.error('Error fetching items for deletion:', fetchError);
    throw fetchError;
  }

  if (!items || items.length === 0) {
    return 0;
  }

  const itemIds = items.map(item => item.id);
  
  // Delete all items
  const { error: deleteError } = await supabase
    .from('items')
    .delete()
    .in('id', itemIds);

  if (deleteError) {
    console.error('Error deleting all items:', deleteError);
    throw deleteError;
  }

  // Delete all products for this owner (since all items are deleted, all products can be deleted)
  const { error: productsDeleteError } = await supabase
    .from('products')
    .delete()
    .eq('owner_id', ownerId);

  if (productsDeleteError) {
    console.error('Error deleting products:', productsDeleteError);
    // Don't throw - items were already deleted successfully
  }

  return itemIds.length;
}

/**
 * Resolve an item (mark as resolved)
 */
export async function resolveItem(
  itemId: string,
  reason: 'sold' | 'disposed' | 'other',
  note?: string
) {
  return updateItem(itemId, {
    status: 'resolved',
    resolved_reason: reason,
    note: note || null,
  });
}

/**
 * Delete expired items that have exceeded the retention period
 * IMPORTANT: Logs EXPIRED_AUTO_ARCHIVED events before deletion to preserve history
 * 
 * @param ownerId - The owner ID
 * @param retentionDays - Number of days to retain expired items (0 = disabled)
 * @returns Number of items deleted
 */
export async function deleteExpiredItemsByRetention(
  ownerId: string,
  retentionDays: number
): Promise<number> {
  if (retentionDays <= 0) {
    return 0; // Auto-delete disabled
  }

  try {
    // Calculate the cutoff date (items expired before this date should be deleted)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoffDate = new Date(today);
    cutoffDate.setDate(today.getDate() - retentionDays);
    const cutoffDateISO = cutoffDate.toISOString().split('T')[0];

    // Find expired items that should be deleted - include more fields for event logging
    // Items that expired before the cutoff date
    const { data: itemsToDelete, error: fetchError } = await supabase
      .from('items')
      .select('id, product_id, owner_id, expiry_date, barcode_snapshot')
      .eq('owner_id', ownerId)
      .lt('expiry_date', cutoffDateISO)
      .neq('status', 'resolved'); // Don't delete already resolved items

    if (fetchError) {
      console.error('Error fetching expired items for deletion:', fetchError);
      throw fetchError;
    }

    if (!itemsToDelete || itemsToDelete.length === 0) {
      return 0;
    }

    // Fetch product names for event logging
    const productIds = [...new Set(itemsToDelete.map(item => item.product_id).filter(Boolean))];
    let productsMap = new Map<string, string>();
    
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);
      
      if (products) {
        productsMap = new Map(products.map((p: any) => [p.id, p.name]));
      }
    }

    // Log EXPIRED_AUTO_ARCHIVED events BEFORE deleting (preserve history)
    try {
      const { logExpiredAutoArchivedBatch } = await import('../services/expiryEventsService');
      
      const eventsToLog = itemsToDelete.map((item: any) => ({
        batchId: item.id,
        barcode: item.barcode_snapshot || undefined,
        productName: item.product_id ? productsMap.get(item.product_id) : undefined,
        expiryDate: item.expiry_date,
      }));

      const loggedCount = await logExpiredAutoArchivedBatch(ownerId, eventsToLog);
      console.log(`[Auto-Delete] Logged ${loggedCount} EXPIRED_AUTO_ARCHIVED events`);
    } catch (logError) {
      // Don't block deletion if event logging fails
      console.error('[Auto-Delete] Error logging expiry events (continuing with deletion):', logError);
    }

    // Delete all items that should be removed
    const itemIds = itemsToDelete.map(item => item.id);
    const { error: deleteError } = await supabase
      .from('items')
      .delete()
      .in('id', itemIds);

    if (deleteError) {
      console.error('Error deleting expired items:', deleteError);
      throw deleteError;
    }

    // Group items by product_id and owner_id to check which products need to be deleted
    if (itemsToDelete) {
      const productOwnerMap = new Map<string, { productId: string; ownerId: string }>();
      itemsToDelete.forEach((item) => {
        if (item.product_id) {
          const key = `${item.product_id}-${item.owner_id}`;
          if (!productOwnerMap.has(key)) {
            productOwnerMap.set(key, { productId: item.product_id, ownerId: item.owner_id });
          }
        }
      });

      // Check each product and delete if it has no remaining items
      for (const { productId, ownerId } of productOwnerMap.values()) {
        const { data: remainingItems, error: checkError } = await supabase
          .from('items')
          .select('id')
          .eq('product_id', productId)
          .eq('owner_id', ownerId)
          .limit(1);

        if (checkError) {
          console.error('Error checking remaining items for product:', checkError);
          continue;
        }

        // If no remaining items, delete the product
        if (!remainingItems || remainingItems.length === 0) {
          const { error: productDeleteError } = await supabase
            .from('products')
            .delete()
            .eq('id', productId)
            .eq('owner_id', ownerId);

          if (productDeleteError) {
            console.error('Error deleting product:', productDeleteError);
            // Don't throw - items were already deleted successfully
          }
        }
      }
    }

    console.log(`[Auto-Delete] Deleted ${itemIds.length} expired items for owner ${ownerId} (retention: ${retentionDays} days)`);
    return itemIds.length;
  } catch (error) {
    console.error('Error in deleteExpiredItemsByRetention:', error);
    throw error;
  }
}

