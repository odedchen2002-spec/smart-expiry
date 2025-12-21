/**
 * Notifications Cache Store
 * 
 * Hybrid cache: in-memory + AsyncStorage persistence.
 * - In-memory for instant access during session
 * - AsyncStorage for persistence across app restarts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationHistory } from '../supabase/queries/notifications';

interface CacheEntry {
  data: NotificationHistory[];
  timestamp: number;
  hasMore: boolean;
  lastId?: string;
}

interface NotificationsCache {
  [key: string]: CacheEntry; // key = `${userId}_${ownerId}`
}

// Module-level cache (in-memory)
const cache: NotificationsCache = {};

// Track which keys have been loaded from storage
const loadedFromStorage = new Set<string>();

// Stale time in milliseconds (60 seconds for background refresh)
const STALE_TIME = 60 * 1000;

// Storage stale time (24 hours - after this, stored data is considered too old)
const STORAGE_STALE_TIME = 24 * 60 * 60 * 1000;

// Page size for pagination
export const PAGE_SIZE = 20;

// Storage key prefix
const STORAGE_PREFIX = 'notif_cache_';

/**
 * Generate cache key from userId and ownerId
 */
export function getCacheKey(userId: string, ownerId: string): string {
  return `${userId}_${ownerId}`;
}

/**
 * Get storage key for AsyncStorage
 */
function getStorageKey(cacheKey: string): string {
  return `${STORAGE_PREFIX}${cacheKey}`;
}

/**
 * Load cache from AsyncStorage (async, call on app start or when needed)
 */
export async function loadCacheFromStorage(userId: string, ownerId: string): Promise<CacheEntry | null> {
  const key = getCacheKey(userId, ownerId);
  
  // Already loaded in this session
  if (loadedFromStorage.has(key)) {
    return cache[key] || null;
  }
  
  // Already in memory cache
  if (cache[key]) {
    loadedFromStorage.add(key);
    return cache[key];
  }
  
  try {
    const storageKey = getStorageKey(key);
    const stored = await AsyncStorage.getItem(storageKey);
    
    if (stored) {
      const entry: CacheEntry = JSON.parse(stored);
      
      // Check if stored data is too old (24 hours)
      if (Date.now() - entry.timestamp < STORAGE_STALE_TIME) {
        cache[key] = entry;
        loadedFromStorage.add(key);
        return entry;
      } else {
        // Data is too old, remove it
        await AsyncStorage.removeItem(storageKey);
      }
    }
  } catch (error) {
    console.warn('[NotificationsCache] Error loading from storage:', error);
  }
  
  loadedFromStorage.add(key);
  return null;
}

/**
 * Get cached notifications (synchronous - from memory only)
 * Call loadCacheFromStorage first to ensure storage is loaded
 */
export function getCachedNotifications(userId: string, ownerId: string): CacheEntry | null {
  const key = getCacheKey(userId, ownerId);
  return cache[key] || null;
}

/**
 * Check if cache is stale (needs background refresh)
 */
export function isCacheStale(userId: string, ownerId: string): boolean {
  const entry = getCachedNotifications(userId, ownerId);
  if (!entry) return true;
  return Date.now() - entry.timestamp > STALE_TIME;
}

/**
 * Save cache to AsyncStorage (async, fire and forget)
 */
async function persistToStorage(key: string, entry: CacheEntry): Promise<void> {
  try {
    const storageKey = getStorageKey(key);
    // Only persist first page (20 items) to keep storage small
    const entryToPersist: CacheEntry = {
      ...entry,
      data: entry.data.slice(0, PAGE_SIZE),
      hasMore: entry.data.length > PAGE_SIZE || entry.hasMore,
    };
    await AsyncStorage.setItem(storageKey, JSON.stringify(entryToPersist));
  } catch (error) {
    console.warn('[NotificationsCache] Error saving to storage:', error);
  }
}

/**
 * Set cached notifications (replaces existing cache)
 */
export function setCachedNotifications(
  userId: string,
  ownerId: string,
  data: NotificationHistory[],
  hasMore: boolean = false
): void {
  const key = getCacheKey(userId, ownerId);
  const entry: CacheEntry = {
    data,
    timestamp: Date.now(),
    hasMore,
    lastId: data.length > 0 ? data[data.length - 1].id : undefined,
  };
  cache[key] = entry;
  loadedFromStorage.add(key);
  
  // Persist to storage (async, fire and forget)
  persistToStorage(key, entry);
}

/**
 * Append more notifications to cache (for pagination)
 */
export function appendCachedNotifications(
  userId: string,
  ownerId: string,
  newData: NotificationHistory[],
  hasMore: boolean
): void {
  const key = getCacheKey(userId, ownerId);
  const existing = cache[key];
  
  if (existing) {
    // Deduplicate by id
    const existingIds = new Set(existing.data.map(n => n.id));
    const uniqueNew = newData.filter(n => !existingIds.has(n.id));
    
    cache[key] = {
      data: [...existing.data, ...uniqueNew],
      timestamp: existing.timestamp, // Keep original timestamp
      hasMore,
      lastId: newData.length > 0 ? newData[newData.length - 1].id : existing.lastId,
    };
  } else {
    setCachedNotifications(userId, ownerId, newData, hasMore);
  }
}

/**
 * Prepend new notification to cache (for real-time updates)
 */
export function prependNotification(
  userId: string,
  ownerId: string,
  notification: NotificationHistory
): void {
  const key = getCacheKey(userId, ownerId);
  const existing = cache[key];
  
  if (existing) {
    // Check if notification already exists
    if (!existing.data.some(n => n.id === notification.id)) {
      cache[key] = {
        ...existing,
        data: [notification, ...existing.data],
      };
    }
  } else {
    setCachedNotifications(userId, ownerId, [notification], true);
  }
}

/**
 * Clear cache for a specific user/owner
 */
export async function clearCache(userId: string, ownerId: string): Promise<void> {
  const key = getCacheKey(userId, ownerId);
  delete cache[key];
  loadedFromStorage.delete(key);
  
  try {
    await AsyncStorage.removeItem(getStorageKey(key));
  } catch (error) {
    console.warn('[NotificationsCache] Error clearing storage:', error);
  }
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
  Object.keys(cache).forEach(key => delete cache[key]);
  loadedFromStorage.clear();
  
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(k => k.startsWith(STORAGE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch (error) {
    console.warn('[NotificationsCache] Error clearing all storage:', error);
  }
}

/**
 * Update cache timestamp (mark as fresh without refetching)
 */
export function touchCache(userId: string, ownerId: string): void {
  const key = getCacheKey(userId, ownerId);
  if (cache[key]) {
    cache[key].timestamp = Date.now();
    // Also update storage
    persistToStorage(key, cache[key]);
  }
}

