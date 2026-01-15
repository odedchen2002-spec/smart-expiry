/**
 * Outbox Hook - React hook for accessing outbox functionality
 */

import { useCallback } from 'react';
import { outboxStorage } from './outboxStorage';
import type { OutboxEntry, OutboxStats } from './outboxTypes';

/**
 * Hook for interacting with the outbox
 */
export function useOutbox() {
  const enqueue = useCallback(async (entry: OutboxEntry) => {
    await outboxStorage.enqueue(entry);
  }, []);

  const remove = useCallback(async (id: string) => {
    await outboxStorage.remove(id);
  }, []);

  const update = useCallback(async (id: string, updates: Partial<OutboxEntry>) => {
    await outboxStorage.update(id, updates);
  }, []);

  const getStats = useCallback(async (): Promise<OutboxStats> => {
    return await outboxStorage.getStats();
  }, []);

  const getPending = useCallback(async (): Promise<OutboxEntry[]> => {
    return await outboxStorage.getPending();
  }, []);

  // Dead-letter handling
  const getFailed = useCallback(async (): Promise<OutboxEntry[]> => {
    return await outboxStorage.getFailed();
  }, []);

  const retryFailed = useCallback(async (id: string) => {
    await outboxStorage.retryFailed(id);
  }, []);

  const discardFailed = useCallback(async (id: string) => {
    await outboxStorage.discardFailed(id);
  }, []);

  const retryAllFailed = useCallback(async (): Promise<number> => {
    return await outboxStorage.retryAllFailed();
  }, []);

  const discardAllFailed = useCallback(async (): Promise<number> => {
    return await outboxStorage.discardAllFailed();
  }, []);

  // Note: process() is called by OutboxProcessor, not directly by hooks
  // This is just for convenience if needed
  const process = useCallback(async () => {
    // This will be implemented when we set up the OutboxProcessor instance
    // For now, just a placeholder
    console.log('[useOutbox] process() should be called via OutboxProcessor instance');
  }, []);

  return {
    enqueue,
    remove,
    update,
    getStats,
    getPending,
    getFailed,
    retryFailed,
    discardFailed,
    retryAllFailed,
    discardAllFailed,
    process, // Placeholder
  };
}
