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
import { OUTBOX_SCHEMA_VERSION } from './outboxTypes';

const OUTBOX_STORAGE_KEY = '@expiryx/outbox_entries_v1';
const OUTBOX_SCHEMA_KEY = '@expiryx/outbox_schema_version';

/**
 * Outbox Storage API
 */
export class OutboxStorage {
  /**
   * Check and migrate schema if needed
   * Returns true if migration occurred
   */
  private async checkAndMigrateSchema(): Promise<boolean> {
    try {
      const storedVersion = await AsyncStorage.getItem(OUTBOX_SCHEMA_KEY);
      const currentVersion = OUTBOX_SCHEMA_VERSION;
      
      if (!storedVersion) {
        // First time - set current version
        await AsyncStorage.setItem(OUTBOX_SCHEMA_KEY, String(currentVersion));
        console.log('[OutboxStorage] Schema version initialized:', currentVersion);
        return false;
      }

      const storedVersionNum = parseInt(storedVersion, 10);
      
      if (storedVersionNum < currentVersion) {
        console.warn(
          `[OutboxStorage] Schema version mismatch: stored=${storedVersionNum}, current=${currentVersion}`
        );
        
        // MIGRATION STRATEGY: Clear old data (safe for outbox - operations can be retried)
        // Alternative: Could implement migration logic here for each version
        console.warn('[OutboxStorage] Clearing old outbox data due to schema change');
        await this.clear();
        await AsyncStorage.setItem(OUTBOX_SCHEMA_KEY, String(currentVersion));
        
        return true;
      }

      if (storedVersionNum > currentVersion) {
        // User downgraded app - clear data to prevent crashes
        console.error(
          `[OutboxStorage] Downgrade detected: stored=${storedVersionNum}, current=${currentVersion}`
        );
        await this.clear();
        await AsyncStorage.setItem(OUTBOX_SCHEMA_KEY, String(currentVersion));
        
        return true;
      }

      return false;
    } catch (error) {
      console.error('[OutboxStorage] Schema migration failed:', error);
      // On error, clear data to be safe
      await this.clear();
      return true;
    }
  }

  /**
   * Enqueue a new entry to the outbox
   * MUST be durable before returning
   */
  async enqueue(entry: OutboxEntry): Promise<void> {
    // Ensure schema is current
    await this.checkAndMigrateSchema();
    
    const entries = await this.getAllEntries();
    
    // Add schema version to entry
    const entryWithSchema: OutboxEntry = {
      ...entry,
      schemaVersion: OUTBOX_SCHEMA_VERSION,
    };
    
    entries.push(entryWithSchema);
    
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
   * Filters out entries with incompatible schema versions
   */
  private async getAllEntries(): Promise<OutboxEntry[]> {
    // Check schema first
    await this.checkAndMigrateSchema();
    
    const data = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!data) return [];
    
    try {
      const parsed: OutboxEntry[] = JSON.parse(data);
      
      // Filter entries with compatible schema
      const compatible = parsed.filter(entry => {
        if (!entry.schemaVersion) {
          console.warn('[OutboxStorage] Entry missing schemaVersion:', entry.id);
          return false;
        }
        if (entry.schemaVersion !== OUTBOX_SCHEMA_VERSION) {
          console.warn(
            `[OutboxStorage] Entry ${entry.id} has incompatible schema: ${entry.schemaVersion} (current: ${OUTBOX_SCHEMA_VERSION})`
          );
          return false;
        }
        return true;
      });

      // If we filtered out incompatible entries, persist the clean list
      if (compatible.length !== parsed.length) {
        console.log(
          `[OutboxStorage] Filtered ${parsed.length - compatible.length} incompatible entries`
        );
        await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(compatible));
      }

      return compatible;
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
   * DEAD-LETTER HANDLING: Retry a failed entry
   * Resets status to 'pending' and clears error state
   */
  async retryFailed(id: string): Promise<void> {
    const entries = await this.getAllEntries();
    const index = entries.findIndex((e) => e.id === id);
    
    if (index === -1) {
      console.warn('[OutboxStorage] Entry not found for retry:', id);
      return;
    }

    const entry = entries[index];
    
    if (entry.status !== 'failed') {
      console.warn('[OutboxStorage] Entry is not in failed state:', id, entry.status);
      return;
    }

    // Reset for retry
    entries[index] = {
      ...entry,
      status: 'pending',
      attempts: 0, // Reset attempt counter
      lastAttemptAt: null,
      lastError: null,
    };

    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries));
    console.log('[OutboxStorage] Failed entry reset for retry:', id);
  }

  /**
   * DEAD-LETTER HANDLING: Discard a failed entry permanently
   * Removes from outbox without processing
   */
  async discardFailed(id: string): Promise<void> {
    const entries = await this.getAllEntries();
    const entry = entries.find((e) => e.id === id);
    
    if (!entry) {
      console.warn('[OutboxStorage] Entry not found for discard:', id);
      return;
    }

    if (entry.status !== 'failed') {
      console.warn('[OutboxStorage] Entry is not in failed state:', id, entry.status);
      return;
    }

    // Remove from storage
    const filtered = entries.filter((e) => e.id !== id);
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(filtered));
    
    console.log('[OutboxStorage] Failed entry discarded:', id, entry.type);
  }

  /**
   * Get all failed entries (for dead-letter UI)
   */
  async getFailed(): Promise<OutboxEntry[]> {
    const allEntries = await this.getAllEntries();
    return allEntries.filter((entry) => entry.status === 'failed');
  }

  /**
   * Retry all failed entries
   */
  async retryAllFailed(): Promise<number> {
    const failed = await this.getFailed();
    
    for (const entry of failed) {
      await this.retryFailed(entry.id);
    }

    console.log('[OutboxStorage] Retrying all failed entries:', failed.length);
    return failed.length;
  }

  /**
   * Discard all failed entries
   */
  async discardAllFailed(): Promise<number> {
    const failed = await this.getFailed();
    
    for (const entry of failed) {
      await this.discardFailed(entry.id);
    }

    console.log('[OutboxStorage] Discarded all failed entries:', failed.length);
    return failed.length;
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
