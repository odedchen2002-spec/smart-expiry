/**
 * Outbox Processor - Background processor for queued mutations
 * 
 * Architecture:
 * - Dependency injection (no globals)
 * - Sequential processing per entityKey (FIFO)
 * - Parallel across entities (max 3 concurrent)
 * - Exponential backoff with max 5 attempts
 * - Pause on 4xx errors (except 408/429)
 * - Reconcile cache directly after success/failure
 */

import type { QueryClient } from '@tanstack/react-query';
import { v4 as uuid } from 'uuid';
import * as itemsApi from '@/data/itemsApi';
import { OutboxStorage } from './outboxStorage';
import type { OutboxEntry, ProcessResult } from './outboxTypes';
import type { ItemsScope } from '@/lib/hooks/useItems';

/**
 * Dependencies for OutboxProcessor (injected)
 */
export interface OutboxProcessorDeps {
  queryClient: QueryClient;
  outboxStorage: OutboxStorage;
  itemsApi: typeof itemsApi;
  getOwnerId: () => string | null;
  showToast?: (message: string, type: 'success' | 'error') => void;
  logger?: {
    info: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };
}

/**
 * Outbox Processor
 */
export class OutboxProcessor {
  private queryClient: QueryClient;
  private outboxStorage: OutboxStorage;
  private itemsApi: typeof itemsApi;
  private getOwnerId: () => string | null;
  private showToast: (message: string, type: 'success' | 'error') => void;
  private logger: NonNullable<OutboxProcessorDeps['logger']>;

  // Processing state
  private isProcessing = false;
  private abortController: AbortController | null = null;

  // In-memory mapping: localItemKey → realId
  // Rebuilt on app start, populated during create reconciliation
  private localKeyToIdMap = new Map<string, string>();

  constructor(deps: OutboxProcessorDeps) {
    this.queryClient = deps.queryClient;
    this.outboxStorage = deps.outboxStorage;
    this.itemsApi = deps.itemsApi;
    this.getOwnerId = deps.getOwnerId;
    this.showToast = deps.showToast || (() => {});
    this.logger = deps.logger || console;
  }

  /**
   * Process all pending entries
   */
  async process(): Promise<ProcessResult> {
    // Prevent concurrent processing
    if (this.isProcessing) {
      this.logger.info('[Outbox] Already processing, skipping');
      return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    try {
      const ownerId = this.getOwnerId();
      if (!ownerId) {
        this.logger.info('[Outbox] No active owner, skipping processing');
        return { processed, succeeded, failed, skipped };
      }

      // Get entries grouped by entityKey
      const grouped = await this.outboxStorage.getGroupedByEntity();
      const entityKeys = Object.keys(grouped);

      if (entityKeys.length === 0) {
        return { processed, succeeded, failed, skipped };
      }

      this.logger.info('Processing %d entities', entityKeys.length);

      // Process entities in parallel (max 3 concurrent)
      await this.processConcurrent(entityKeys, 3, async (entityKey) => {
        const entries = grouped[entityKey];
        
        // Process entries for this entity SEQUENTIALLY
        for (const entry of entries) {
          if (this.abortController?.signal.aborted) {
            skipped++;
            continue;
          }

          const result = await this.processEntry(entry, ownerId);
          processed++;
          
          if (result === 'success') succeeded++;
          else if (result === 'failed') failed++;
          else if (result === 'skipped') skipped++;
        }
      });

    } catch (error) {
      this.logger.error('[Outbox] Process error:', error);
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }

    this.logger.info('[Outbox] Process complete:', { processed, succeeded, failed, skipped });
    return { processed, succeeded, failed, skipped };
  }

  /**
   * Process a single entry
   */
  private async processEntry(
    entry: OutboxEntry,
    ownerId: string
  ): Promise<'success' | 'failed' | 'skipped'> {
    // Check if should retry
    if (!this.shouldRetry(entry)) {
      return 'skipped';
    }

    // Mark as processing
    await this.outboxStorage.update(entry.id, { status: 'processing' });

    try {
      let result: any;

      switch (entry.type) {
        case 'createItem':
          result = await this.itemsApi.createItem(entry.payload, entry.clientRequestId!);
          await this.reconcileCreate(entry, result, ownerId);
          break;

        case 'updateItem':
          const updateId = await this.resolveItemId(entry, ownerId);
          result = await this.itemsApi.updateItem(updateId, entry.payload.updates);
          
          // If item doesn't exist (null result), treat as graceful success
          // Skip reconciliation - the item was deleted, no cache to update
          if (result === null) {
            this.logger.info(`[OutboxProcessor] Update target deleted (graceful): ${updateId}`);
            // Note: DO NOT remove here - fall through to common remove path (line 180)
            // Just skip reconciliation by breaking early
            break;
          }
          
          await this.reconcileUpdate(entry, result, ownerId);
          break;

        case 'deleteItem':
          const deleteId = await this.resolveItemId(entry, ownerId);
          await this.itemsApi.deleteItem(deleteId);
          await this.reconcileDelete(entry, ownerId);
          break;

        case 'bulkCreate':
          // TODO: Implement bulk create
          throw new Error('bulkCreate not implemented yet');
      }

      // Success: remove from outbox
      await this.outboxStorage.remove(entry.id);
      return 'success';

    } catch (error: any) {
      return await this.handleError(entry, error);
    }
  }

  /**
   * Resolve item ID from localItemKey or payload
   */
  private async resolveItemId(entry: OutboxEntry, ownerId: string): Promise<string> {
    // If entry has localItemKey, resolve to realId
    if (entry.localItemKey) {
      // Check in-memory mapping first
      const mapped = this.localKeyToIdMap.get(entry.localItemKey);
      if (mapped) {
        return mapped;
      }

      // Fallback: query cache
      const queryKey = ['items', ownerId, entry.scope || 'all'];
      const items = this.queryClient.getQueryData<any[]>(queryKey) || [];
      const item = items.find((i) => i._localItemKey === entry.localItemKey);

      if (item && !item.id.startsWith('temp_')) {
        this.localKeyToIdMap.set(entry.localItemKey, item.id);
        return item.id;
      }

      throw new Error(`Cannot resolve localItemKey ${entry.localItemKey} to realId`);
    }

    // No localItemKey: use itemId from payload
    return entry.payload.itemId;
  }

  /**
   * Reconcile create: replace temp item with real item
   */
  private async reconcileCreate(
    entry: OutboxEntry,
    serverItem: any,
    ownerId: string
  ): Promise<void> {
    const queryKey = ['items', ownerId, entry.scope || 'all'];

    // Replace temp item with real item
    this.queryClient.setQueryData(queryKey, (old: any[] = []) =>
      old.map((item) =>
        item.id === entry.tempId
          ? { ...serverItem, _syncStatus: 'synced', _localItemKey: entry.localItemKey }
          : item
      )
    );

    // Update mapping
    this.localKeyToIdMap.set(entry.localItemKey, serverItem.id);

    // Invalidate stats
    this.queryClient.invalidateQueries({ queryKey: ['stats', ownerId] });

    this.logger.info('[Outbox] Create reconciled', {
      tempId: entry.tempId,
      realId: serverItem.id,
    });
  }

  /**
   * Reconcile update: replace item with fresh server data
   */
  private async reconcileUpdate(
    entry: OutboxEntry,
    serverItem: any,
    ownerId: string
  ): Promise<void> {
    const queryKey = ['items', ownerId, entry.scope || 'all'];

    this.queryClient.setQueryData(queryKey, (old: any[] = []) => {
      this.logger.info('[Outbox] reconcileUpdate start', { 
        scope: entry.scope, 
        oldLength: old.length,
        serverItemStatus: serverItem.status,
        serverItemId: serverItem.id,
        hasLocalKey: !!entry.localItemKey
      });
      
      // First, replace ONLY the updated item with server data
      // CRITICAL: Only check _localItemKey if it exists (to avoid undefined === undefined)
      const updated = old.map((item) => {
        const matchesId = item.id === serverItem.id;
        const matchesLocalKey = entry.localItemKey && item._localItemKey === entry.localItemKey;
        
        return (matchesId || matchesLocalKey)
          ? { ...serverItem, _syncStatus: 'synced' }
          : item;
      });
      
      this.logger.info('[Outbox] reconcileUpdate after map', { 
        updatedLength: updated.length,
        firstFewIds: updated.slice(0, 3).map(i => i.id)
      });
      
      // SAFETY: Remove duplicates (in case optimistic + reconcile created copies)
      const seenIds = new Set<string>();
      const duplicateIds: string[] = [];
      const filtered = updated.filter((item) => {
        if (seenIds.has(item.id)) {
          duplicateIds.push(item.id);
          return false; // Skip duplicate
        }
        seenIds.add(item.id);
        return true;
      });
      
      if (duplicateIds.length > 0) {
        this.logger.info('[Outbox] reconcileUpdate removed duplicates', { 
          count: duplicateIds.length
        });
      }
      
      // CRITICAL: Remove resolved items from 'expired' scope
      // Resolved items should not appear in expired list (server query filters them out)
      // This prevents stale resolved items from staying in cache
      if (entry.scope === 'expired') {
        const finalFiltered = filtered.filter((item) => item.status !== 'resolved');
        this.logger.info('[Outbox] reconcileUpdate filtered resolved items', { 
          beforeLength: filtered.length,
          afterLength: finalFiltered.length,
          removed: filtered.length - finalFiltered.length
        });
        return finalFiltered;
      }
      
      return filtered;
    });

    this.logger.info('[Outbox] Update reconciled', { itemId: serverItem.id });
  }

  /**
   * Reconcile delete: remove item completely from ALL caches
   */
  private async reconcileDelete(entry: OutboxEntry, ownerId: string): Promise<void> {
    const itemId = entry.payload.itemId;
    const localKey = entry.localItemKey;

    console.log('[Outbox] reconcileDelete START', { itemId, localKey, scope: entry.scope });

    // Remove from ALL scopes (not just the one specified in entry)
    // A deleted item should disappear from 'all', 'expired', etc.
    const scopes: Array<'all' | 'expired'> = ['all', 'expired'];
    
    scopes.forEach((scope) => {
      const queryKey = ['items', ownerId, scope];
      
      const oldItems = this.queryClient.getQueryData<any[]>(queryKey) || [];
      console.log(`[Outbox] reconcileDelete ${scope} BEFORE:`, oldItems.length);
      
      this.queryClient.setQueryData(queryKey, (old: any[] = []) => {
        console.log(`[Outbox] reconcileDelete ${scope} inside setQueryData, old.length:`, old.length);
        
        // Filter out the deleted item
        const filtered = old.filter((item) => {
          // Keep item if it's NOT the one we're deleting
          const matchesId = item.id === itemId;
          const matchesLocalKey = localKey && item._localItemKey === localKey;
          
          return !matchesId && !matchesLocalKey;
        });
        
        console.log(`[Outbox] reconcileDelete ${scope} after filter deleted:`, filtered.length);
        
        // SAFETY: Also remove any duplicates while we're here
        const seenIds = new Set<string>();
        const deduplicated = filtered.filter((item) => {
          if (seenIds.has(item.id)) {
            return false; // Skip duplicate
          }
          seenIds.add(item.id);
          return true;
        });
        
        console.log(`[Outbox] reconcileDelete ${scope} after dedup:`, deduplicated.length);
        return deduplicated;
      });
      
      const newItems = this.queryClient.getQueryData<any[]>(queryKey) || [];
      console.log(`[Outbox] reconcileDelete ${scope} AFTER:`, newItems.length);
    });

    // Invalidate stats
    this.queryClient.invalidateQueries({ queryKey: ['stats', ownerId] });

    this.logger.info('[Outbox] Delete reconciled across all scopes', { itemId });
  }

  /**
   * Handle error during processing
   */
  private async handleError(
    entry: OutboxEntry,
    error: any
  ): Promise<'failed' | 'skipped'> {
    const shouldPause = this.shouldPauseOnError(error);

    await this.outboxStorage.update(entry.id, {
      attempts: entry.attempts + 1,
      lastAttemptAt: Date.now(),
      lastError: error.message || String(error),
      status: shouldPause ? 'paused' : 'pending',
    });

    // Mark as failed after 5 attempts
    if (entry.attempts >= 4) {
      // attempts + 1 = 5
      await this.outboxStorage.update(entry.id, { status: 'failed' });
      this.logger.error('[Outbox] Entry failed permanently', { entry, error });
      this.showToast('Sync failed', 'error');
      return 'failed';
    }

    return 'skipped';
  }

  /**
   * Check if should retry entry
   */
  private shouldRetry(entry: OutboxEntry): boolean {
    // Don't retry if paused (4xx error)
    if (entry.status === 'paused') return false;

    // Don't retry if failed (max attempts reached)
    if (entry.status === 'failed') return false;

    // Don't retry if max attempts reached
    if (entry.attempts >= 5) return false;

    // Check backoff
    const backoff = Math.min(1000 * 2 ** entry.attempts, 30000);
    const timeSinceLastAttempt = Date.now() - (entry.lastAttemptAt || 0);
    return timeSinceLastAttempt >= backoff;
  }

  /**
   * Check if should pause on error (4xx except 408/429)
   */
  private shouldPauseOnError(error: any): boolean {
    const status = error.status || error.code;
    if (!status) return false;

    return status >= 400 && status < 500 && status !== 408 && status !== 429;
  }

  /**
   * Process items concurrently with limit
   */
  private async processConcurrent<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>
  ): Promise<void> {
    const results: Promise<void>[] = [];

    for (const item of items) {
      const promise = fn(item);
      results.push(promise);

      if (results.length >= limit) {
        await Promise.race(results);
        // Remove completed promises
        results.splice(
          results.findIndex((p) => p === promise),
          1
        );
      }
    }

    await Promise.all(results);
  }

  /**
   * Abort processing (for cleanup)
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Rebuild localKeyToIdMap from cache (call on app start)
   * Also cleanup any stale _deleted items
   */
  async rebuildMapping(ownerId: string): Promise<void> {
    const scopes: Array<'all' | 'expired'> = ['all', 'expired'];
    
    scopes.forEach((scope) => {
      const queryKey = ['items', ownerId, scope];
      const items = this.queryClient.getQueryData<any[]>(queryKey) || [];

      // Build mapping
      for (const item of items) {
        if (item._localItemKey && !item.id.startsWith('temp_')) {
          this.localKeyToIdMap.set(item._localItemKey, item.id);
        }
      }

      // Cleanup 1: Remove any items marked as _deleted (stale soft-deletes)
      let cleanItems = items.filter((item) => !item._deleted);
      
      // Cleanup 2: Remove duplicate IDs (keep first occurrence)
      const seenIds = new Set<string>();
      const duplicateIds: string[] = [];
      cleanItems = cleanItems.filter((item) => {
        if (seenIds.has(item.id)) {
          duplicateIds.push(item.id);
          return false; // Skip duplicate
        }
        seenIds.add(item.id);
        return true;
      });
      
      const totalCleaned = items.length - cleanItems.length;
      if (totalCleaned > 0) {
        this.logger.info(
          `[Outbox] Cleaning ${totalCleaned} items from ${scope} (${items.length - items.filter(i => !i._deleted).length} deleted, ${duplicateIds.length} duplicates)`
        );
        this.queryClient.setQueryData(queryKey, cleanItems);
      }
    });

    this.logger.info('[Outbox] Rebuilt mapping: %d entries', this.localKeyToIdMap.size);
  }
}
