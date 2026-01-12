/**
 * Items queries for Supabase
 * Updated to use owner_id instead of business_id
 */

import type { Database } from '@/types/database';
import { supabase } from '../client';

export type ItemWithDetails = Database['public']['Views']['items_with_details']['Row'];

export interface ItemsQueryOptions {
  ownerId: string;
  status?: 'ok' | 'soon' | 'expired' | 'resolved';
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  limit?: number;
}

/**
 * Get items with optional filters
 */
export async function getItems(options: ItemsQueryOptions): Promise<ItemWithDetails[]> {
  const {
    ownerId,
    status,
    startDate,
    endDate,
    limit = 100,
  } = options;

  // Query items_with_details view using owner_id (single source of truth for item+product+location fields)
  let query = supabase
    .from('items_with_details')
    .select('*')
    .eq('owner_id', ownerId)
    .order('expiry_date', { ascending: true })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  if (startDate) {
    query = query.gte('expiry_date', startDate);
  }

  if (endDate) {
    query = query.lte('expiry_date', endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching items:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // DEBUG: Check if is_plan_locked exists
  if (data.length > 0) {
    console.log('[getItems] Sample item:', {
      id: data[0].id,
      product_name: data[0].product_name,
      is_plan_locked: data[0].is_plan_locked,
      has_is_plan_locked: 'is_plan_locked' in data[0]
    });
  }

  // Filter out items with empty or placeholder names (cleanup of legacy data)
  const validItems = data.filter((item: any) => {
    const name = item.product_name;
    if (!name) return false;
    const trimmed = name.trim();
    // Filter out empty names and common placeholder values
    return trimmed.length > 0 && trimmed !== '—' && trimmed !== '--' && trimmed !== '---';
  });

  return validItems as any;
}

/**
 * Get items expiring today
 */
export async function getItemsExpiringToday(ownerId: string) {
  const today = new Date();
  // Use local timezone date instead of UTC to avoid timezone bugs
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const items = await getItems({
    ownerId,
    startDate: todayStr,
    endDate: todayStr,
    limit: 50000,
  });
  return items.filter(item => item.status !== 'resolved');
}

/**
 * Get items expiring tomorrow
 */
export async function getItemsExpiringTomorrow(ownerId: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Use local timezone date instead of UTC to avoid timezone bugs
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  return getItems({
    ownerId,
    startDate: tomorrowStr,
    endDate: tomorrowStr,
    limit: 50000,
  }).then(items => items.filter(item => item.status !== 'resolved'));
}

/**
 * Get items expiring in the next 7 days
 */
export async function getItemsExpiringNextWeek(ownerId: string) {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  // Use local timezone date instead of UTC to avoid timezone bugs
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;

  return getItems({
    ownerId,
    startDate: todayStr,
    endDate: nextWeekStr,
    limit: 50000,
  }).then(items => items.filter(item => item.status !== 'resolved'));
}

/**
 * Get all active items (not resolved)
 */
export async function getAllItems(ownerId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Use local timezone date instead of UTC to avoid timezone bugs
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  console.log('[getAllItems] Today (local timezone):', todayISO, '| Filtering logic: expiry_date < today will be EXCLUDED from "All" screen');

  // CRITICAL FIX: Supabase has a max-rows limit (default 1000) that cannot be bypassed with range()
  // We need to fetch data in chunks of 1000 and combine them

  const CHUNK_SIZE = 1000;
  const MAX_ITEMS = 50000;
  let allData: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore && offset < MAX_ITEMS) {
    const { data: chunk, error: chunkError } = await supabase
      .from('items_with_details')
      .select('*')
      .eq('owner_id', ownerId)
      .order('expiry_date', { ascending: true })
      .range(offset, offset + CHUNK_SIZE - 1);

    if (chunkError) {
      console.error('Error fetching items chunk:', chunkError);
      throw chunkError;
    }

    if (!chunk || chunk.length === 0) {
      hasMore = false;
      break;
    }

    allData = allData.concat(chunk);

    // If we got less than CHUNK_SIZE, we've reached the end
    if (chunk.length < CHUNK_SIZE) {
      hasMore = false;
    } else {
      offset += CHUNK_SIZE;
    }
  }

  const data = allData;

  if (!data || data.length === 0) {
    return [];
  }

  console.log('[getAllItems] Total items fetched from DB:', data.length);

  // Filter in-memory (more efficient than multiple DB queries)
  const filtered = (data as ItemWithDetails[]).filter(item => {
    // Exclude resolved items
    if (item.status === 'resolved') return false;
    // Exclude expired items (by status or by expiry_date)
    if (item.status === 'expired') return false;
    // Also check expiry_date in case status is not set correctly
    // Items expiring TODAY (0 days left) should appear in "All" screen
    if (item.expiry_date && item.expiry_date < todayISO) return false;
    return true;
  });
  
  const excludedByExpiry = (data as ItemWithDetails[]).filter(item => 
    item.expiry_date && item.expiry_date < todayISO && item.status !== 'resolved'
  ).length;
  
  console.log('[getAllItems] Filtered out', excludedByExpiry, 'items with expiry_date < today');
  console.log('[getAllItems] Before deduplication:', filtered.length);
  
  // Deduplicate items by ID (fix for duplicate items in cache/DB)
  const seenIds = new Set<string>();
  const deduplicated: ItemWithDetails[] = [];
  const duplicateIds: string[] = [];
  
  for (const item of filtered) {
    if (item.id && seenIds.has(item.id)) {
      duplicateIds.push(item.id);
    } else if (item.id) {
      seenIds.add(item.id);
      deduplicated.push(item);
    }
  }
  
  if (duplicateIds.length > 0) {
    console.warn('[getAllItems] ⚠️ Removed', duplicateIds.length, 'duplicate items:', duplicateIds);
  }
  
  console.log('[getAllItems] Final count for "All" screen:', deduplicated.length);
  
  // Show sample of excluded items for debugging
  const excludedSample = (data as ItemWithDetails[])
    .filter(item => item.expiry_date && item.expiry_date < todayISO && item.status !== 'resolved')
    .slice(0, 3)
    .map(item => ({ id: item.id, name: item.product_name?.substring(0, 20), expiry: item.expiry_date }));
  if (excludedSample.length > 0) {
    console.log('[getAllItems] Sample excluded items:', excludedSample);
  }
  
  return deduplicated;
}

/**
 * Get expired items (expiry_date < today)
 * Sorted by expiry_date ascending (oldest first)
 * Excludes resolved items (sold/disposed/other)
 * NOTE: Items expiring TODAY (0 days left) appear in "All" screen, not here
 */
export async function getExpiredItems(ownerId: string): Promise<ItemWithDetails[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Use local timezone date instead of UTC to avoid timezone bugs
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  console.log('[getExpiredItems] Today (local timezone):', todayISO, '| Query: expiry_date < today (excludes items expiring TODAY)');

  const { data, error } = await supabase
    .from('items_with_details')
    .select('*')
    .eq('owner_id', ownerId)
    .lt('expiry_date', todayISO) // Changed from .lte to .lt - items expiring TODAY go to "All" screen
    .neq('status', 'resolved')
    .order('expiry_date', { ascending: true })
    .range(0, 49999); // Use range instead of limit to bypass PostgREST 1000 limit

  if (error) {
    console.error('Error fetching expired items:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    console.log('[getExpiredItems] No expired items found');
    return [];
  }
  
  console.log('[getExpiredItems] Found', data.length, 'expired items (expiry_date < today)');
  
  // Show sample for debugging
  const sample = data.slice(0, 3).map(item => ({ 
    id: item.id, 
    name: item.product_name?.substring(0, 20), 
    expiry: item.expiry_date 
  }));
  console.log('[getExpiredItems] Sample:', sample);
  
  return data as any;
}

/**
 * Get a single item by ID
 * Uses the same items_with_details view as the list queries for consistency
 */
export async function getItemById(itemId: string, ownerId: string): Promise<ItemWithDetails> {
  // Use items_with_details view for consistency with list queries
  const { data: item, error: itemError } = await supabase
    .from('items_with_details')
    .select('*')
    .eq('id', itemId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (itemError) {
    console.error('Error fetching item:', itemError);
    throw itemError;
  }

  if (!item) {
    // Try fetching without owner_id to check if it's an ownership mismatch
    const { data: itemWithoutOwner } = await supabase
      .from('items_with_details')
      .select('id, owner_id')
      .eq('id', itemId)
      .maybeSingle();

    if (itemWithoutOwner) {
      console.warn(`Item ${itemId} exists but belongs to owner ${itemWithoutOwner.owner_id}, not ${ownerId}`);
    }

    throw new Error('Item not found');
  }

  return item as ItemWithDetails;
}
