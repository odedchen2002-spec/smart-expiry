/**
 * Offline queue service for storing pending operations
 * Stores items locally when offline and syncs them when back online
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase/client';
import { itemEvents } from '@/lib/events/itemEvents';
import { checkNetworkStatus } from '@/lib/hooks/useNetworkStatus';

const OFFLINE_QUEUE_KEY = 'offline_queue';
const PENDING_ITEMS_KEY = 'pending_items';

export interface PendingItem {
  id: string; // Local ID for tracking
  type: 'add_item';
  data: {
    name: string;
    barcode?: string | null;
    expiry_date: string;
    quantity: number;
    owner_id: string;
    location_id?: string | null;
    category_name?: string | null;
    notes?: string | null;
  };
  createdAt: string;
  retryCount: number;
}

interface OfflineQueue {
  items: PendingItem[];
  lastSyncAttempt: string | null;
}

// In-memory cache for faster access
let queueCache: OfflineQueue | null = null;

// Listeners for queue changes
type QueueChangeListener = (queue: OfflineQueue) => void;
const listeners: Set<QueueChangeListener> = new Set();

export function addQueueChangeListener(listener: QueueChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(queue: OfflineQueue) {
  listeners.forEach(listener => listener(queue));
}

async function loadQueue(): Promise<OfflineQueue> {
  if (queueCache) {
    return queueCache;
  }

  try {
    const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (stored) {
      queueCache = JSON.parse(stored);
      return queueCache!;
    }
  } catch (error) {
    console.error('[OfflineQueue] Error loading queue:', error);
  }

  queueCache = { items: [], lastSyncAttempt: null };
  return queueCache;
}

async function saveQueue(queue: OfflineQueue): Promise<void> {
  queueCache = queue;
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    notifyListeners(queue);
  } catch (error) {
    console.error('[OfflineQueue] Error saving queue:', error);
  }
}

/**
 * Add an item to the offline queue
 */
export async function addToOfflineQueue(item: Omit<PendingItem, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
  const queue = await loadQueue();
  
  const pendingItem: PendingItem = {
    ...item,
    id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  queue.items.push(pendingItem);
  await saveQueue(queue);
  
  console.log('[OfflineQueue] Added item to queue:', pendingItem.id);
  return pendingItem.id;
}

/**
 * Get all pending items in the queue
 */
export async function getPendingItems(): Promise<PendingItem[]> {
  const queue = await loadQueue();
  return queue.items;
}

/**
 * Get count of pending items
 */
export async function getPendingCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.items.length;
}

/**
 * Remove an item from the queue (after successful sync)
 */
export async function removeFromQueue(itemId: string): Promise<void> {
  const queue = await loadQueue();
  queue.items = queue.items.filter(item => item.id !== itemId);
  await saveQueue(queue);
  console.log('[OfflineQueue] Removed item from queue:', itemId);
}

/**
 * Update retry count for an item
 */
export async function incrementRetryCount(itemId: string): Promise<void> {
  const queue = await loadQueue();
  const item = queue.items.find(i => i.id === itemId);
  if (item) {
    item.retryCount++;
    await saveQueue(queue);
  }
}

/**
 * Clear all items from the queue
 */
export async function clearOfflineQueue(): Promise<void> {
  queueCache = { items: [], lastSyncAttempt: null };
  await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  notifyListeners(queueCache);
  console.log('[OfflineQueue] Cleared queue');
}

/**
 * Sync all pending items to the server
 * Returns number of successfully synced items
 */
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  // Check if online
  try {
    const isOnline = await checkNetworkStatus();
    if (!isOnline) {
      console.log('[OfflineQueue] Cannot sync - offline');
      return { synced: 0, failed: 0 };
    }
  } catch (error) {
    console.warn('[OfflineQueue] Error checking network, attempting sync anyway:', error);
  }

  const queue = await loadQueue();
  if (queue.items.length === 0) {
    return { synced: 0, failed: 0 };
  }

  console.log('[OfflineQueue] Starting sync of', queue.items.length, 'items');
  
  let synced = 0;
  let failed = 0;

  // Process items in order (FIFO)
  for (const item of [...queue.items]) {
    try {
      if (item.type === 'add_item') {
        // Step 1: Get or create default location
        let locationId: string | null = null;
        try {
          // Try to find an existing location
          const { data: existingLocation } = await supabase
            .from('locations')
            .select('id')
            .eq('owner_id', item.data.owner_id)
            .limit(1)
            .maybeSingle();
          
          if (existingLocation?.id) {
            locationId = existingLocation.id;
          } else {
            // Create default location
            const { data: newLocation, error: locError } = await supabase
              .from('locations')
              .insert({
                owner_id: item.data.owner_id,
                name: 'Default',
                display_order: 0,
              } as any)
              .select('id')
              .single();
            
            if (locError) throw locError;
            locationId = newLocation?.id || null;
          }
        } catch (locErr) {
          console.error('[OfflineQueue] Error getting/creating location:', locErr);
          // Continue anyway - some items might not require location
        }

        // Step 2: Create or get product
        let productId: string | null = null;
        try {
          if (item.data.barcode) {
            // Check if product with this barcode exists
            const { data: existingProduct } = await supabase
              .from('products')
              .select('id')
              .eq('owner_id', item.data.owner_id)
              .eq('barcode', item.data.barcode)
              .limit(1);
            
            if (existingProduct && existingProduct.length > 0) {
              productId = existingProduct[0].id;
            } else {
              // Create new product
              const { data: newProduct, error: prodError } = await supabase
                .from('products')
                .insert({
                  owner_id: item.data.owner_id,
                  name: item.data.name,
                  barcode: item.data.barcode,
                  category: item.data.category_name,
                })
                .select('id')
                .single();
              
              if (prodError) throw prodError;
              productId = newProduct?.id || null;
            }
          } else {
            // No barcode - create product by name
            const { data: newProduct, error: prodError } = await supabase
              .from('products')
              .insert({
                owner_id: item.data.owner_id,
                name: item.data.name,
                barcode: null,
                category: item.data.category_name,
              })
              .select('id')
              .single();
            
            if (prodError) throw prodError;
            productId = newProduct?.id || null;
          }
        } catch (prodErr) {
          console.error('[OfflineQueue] Error creating product:', prodErr);
          await incrementRetryCount(item.id);
          failed++;
          continue;
        }

        // Step 3: Create item (status will use database default)
        const { error: itemError } = await supabase.from('items').insert({
          owner_id: item.data.owner_id,
          product_id: productId,
          expiry_date: item.data.expiry_date,
          location_id: locationId,
          barcode_snapshot: item.data.barcode || null,
          is_plan_locked: false, // Default to unlocked for offline items
        } as any);

        if (itemError) {
          console.error('[OfflineQueue] Error syncing item:', item.id, itemError);
          await incrementRetryCount(item.id);
          failed++;
          
          // Remove item after 5 failed attempts
          if (item.retryCount >= 5) {
            console.log('[OfflineQueue] Removing item after 5 failed attempts:', item.id);
            await removeFromQueue(item.id);
          }
        } else {
          await removeFromQueue(item.id);
          synced++;
          console.log('[OfflineQueue] Successfully synced item:', item.id);
        }
      }
    } catch (error) {
      console.error('[OfflineQueue] Exception syncing item:', item.id, error);
      await incrementRetryCount(item.id);
      failed++;
    }
  }

  // Update last sync attempt
  const updatedQueue = await loadQueue();
  updatedQueue.lastSyncAttempt = new Date().toISOString();
  await saveQueue(updatedQueue);

  console.log('[OfflineQueue] Sync complete:', { synced, failed });
  
  // Notify UI that items have been synced
  if (synced > 0) {
    itemEvents.emit();
  }
  
  return { synced, failed };
}

/**
 * Initialize the offline queue system
 * Sets up auto-sync when app becomes active (and online)
 */
let isInitialized = false;
let appStateSubscription: { remove: () => void } | null = null;
let lastAppState: AppStateStatus = 'active';

export function initOfflineQueue(): void {
  if (isInitialized) {
    return;
  }

  isInitialized = true;
  lastAppState = AppState.currentState;
  
  // Listen for app state changes and auto-sync when coming to foreground
  appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
    // When app comes to foreground, check network and sync
    if (
      lastAppState.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // Small delay to ensure app is fully active
      setTimeout(async () => {
        try {
          const isOnline = await checkNetworkStatus();
          if (isOnline) {
            const { synced } = await syncOfflineQueue();
            if (synced > 0) {
              console.log('[OfflineQueue] Auto-synced', synced, 'items after coming online');
            }
          }
        } catch (error) {
          console.warn('[OfflineQueue] Error during auto-sync:', error);
        }
      }, 1000);
    }
    lastAppState = nextAppState;
  });

  // Also try to sync immediately on init (in case there are pending items)
  setTimeout(async () => {
    const { synced } = await syncOfflineQueue();
    if (synced > 0) {
      console.log('[OfflineQueue] Synced', synced, 'pending items on init');
    }
  }, 2000);

  console.log('[OfflineQueue] Initialized');
}

export function cleanupOfflineQueue(): void {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  isInitialized = false;
}

