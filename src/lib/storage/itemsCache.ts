/**
 * Items cache helper
 * Stores items locally for offline access and faster initial load
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@/types/database';

type ItemWithDetails = Database['public']['Views']['items_with_details']['Row'];

const ITEMS_CACHE_KEY_PREFIX = 'items-cache:';

interface CachedItems {
  updatedAt: string;
  items: ItemWithDetails[];
}

/**
 * Save items to cache for a specific owner
 */
export async function saveItemsToCache(ownerId: string, items: ItemWithDetails[]): Promise<void> {
  try {
    const key = `${ITEMS_CACHE_KEY_PREFIX}${ownerId}`;
    const payload: CachedItems = {
      updatedAt: new Date().toISOString(),
      items,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.warn('[ItemsCache] Failed to save items cache', error);
  }
}

/**
 * Load items from cache for a specific owner
 */
export async function loadItemsFromCache(ownerId: string): Promise<CachedItems | null> {
  try {
    const key = `${ITEMS_CACHE_KEY_PREFIX}${ownerId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedItems;
    return parsed;
  } catch (error) {
    console.warn('[ItemsCache] Failed to load items cache', error);
    return null;
  }
}

/**
 * Clear items cache for a specific owner
 */
export async function clearItemsCache(ownerId: string): Promise<void> {
  try {
    const key = `${ITEMS_CACHE_KEY_PREFIX}${ownerId}`;
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn('[ItemsCache] Failed to clear items cache', error);
  }
}

/**
 * Add a single item to the cache (for offline additions)
 * Creates a temporary item that will be replaced when synced
 */
export async function addItemToCache(
  ownerId: string, 
  item: {
    id: string;
    name: string;
    barcode?: string | null;
    expiry_date: string;
    category_name?: string | null;
  }
): Promise<void> {
  try {
    const cached = await loadItemsFromCache(ownerId);
    const existingItems = cached?.items || [];
    
    // Create a temporary item matching ItemWithDetails structure
    const tempItem: ItemWithDetails = {
      id: item.id,
      owner_id: ownerId,
      product_id: null,
      product_name: item.name,
      product_barcode: item.barcode || null,
      product_category: item.category_name || null,
      expiry_date: item.expiry_date,
      barcode_snapshot: item.barcode || null,
      status: null, // Will be set by server
      is_plan_locked: false,
      location_id: null,
      location_name: null,
      note: null,
      resolved_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    // Add to beginning of list (newest first)
    const newItems = [tempItem, ...existingItems];
    await saveItemsToCache(ownerId, newItems);
    
    console.log('[ItemsCache] Added temporary item to cache:', item.id);
  } catch (error) {
    console.warn('[ItemsCache] Failed to add item to cache', error);
  }
}

/**
 * Remove a temporary item from cache (after sync or cancellation)
 */
export async function removeItemFromCache(ownerId: string, itemId: string): Promise<void> {
  try {
    const cached = await loadItemsFromCache(ownerId);
    if (!cached?.items) return;
    
    const filteredItems = cached.items.filter(item => item.id !== itemId);
    await saveItemsToCache(ownerId, filteredItems);
    
    console.log('[ItemsCache] Removed item from cache:', itemId);
  } catch (error) {
    console.warn('[ItemsCache] Failed to remove item from cache', error);
  }
}

