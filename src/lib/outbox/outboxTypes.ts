/**
 * Outbox Types - Persistent mutation queue for offline-first writes
 */

import type { ItemsScope } from '@/hooks/queries/useItemsQuery';

/**
 * Outbox entry representing a queued mutation
 */
export interface OutboxEntry {
  // Core identification
  id: string; // UUID - unique identifier for this outbox entry
  type: 'createItem' | 'updateItem' | 'deleteItem' | 'bulkCreate';
  payload: any; // Mutation variables (type depends on 'type')

  // Idempotency & Sequencing
  clientRequestId?: string; // UUID - for create operations only (idempotency key)
  localItemKey: string; // UUID - stable key for item lifecycle (survives tempId→realId)
  entityKey: string; // Sequencing group key (= localItemKey for items)
  tempId?: string; // Temporary ID for optimistic item (e.g., "temp_123_abc")

  // Metadata
  createdAt: number; // Timestamp in ms (for FIFO ordering)
  attempts: number; // Retry counter
  lastAttemptAt: number | null; // Timestamp of last attempt in ms
  lastError: string | null; // Error message from last failed attempt
  status: OutboxEntryStatus;

  // Context for cache reconciliation
  ownerId?: string; // Owner ID for query invalidation
  scope?: ItemsScope; // Scope for cache updates (all, expired, etc.)
}

/**
 * Outbox entry status
 */
export type OutboxEntryStatus = 'pending' | 'processing' | 'failed' | 'paused';

/**
 * Result of processing outbox
 */
export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * Outbox statistics for UI
 */
export interface OutboxStats {
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  pausedCount: number;
  totalCount: number;
}
