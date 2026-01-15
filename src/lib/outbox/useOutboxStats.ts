/**
 * useOutboxStats - Real-time monitoring of outbox state
 * 
 * Provides live stats for UI indicators (sync badges, banners, etc.)
 */

import { useEffect, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { outboxStorage } from './outboxStorage';
import type { OutboxStats } from './outboxTypes';

const REFRESH_INTERVAL = 2000; // Poll every 2 seconds for UI updates

/**
 * Hook for monitoring outbox statistics
 * 
 * Returns:
 * - pendingCount: Number of operations waiting to sync
 * - failedCount: Number of permanently failed operations
 * - isProcessing: Whether outbox is currently syncing
 * - hasPending: Convenience flag for showing badges
 * - refresh: Manual refresh function
 */
export function useOutboxStats() {
  const [stats, setStats] = useState<OutboxStats>({
    pendingCount: 0,
    processingCount: 0,
    failedCount: 0,
    pausedCount: 0,
    totalCount: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    if (isRefreshing) return; // Prevent concurrent refreshes
    
    setIsRefreshing(true);
    try {
      const newStats = await outboxStorage.getStats();
      setStats(newStats);
    } catch (error) {
      console.error('[useOutboxStats] Error loading stats:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  useEffect(() => {
    // Load initial stats
    loadStats();

    // Poll for updates while app is active
    const intervalId = setInterval(() => {
      if (AppState.currentState === 'active') {
        loadStats();
      }
    }, REFRESH_INTERVAL);

    // Reload when app comes to foreground
    let lastAppState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (lastAppState.match(/inactive|background/) && nextAppState === 'active') {
        loadStats();
      }
      lastAppState = nextAppState;
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [loadStats]);

  return {
    ...stats,
    hasPending: stats.totalCount > 0,
    isProcessing: stats.processingCount > 0,
    refresh: loadStats,
  };
}
