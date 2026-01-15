/**
 * Statistics Service
 * 
 * Handles statistics for the Statistics screen:
 * - Get handled vs thrown counts
 * - Get top thrown products
 * - Reset statistics
 */

import { supabase } from '../client';


export interface StatisticsSummary {
  handledCount: number; // SOLD_FINISHED events
  thrownCount: number;  // THROWN events
  totalCount: number;
}

export interface TopThrownProduct {
  productName: string;
  rank: number;
}

export interface ThrownProductEvent {
  productName: string;
  thrownAt: string | null; // ISO date string (nullable from DB)
}

/**
 * Get the start of the current month in ISO format
 */
function getMonthStartDate(): string {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return monthStart.toISOString();
}

/**
 * Get the start of the current year in ISO format
 */
function getYearStartDate(): string {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1); // January 1st
  return yearStart.toISOString();
}

export type TimeRange = 'month' | 'year' | 'all';

/**
 * Get statistics summary (handled vs thrown) for a store
 * 
 * FIXED: Uses chunking to bypass Supabase 1000-row limit
 * 
 * @param storeId - The store ID to get statistics for
 * @param timeRange - Time range to filter: 'month' (this month), 'year' (this year), 'all' (all time)
 * @returns Statistics summary
 */
export async function getStatisticsSummary(
  storeId: string,
  timeRange: TimeRange = 'all'
): Promise<StatisticsSummary> {
  if (!storeId) {
    return { handledCount: 0, thrownCount: 0, totalCount: 0 };
  }

  try {
    // Fetch all events in chunks to bypass 1000-row limit
    const CHUNK_SIZE = 1000;
    const MAX_EVENTS = 50000;
    let allEvents: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && offset < MAX_EVENTS) {
      let query = supabase
        .from('expiry_events')
        .select('event_type')
        .eq('store_id', storeId)
        .in('event_type', ['SOLD_FINISHED', 'THROWN'])
        .order('created_at', { ascending: false })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (timeRange === 'month') {
        query = query.gte('created_at', getMonthStartDate());
      } else if (timeRange === 'year') {
        query = query.gte('created_at', getYearStartDate());
      }

      const { data: chunk, error: chunkError } = await query;

      if (chunkError) {
        console.error('[statisticsService] Error fetching summary chunk:', chunkError);
        throw chunkError;
      }

      if (!chunk || chunk.length === 0) {
        hasMore = false;
        break;
      }

      allEvents = allEvents.concat(chunk);

      // If we got less than CHUNK_SIZE, we've reached the end
      if (chunk.length < CHUNK_SIZE) {
        hasMore = false;
      } else {
        offset += CHUNK_SIZE;
      }
    }

    const handledCount = allEvents.filter((e) => e.event_type === 'SOLD_FINISHED').length;
    const thrownCount = allEvents.filter((e) => e.event_type === 'THROWN').length;

    return {
      handledCount,
      thrownCount,
      totalCount: handledCount + thrownCount,
    };
  } catch (error) {
    console.error('[statisticsService] Error fetching summary:', error);
    return { handledCount: 0, thrownCount: 0, totalCount: 0 };
  }
}

/**
 * Get top thrown products (by frequency, not by count)
 * Returns products ranked by how many times they were thrown
 * 
 * FIXED: Uses chunking to bypass Supabase 1000-row limit
 * 
 * @param storeId - The store ID to get statistics for
 * @param timeRange - Time range to filter: 'month' (this month), 'year' (this year), 'all' (all time)
 * @param limit - Maximum number of products to return (default 10)
 * @returns Array of top thrown products with rank
 */
export async function getTopThrownProducts(
  storeId: string,
  timeRange: TimeRange = 'all',
  limit: number = 10
): Promise<TopThrownProduct[]> {
  if (!storeId) {
    return [];
  }

  try {
    // Fetch all THROWN events in chunks to bypass 1000-row limit
    const CHUNK_SIZE = 1000;
    const MAX_EVENTS = 50000;
    let allEvents: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && offset < MAX_EVENTS) {
      let query = supabase
        .from('expiry_events')
        .select('product_name')
        .eq('store_id', storeId)
        .eq('event_type', 'THROWN')
        .not('product_name', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (timeRange === 'month') {
        query = query.gte('created_at', getMonthStartDate());
      } else if (timeRange === 'year') {
        query = query.gte('created_at', getYearStartDate());
      }

      const { data: chunk, error: chunkError } = await query;

      if (chunkError) {
        console.error('[statisticsService] Error fetching top thrown products chunk:', chunkError);
        throw chunkError;
      }

      if (!chunk || chunk.length === 0) {
        hasMore = false;
        break;
      }

      allEvents = allEvents.concat(chunk);

      // If we got less than CHUNK_SIZE, we've reached the end
      if (chunk.length < CHUNK_SIZE) {
        hasMore = false;
      } else {
        offset += CHUNK_SIZE;
      }
    }

    if (allEvents.length === 0) {
      return [];
    }

    // Count occurrences of each product name
    const productCounts: Record<string, number> = {};
    allEvents.forEach((event) => {
      const name = event.product_name || '';
      if (name) {
        productCounts[name] = (productCounts[name] || 0) + 1;
      }
    });

    // Sort by count (descending) and take top N
    const sorted = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    // Return with rank (no count displayed per requirements)
    return sorted.map(([productName], index) => ({
      productName,
      rank: index + 1,
    }));
  } catch (error) {
    console.error('[statisticsService] Error fetching top thrown products:', error);
    return [];
  }
}

/**
 * Get all thrown products for a store
 * Returns all thrown product events with product name and date
 * 
 * FIXED: Uses chunking to bypass Supabase 1000-row limit
 * 
 * @param storeId - The store ID to get events for
 * @param timeRange - Time range to filter: 'month' (this month), 'year' (this year), 'all' (all time)
 * @returns Array of thrown product events
 */
export async function getThrownProductsList(
  storeId: string,
  timeRange: TimeRange = 'all'
): Promise<ThrownProductEvent[]> {
  if (!storeId) {
    return [];
  }

  try {
    // Fetch all THROWN events in chunks to bypass 1000-row limit
    const CHUNK_SIZE = 1000;
    const MAX_EVENTS = 50000;
    let allEvents: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && offset < MAX_EVENTS) {
      let query = supabase
        .from('expiry_events')
        .select('product_name, created_at')
        .eq('store_id', storeId)
        .eq('event_type', 'THROWN')
        .not('product_name', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (timeRange === 'month') {
        query = query.gte('created_at', getMonthStartDate());
      } else if (timeRange === 'year') {
        query = query.gte('created_at', getYearStartDate());
      }

      const { data: chunk, error: chunkError } = await query;

      if (chunkError) {
        console.error('[statisticsService] Error fetching thrown products list chunk:', chunkError);
        throw chunkError;
      }

      if (!chunk || chunk.length === 0) {
        hasMore = false;
        break;
      }

      allEvents = allEvents.concat(chunk);

      // If we got less than CHUNK_SIZE, we've reached the end
      if (chunk.length < CHUNK_SIZE) {
        hasMore = false;
      } else {
        offset += CHUNK_SIZE;
      }
    }

    if (allEvents.length === 0) {
      return [];
    }

    return allEvents.map((event) => ({
      productName: event.product_name || '',
      thrownAt: event.created_at,
    }));
  } catch (error) {
    console.error('[statisticsService] Error fetching thrown products list:', error);
    return [];
  }
}

/**
 * Reset all statistics for a store
 * This deletes all expiry_events for the store
 * 
 * @param storeId - The store ID to reset statistics for
 * @returns true if successful, false otherwise
 */
export async function resetStatistics(storeId: string): Promise<boolean> {
  if (!storeId) {
    console.error('[statisticsService] resetStatistics: Missing storeId');
    return false;
  }

  try {
    const { error } = await supabase
      .from('expiry_events')
      .delete()
      .eq('store_id', storeId);

    if (error) {
      console.error('[statisticsService] Error resetting statistics:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[statisticsService] Error resetting statistics:', error);
    return false;
  }
}

/**
 * Reset monthly statistics for a store
 * This deletes only expiry_events from the current month
 * 
 * @param storeId - The store ID to reset statistics for
 * @returns true if successful, false otherwise
 */
export async function resetMonthStatistics(storeId: string): Promise<boolean> {
  if (!storeId) {
    console.error('[statisticsService] resetMonthStatistics: Missing storeId');
    return false;
  }

  try {
    const { error } = await supabase
      .from('expiry_events')
      .delete()
      .eq('store_id', storeId)
      .gte('created_at', getMonthStartDate());

    if (error) {
      console.error('[statisticsService] Error resetting month statistics:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[statisticsService] Error resetting month statistics:', error);
    return false;
  }
}

/**
 * Reset yearly statistics for a store
 * This deletes only expiry_events from the current year
 * 
 * @param storeId - The store ID to reset statistics for
 * @returns true if successful, false otherwise
 */
export async function resetYearStatistics(storeId: string): Promise<boolean> {
  if (!storeId) {
    console.error('[statisticsService] resetYearStatistics: Missing storeId');
    return false;
  }

  try {
    const { error } = await supabase
      .from('expiry_events')
      .delete()
      .eq('store_id', storeId)
      .gte('created_at', getYearStartDate());

    if (error) {
      console.error('[statisticsService] Error resetting year statistics:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[statisticsService] Error resetting year statistics:', error);
    return false;
  }
}
