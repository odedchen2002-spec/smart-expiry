/**
 * Expiry Events Service
 * 
 * Handles Level B savings tracking (A3):
 * - Log outcomes when user handles expiring items
 * - Track auto-archival of expired items
 * - Preserve history for reports (no hard delete)
 * 
 * Event Types:
 * - SOLD_FINISHED: Item was sold or used before expiry
 * - THROWN: Item was thrown away / disposed
 * - UPDATED_DATE: Expiry date was corrected (new batch created)
 * - EXPIRED_AUTO_ARCHIVED: System automatically archived expired item
 * 
 * Note: This table uses `store_id` (not `owner_id`).
 * See src/lib/supabase/ownerUtils.ts for naming convention documentation.
 */

import { supabase } from '../client';
import type { Database, ExpiryEventType, ExpiryEventSource, Json } from '@/types/database';

type ExpiryEvent = Database['public']['Tables']['expiry_events']['Row'];
type ExpiryEventInsert = Database['public']['Tables']['expiry_events']['Insert'];

export interface LogEventParams {
  storeId: string;
  batchId?: string | null;
  barcode?: string | null;
  productName?: string | null;
  eventType: ExpiryEventType;
  eventSource?: ExpiryEventSource;
  metadata?: Record<string, any> | null;
}

/**
 * Log an expiry event for Level B savings tracking.
 * 
 * @param params - Event parameters
 * @returns The created event ID, or null on error
 */
export async function logExpiryEvent(params: LogEventParams): Promise<string | null> {
  const {
    storeId,
    batchId,
    barcode,
    productName,
    eventType,
    eventSource = 'user',
    metadata,
  } = params;

  if (!storeId || !eventType) {
    console.error('[expiryEventsService] logExpiryEvent: Missing required parameters');
    return null;
  }

  try {
    const insertData: ExpiryEventInsert = {
      store_id: storeId,
      batch_id: batchId || null,
      barcode: barcode || null,
      product_name: productName || null,
      event_type: eventType,
      event_source: eventSource,
      metadata: metadata as Json || null,
    };

    const { data, error } = await supabase
      .from('expiry_events')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error('[expiryEventsService] Error logging event:', error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error('[expiryEventsService] Error logging event:', error);
    return null;
  }
}

/**
 * Log a SOLD_FINISHED event when item was sold or fully used.
 */
export async function logSoldFinished(
  storeId: string,
  batchId: string,
  barcode?: string,
  productName?: string
): Promise<string | null> {
  return logExpiryEvent({
    storeId,
    batchId,
    barcode,
    productName,
    eventType: 'SOLD_FINISHED',
    eventSource: 'user',
  });
}

/**
 * Log a THROWN event when item was disposed.
 */
export async function logThrown(
  storeId: string,
  batchId: string,
  barcode?: string,
  productName?: string
): Promise<string | null> {
  return logExpiryEvent({
    storeId,
    batchId,
    barcode,
    productName,
    eventType: 'THROWN',
    eventSource: 'user',
  });
}

/**
 * Log an UPDATED_DATE event when expiry date was corrected.
 * This typically accompanies creation of a new batch.
 */
export async function logUpdatedDate(
  storeId: string,
  originalBatchId: string,
  newBatchId: string,
  barcode?: string,
  productName?: string,
  oldExpiryDate?: string,
  newExpiryDate?: string
): Promise<string | null> {
  return logExpiryEvent({
    storeId,
    batchId: originalBatchId,
    barcode,
    productName,
    eventType: 'UPDATED_DATE',
    eventSource: 'user',
    metadata: {
      new_batch_id: newBatchId,
      old_expiry_date: oldExpiryDate,
      new_expiry_date: newExpiryDate,
    },
  });
}

/**
 * Log an EXPIRED_AUTO_ARCHIVED event when system removes expired items.
 * Called before deleting/archiving items during auto-cleanup.
 */
export async function logExpiredAutoArchived(
  storeId: string,
  batchId: string,
  barcode?: string,
  productName?: string,
  expiryDate?: string
): Promise<string | null> {
  return logExpiryEvent({
    storeId,
    batchId,
    barcode,
    productName,
    eventType: 'EXPIRED_AUTO_ARCHIVED',
    eventSource: 'system',
    metadata: expiryDate ? { expiry_date: expiryDate } : null,
  });
}

/**
 * Log multiple EXPIRED_AUTO_ARCHIVED events for batch cleanup.
 * More efficient than calling logExpiredAutoArchived for each item.
 */
export async function logExpiredAutoArchivedBatch(
  storeId: string,
  items: Array<{
    batchId: string;
    barcode?: string;
    productName?: string;
    expiryDate?: string;
  }>
): Promise<number> {
  if (!storeId || !items || items.length === 0) {
    return 0;
  }

  try {
    const insertData: ExpiryEventInsert[] = items.map((item) => ({
      store_id: storeId,
      batch_id: item.batchId,
      barcode: item.barcode || null,
      product_name: item.productName || null,
      event_type: 'EXPIRED_AUTO_ARCHIVED' as ExpiryEventType,
      event_source: 'system' as ExpiryEventSource,
      metadata: item.expiryDate ? ({ expiry_date: item.expiryDate } as Json) : null,
    }));

    const { data, error } = await supabase
      .from('expiry_events')
      .insert(insertData)
      .select('id');

    if (error) {
      console.error('[expiryEventsService] Error logging batch events:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('[expiryEventsService] Error logging batch events:', error);
    return 0;
  }
}

/**
 * Get expiry events for a store, optionally filtered by type and date range.
 * Useful for generating savings reports.
 */
export async function getExpiryEvents(
  storeId: string,
  options?: {
    eventTypes?: ExpiryEventType[];
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<ExpiryEvent[]> {
  if (!storeId) {
    return [];
  }

  try {
    let query = supabase
      .from('expiry_events')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (options?.eventTypes && options.eventTypes.length > 0) {
      query = query.in('event_type', options.eventTypes);
    }

    if (options?.startDate) {
      query = query.gte('created_at', options.startDate);
    }

    if (options?.endDate) {
      query = query.lte('created_at', options.endDate);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[expiryEventsService] Error fetching events:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[expiryEventsService] Error fetching events:', error);
    return [];
  }
}

/**
 * Get summary statistics for expiry events.
 * Useful for dashboard displays.
 */
export async function getExpiryEventsSummary(
  storeId: string,
  options?: {
    startDate?: string;
    endDate?: string;
  }
): Promise<{
  soldCount: number;
  thrownCount: number;
  updatedCount: number;
  autoArchivedCount: number;
  totalCount: number;
}> {
  if (!storeId) {
    return { soldCount: 0, thrownCount: 0, updatedCount: 0, autoArchivedCount: 0, totalCount: 0 };
  }

  try {
    let query = supabase
      .from('expiry_events')
      .select('event_type')
      .eq('store_id', storeId);

    if (options?.startDate) {
      query = query.gte('created_at', options.startDate);
    }

    if (options?.endDate) {
      query = query.lte('created_at', options.endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[expiryEventsService] Error fetching summary:', error);
      return { soldCount: 0, thrownCount: 0, updatedCount: 0, autoArchivedCount: 0, totalCount: 0 };
    }

    const events = data || [];
    const counts = {
      soldCount: events.filter((e) => e.event_type === 'SOLD_FINISHED').length,
      thrownCount: events.filter((e) => e.event_type === 'THROWN').length,
      updatedCount: events.filter((e) => e.event_type === 'UPDATED_DATE').length,
      autoArchivedCount: events.filter((e) => e.event_type === 'EXPIRED_AUTO_ARCHIVED').length,
      totalCount: events.length,
    };

    return counts;
  } catch (error) {
    console.error('[expiryEventsService] Error fetching summary:', error);
    return { soldCount: 0, thrownCount: 0, updatedCount: 0, autoArchivedCount: 0, totalCount: 0 };
  }
}

