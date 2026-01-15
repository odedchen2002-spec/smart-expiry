/**
 * QueryClient Provider - TanStack Query setup with persisted cache
 * 
 * Features:
 * - Persisted query cache to AsyncStorage (instant startup)
 * - React Native appropriate defaults (no focus refetch)
 * - Automatic reconnect refetch
 * - Exponential backoff for retries
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import React, { useEffect, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { OutboxProcessor } from '@/lib/outbox/OutboxProcessor';
import { outboxStorage } from '@/lib/outbox/outboxStorage';
import * as itemsApi from '@/data/itemsApi';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { checkNetworkStatus } from '@/lib/hooks/useNetworkStatus';

/**
 * Create QueryClient with React Native optimized defaults
 */
function createQueryClientInstance() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache settings
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        staleTime: 1000 * 60 * 5, // 5 minutes

        // React Native specific
        refetchOnMount: false, // Use cache first
        refetchOnWindowFocus: false, // Not applicable in RN
        refetchOnReconnect: true, // Refetch when network reconnects

        // Retry with exponential backoff
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

        // Network mode
        networkMode: 'offlineFirst', // Try cache first, then network
      },
      mutations: {
        // Mutations handled by Outbox, so disable built-in retry
        retry: false,
        networkMode: 'online', // Mutations require network (Outbox handles offline)
      },
    },
  });
}

/**
 * Outbox Processor singleton instance
 * Created once and shared globally
 */
let outboxProcessorInstance: OutboxProcessor | null = null;

function getOutboxProcessor(
  queryClient: QueryClient,
  getOwnerId: () => string | null
): OutboxProcessor {
  if (!outboxProcessorInstance) {
    outboxProcessorInstance = new OutboxProcessor({
      queryClient,
      outboxStorage,
      itemsApi,
      getOwnerId,
      showToast: (message, type) => {
        // TODO: Integrate with actual toast system
        console.log(`[Toast ${type}]`, message);
      },
      logger: {
        info: (msg, meta) => console.log(msg, meta),
        error: (msg, meta) => console.error(msg, meta),
      },
    });
  }
  return outboxProcessorInstance;
}

/**
 * Create AsyncStorage persister for query cache
 * Key: 'EXPIRY_X_QUERY_CACHE'
 * MaxAge: 7 days
 */
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'EXPIRY_X_QUERY_CACHE',
  throttleTime: 1000, // Throttle writes to storage (performance)
});

/**
 * QueryClientProvider with persistence and Outbox integration
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Create QueryClient instance (memoized)
  const queryClient = useMemo(() => createQueryClientInstance(), []);

  // Get active owner ID for Outbox processor
  const { activeOwnerId } = useActiveOwner();
  
  // Use ref to store current activeOwnerId (so closure always gets latest value)
  const activeOwnerIdRef = React.useRef<string | null>(null);
  activeOwnerIdRef.current = activeOwnerId || null;

  // Setup Outbox processor with dependencies
  useEffect(() => {
    const processor = getOutboxProcessor(queryClient, () => activeOwnerIdRef.current);

    // Configure TanStack Query's onlineManager with custom network check
    onlineManager.setEventListener((setOnline) => {
      // Poll network status
      const checkAndUpdate = async () => {
        const isOnline = await checkNetworkStatus();
        setOnline(isOnline);
        
        // Trigger outbox processing when coming online
        if (isOnline) {
          console.log('[QueryProvider] Network reconnected, processing outbox');
          processor.process().catch(console.error);
        }
      };

      // Check immediately
      checkAndUpdate();

      // Poll every 30 seconds
      const intervalId = setInterval(checkAndUpdate, 30000);

      // Setup app state listener (check when app becomes active)
      let lastAppState: AppStateStatus = AppState.currentState;
      const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        if (lastAppState.match(/inactive|background/) && nextAppState === 'active') {
          console.log('[QueryProvider] App became active, checking network');
          checkAndUpdate();
        }
        lastAppState = nextAppState;
      });

      // Return cleanup function
      return () => {
        clearInterval(intervalId);
        appStateSubscription.remove();
      };
    });

    // Process outbox on mount (sync pending mutations)
    processor.process().catch(console.error);

    // Rebuild localKey mapping from cache
    if (activeOwnerId) {
      processor.rebuildMapping(activeOwnerId).catch(console.error);
    }
  }, [queryClient, activeOwnerId]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        buster: '', // Change this to clear old cache after breaking changes
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/**
 * Export function to access Outbox processor
 * Used by write hooks to trigger processing
 */
export function triggerOutboxProcessing() {
  if (!outboxProcessorInstance) {
    console.warn('[QueryProvider] Outbox processor not initialized yet');
    return Promise.resolve();
  }
  return outboxProcessorInstance.process();
}
