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

