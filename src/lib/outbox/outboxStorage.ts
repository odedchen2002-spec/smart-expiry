/**
 * Outbox Storage - AsyncStorage-based persistent storage for outbox entries
 * 
 * Uses AsyncStorage for:
 * - Universal compatibility (no native linking required)
 * - Works in Expo Go and managed workflow
 * - Async but reliable persistence
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OutboxEntry, OutboxStats } from './outboxTypes';

const OUTBOX_STORAGE_KEY = '@expiryx/outbox_entries_v1';

/**
 * Outbox Storage API
 */
export class OutboxStorage {
  /**
   * Enqueue a new entry to the outbox
   * MUST be durable before returning
   */
  async enqueue(entry: OutboxEntry): Promise<void> {
    const entries = await this.getAllEntries();
    entries.push(entry);
    
    // Write to AsyncStorage
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries));
    
    // Verify write (paranoid mode - ensure durability)
    const verify = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!verify || !verify.includes(entry.id)) {
      throw new Error('[OutboxStorage] Write failed verification');
    }
    
    console.log('[OutboxStorage] Enqueued entry:', entry.id, entry.type);
  }

  /**
   * Get all entries (internal use)
   */
  private async getAllEntries(): Promise<OutboxEntry[]> {
    const data = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!data) return [];
    
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('[OutboxStorage] Failed to parse entries:', error);
      return [];
    }
  }

  /**
   * Get pending entries (status = pending or processing)
   * Returns entries sorted by createdAt (oldest first)
   */
  async getPending(): Promise<OutboxEntry[]> {
    const allEntries = await this.getAllEntries();
    return allEntries
      .filter((entry) => entry.status === 'pending' || entry.status === 'processing')
      .sort((a, b) => a.createdAt - b.createdAt); // FIFO
  }

  /**
   * Get all entries with a specific status
   */
  async getByStatus(status: OutboxEntry['status']): Promise<OutboxEntry[]> {
    const allEntries = await this.getAllEntries();
    return allEntries.filter((entry) => entry.status === status);
  }

  /**
   * Update an entry by ID
   */
  async update(id: string, updates: Partial<OutboxEntry>): Promise<void> {
    const entries = await this.getAllEntries();
    const index = entries.findIndex((e) => e.id === id);
    
    if (index === -1) {
      console.warn('[OutboxStorage] Entry not found for update:', id);
      return;
    }
    
    entries[index] = { ...entries[index], ...updates };
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries));
  }

  /**
   * Remove an entry by ID (called after successful processing)
   */
  async remove(id: string): Promise<void> {
    const entries = await this.getAllEntries();
    const filtered = entries.filter((e) => e.id !== id);
    
    if (filtered.length === entries.length) {
      console.warn('[OutboxStorage] Entry not found for removal:', id);
      return;
    }
    
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(filtered));
    console.log('[OutboxStorage] Removed entry:', id);
  }

  /**
   * Get entry by ID
   */
  async getById(id: string): Promise<OutboxEntry | null> {
    const entries = await this.getAllEntries();
    return entries.find((e) => e.id === id) || null;
  }

  /**
   * Get statistics for UI
   */
  async getStats(): Promise<OutboxStats> {
    const entries = await this.getAllEntries();
    return {
      pendingCount: entries.filter((e) => e.status === 'pending').length,
      processingCount: entries.filter((e) => e.status === 'processing').length,
      failedCount: entries.filter((e) => e.status === 'failed').length,
      pausedCount: entries.filter((e) => e.status === 'paused').length,
      totalCount: entries.length,
    };
  }

  /**
   * Clear all entries (for testing/reset)
   */
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(OUTBOX_STORAGE_KEY);
    console.log('[OutboxStorage] Cleared all entries');
  }

  /**
   * Get entries grouped by entityKey (for sequential processing)
   */
  async getGroupedByEntity(): Promise<Record<string, OutboxEntry[]>> {
    const pending = await this.getPending();
    const grouped: Record<string, OutboxEntry[]> = {};
    
    for (const entry of pending) {
      const key = entry.entityKey;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(entry);
    }
    
    // Sort each group by createdAt (FIFO within entity)
    for (const key in grouped) {
      grouped[key].sort((a, b) => a.createdAt - b.createdAt);
    }
    
    return grouped;
  }
}

// Export singleton instance
export const outboxStorage = new OutboxStorage();
