/**
 * Cache Context - Pre-loads cached data from AsyncStorage into memory
 * 
 * This ensures that when screens render, cached data is already available
 * in memory for instant display (no async delay).
 * 
 * Key behavior: Children render ONLY after cache is loaded to memory.
 * Also preloads activeOwnerId for instant availability.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Import memory caches from hooks to populate them
import { SplashScreen } from '@/components/SplashScreen';
import { preloadHomeStatsCache } from '@/lib/hooks/useHomeStats';
import { preloadStatisticsCache } from '@/lib/hooks/useStatisticsCache';

const ACTIVE_OWNER_ID_KEY = 'active_owner_id';

interface CacheContextValue {
  isReady: boolean;
  cachedOwnerId: string | null;
  preloadForOwner: (ownerId: string) => Promise<void>;
}

const CacheContext = createContext<CacheContextValue>({
  isReady: false,
  cachedOwnerId: null,
  preloadForOwner: async () => {},
});

export function useCacheReady() {
  return useContext(CacheContext);
}

interface CacheProviderProps {
  children: React.ReactNode;
}

export function CacheProvider({ children }: CacheProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [cachedOwnerId, setCachedOwnerId] = useState<string | null>(null);

  // Preload cache for a specific owner
  const preloadForOwner = useCallback(async (ownerId: string) => {
    await Promise.all([
      preloadHomeStatsCache(ownerId),
      preloadStatisticsCache(ownerId),
    ]);
  }, []);

  // Initial cache loading - runs ONCE at app startup
  useEffect(() => {
    const init = async () => {
      try {
        // Get all AsyncStorage keys to find cached data
        const keys = await AsyncStorage.getAllKeys();
        
        // Find owner IDs from cache keys
        const homeStatsKeys = keys.filter(k => k.startsWith('home_stats_cache_v1:'));
        const statsKeys = keys.filter(k => k.startsWith('statistics_cache_v1:'));
        
        // Also load the active owner ID for later use
        const storedOwnerId = await AsyncStorage.getItem(ACTIVE_OWNER_ID_KEY);
        setCachedOwnerId(storedOwnerId);
        
        // Extract unique owner IDs from existing cache keys
        const ownerIds = new Set<string>();
        homeStatsKeys.forEach(k => ownerIds.add(k.replace('home_stats_cache_v1:', '')));
        statsKeys.forEach(k => ownerIds.add(k.replace('statistics_cache_v1:', '')));
        
        // IMPORTANT: Also ensure we preload cache for the active owner ID
        // This prevents flickering when the user has a stored owner but
        // their cache keys might not have been found (e.g., cleared partially)
        if (storedOwnerId) {
          ownerIds.add(storedOwnerId);
        }
        
        // Preload cache for all found owners (including active owner)
        await Promise.all(
          Array.from(ownerIds).map(ownerId => preloadForOwner(ownerId))
        );
      } catch (error) {
        console.warn('[CacheProvider] Error preloading cache:', error);
      } finally {
        setIsReady(true);
      }
    };

    init();
  }, [preloadForOwner]);

  // Don't render children until cache is ready
  // Show premium splash screen for unified loading experience
  if (!isReady) {
    return <SplashScreen />;
  }

  return (
    <CacheContext.Provider value={{ isReady, cachedOwnerId, preloadForOwner }}>
      {children}
    </CacheContext.Provider>
  );
}
