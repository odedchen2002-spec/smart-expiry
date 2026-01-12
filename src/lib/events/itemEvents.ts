/**
 * Simple event system for item-related events
 * Used to notify screens when items are created/updated/deleted
 */

type ItemEventListener = () => void;

class ItemEventEmitter {
  private listeners: Set<ItemEventListener> = new Set();
  private lastUpdateTimestamp: number = 0;

  /**
   * Subscribe to item update events
   * @returns unsubscribe function
   */
  subscribe(listener: ItemEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Emit an item update event (call when items are created/updated/deleted)
   */
  emit(): void {
    this.lastUpdateTimestamp = Date.now();
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('[ItemEventEmitter] Error in listener:', error);
      }
    });
  }

  /**
   * Get the timestamp of the last update
   */
  getLastUpdateTimestamp(): number {
    return this.lastUpdateTimestamp;
  }
}

// Singleton instance
export const itemEvents = new ItemEventEmitter();

