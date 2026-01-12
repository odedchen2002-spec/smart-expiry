/**
 * Hook for managing statistics screen data with stale-while-revalidate pattern
 * 
 * Key behaviors:
 * - Loads cached stats from AsyncStorage FIRST and displays immediately
 * - Fetches fresh data from Supabase in parallel
 * - Updates UI smoothly when fresh data arrives (only if changed)
 * - NEVER shows skeleton if cache exists - keeps showing cached data during refresh
 * - Skeleton only shown on true first run (no cache at all)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getStatisticsSummary,
  getTopThrownProducts,
  StatisticsSummary,
  TopThrownProduct,
} from '../supabase/services/statisticsService';

const CACHE_KEY_PREFIX = 'statistics_cache_v1:';
const STALE_TIME = 30000; // 30 seconds - only refetch if older than this

// In-memory cache for instant display (persists across component lifecycles)
const memoryCache: Map<string, { data: StatisticsData; timestamp: number }> = new Map();

export interface StatisticsData {
  monthSummary: StatisticsSummary;
  yearSummary: StatisticsSummary;
  monthTopProducts: TopThrownProduct[];
  yearTopProducts: TopThrownProduct[];
}

interface CachedStatistics extends StatisticsData {
  updatedAt: string; // ISO timestamp
}

interface UseStatisticsCacheOptions {
  ownerId: string | null;
  autoFetch?: boolean;
}

interface UseStatisticsCacheResult {
  data: StatisticsData;
  isLoading: boolean; // True ONLY when no cache AND first fetch in progress
  hasCache: boolean;
  refetch: () => Promise<void>;
  clearCache: () => Promise<void>; // Clear cache (for reset statistics)
  lastFetchTime: number;
}

const DEFAULT_SUMMARY: StatisticsSummary = {
  handledCount: 0,
  thrownCount: 0,
  totalCount: 0,
};

const DEFAULT_DATA: StatisticsData = {
  monthSummary: DEFAULT_SUMMARY,
  yearSummary: DEFAULT_SUMMARY,
  monthTopProducts: [],
  yearTopProducts: [],
};

function getCacheKey(ownerId: string): string {
  return `${CACHE_KEY_PREFIX}${ownerId}`;
}

async function loadCachedData(ownerId: string): Promise<CachedStatistics | null> {
  try {
    const cached = await AsyncStorage.getItem(getCacheKey(ownerId));
    if (cached) {
      return JSON.parse(cached) as CachedStatistics;
    }
  } catch (error) {
    console.warn('[useStatisticsCache] Error loading cache:', error);
  }
  return null;
}

async function saveCachedData(ownerId: string, data: StatisticsData): Promise<void> {
  try {
    const cached: CachedStatistics = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(getCacheKey(ownerId), JSON.stringify(cached));
  } catch (error) {
    console.warn('[useStatisticsCache] Error saving cache:', error);
  }
}

/**
 * Preload cache from AsyncStorage into memory cache
 * Called by CacheProvider at app startup for instant display
 */
export async function preloadStatisticsCache(ownerId: string): Promise<void> {
  try {
    const cached = await loadCachedData(ownerId);
    if (cached) {
      memoryCache.set(ownerId, { data: cached, timestamp: Date.now() });
    }
  } catch (error) {
    console.warn('[useStatisticsCache] Error preloading cache:', error);
  }
}

function dataChanged(prev: StatisticsData, next: StatisticsData): boolean {
  // Safety check: if either prev or next is missing required fields, consider them different
  if (!prev.monthSummary || !next.monthSummary) {
    return true;
  }
  
  if (!prev.yearSummary || !next.yearSummary) {
    return true;
  }

  // Compare summaries
  if (
    prev.monthSummary.handledCount !== next.monthSummary.handledCount ||
    prev.monthSummary.thrownCount !== next.monthSummary.thrownCount ||
    prev.yearSummary.handledCount !== next.yearSummary.handledCount ||
    prev.yearSummary.thrownCount !== next.yearSummary.thrownCount
  ) {
    return true;
  }

  // Compare top products arrays length
  if (
    prev.monthTopProducts.length !== next.monthTopProducts.length ||
    prev.yearTopProducts.length !== next.yearTopProducts.length
  ) {
    return true;
  }

  // Compare top products content (simplified - just check first item productName)
  if (prev.monthTopProducts.length > 0 && next.monthTopProducts.length > 0) {
    if (prev.monthTopProducts[0].productName !== next.monthTopProducts[0].productName) {
      return true;
    }
  }

  if (prev.yearTopProducts.length > 0 && next.yearTopProducts.length > 0) {
    if (prev.yearTopProducts[0].productName !== next.yearTopProducts[0].productName) {
      return true;
    }
  }

  return false;
}

export function useStatisticsCache({ ownerId, autoFetch = true }: UseStatisticsCacheOptions): UseStatisticsCacheResult {
  // Check memory cache SYNCHRONOUSLY on every render
  // This is the key to instant display - we read directly from memory cache
  const memoryCached = ownerId ? memoryCache.get(ownerId) : null;
  
  // Internal state for fresh data and async cached data
  const [freshData, setFreshData] = useState<StatisticsData | null>(null);
  const [asyncCachedData, setAsyncCachedData] = useState<StatisticsData | null>(null);
  const [cacheCheckDone, setCacheCheckDone] = useState(false);
  const [hasLoadedFresh, setHasLoadedFresh] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const lastFetchRef = useRef<number>(memoryCached?.timestamp || 0);
  const currentOwnerRef = useRef<string | null>(null);

  // Compute the data to display - priority: fresh > memory cache > async cache > default
  // This is computed synchronously on each render, so memory cache is instant!
  const data: StatisticsData = freshData || memoryCached?.data || asyncCachedData || DEFAULT_DATA;
  const hasCacheData = !!(memoryCached || asyncCachedData || freshData);

  // Handle owner change and load from AsyncStorage (fallback)
  useEffect(() => {
    if (!ownerId) return;

    // Skip if same owner
    if (currentOwnerRef.current === ownerId) return;
    currentOwnerRef.current = ownerId;

    // Reset state for new owner
    setFreshData(null);
    setAsyncCachedData(null);
    setHasLoadedFresh(false);

    // If we have memory cache, we're already showing it - just mark as done
    if (memoryCache.get(ownerId)) {
      setCacheCheckDone(true);
      lastFetchRef.current = memoryCache.get(ownerId)!.timestamp;
      return;
    }

    // No memory cache - check AsyncStorage
    setCacheCheckDone(false);

    const loadCache = async () => {
      const cached = await loadCachedData(ownerId);
      if (cached) {
        setAsyncCachedData(cached);
        // Save to memory cache for instant access next time
        memoryCache.set(ownerId, { data: cached, timestamp: Date.now() });
      }
      setCacheCheckDone(true);
    };

    loadCache();
  }, [ownerId]);

  // Fetch fresh data from Supabase
  const fetchFreshData = useCallback(async () => {
    if (!ownerId) return;
    if (isFetching) return; // Prevent concurrent fetches

    setIsFetching(true);
    try {
      const [monthSum, yearSum, monthTop, yearTop] = await Promise.all([
        getStatisticsSummary(ownerId, 'month'),
        getStatisticsSummary(ownerId, 'year'),
        getTopThrownProducts(ownerId, 'month', 10),
        getTopThrownProducts(ownerId, 'year', 10),
      ]);

      const newData: StatisticsData = {
        monthSummary: monthSum,
        yearSummary: yearSum,
        monthTopProducts: monthTop,
        yearTopProducts: yearTop,
      };

      // Check if data changed compared to current display
      const currentData = freshData || memoryCached?.data || asyncCachedData || DEFAULT_DATA;
      if (dataChanged(currentData, newData) || !hasLoadedFresh) {
        // Save to both memory and AsyncStorage
        const now = Date.now();
        memoryCache.set(ownerId, { data: newData, timestamp: now });
        saveCachedData(ownerId, newData);
        setFreshData(newData);
      }

      setHasLoadedFresh(true);
      lastFetchRef.current = Date.now();
    } catch (error) {
      console.error('[useStatisticsCache] Error fetching data:', error);
    } finally {
      setIsFetching(false);
    }
  }, [ownerId, isFetching, hasLoadedFresh, freshData, memoryCached, asyncCachedData]);

  // Auto-fetch when cache check is done and we should fetch
  useEffect(() => {
    if (!ownerId || !autoFetch || !cacheCheckDone) return;

    // Check if we should fetch (stale or never fetched)
    const now = Date.now();
    const shouldFetch = now - lastFetchRef.current > STALE_TIME || lastFetchRef.current === 0;

    if (shouldFetch && !isFetching) {
      fetchFreshData();
    }
  }, [ownerId, autoFetch, cacheCheckDone, fetchFreshData, isFetching]);

  // Refetch function - doesn't reset state, just triggers new fetch
  const refetch = useCallback(async () => {
    if (!ownerId) return;
    await fetchFreshData();
  }, [ownerId, fetchFreshData]);

  // Clear cache function (for reset statistics)
  // Sets data to zeros immediately so UI updates right away
  const clearCache = useCallback(async () => {
    if (!ownerId) return;
    try {
      // Clear both memory and AsyncStorage cache
      memoryCache.delete(ownerId);
      await AsyncStorage.removeItem(getCacheKey(ownerId));
      
      // Set fresh data to DEFAULT (zeros) immediately - this ensures UI shows zeros right away
      // Don't set to null, or the old cached data might still show due to closure issues
      setFreshData(DEFAULT_DATA);
      setAsyncCachedData(null);
      setHasLoadedFresh(true); // Mark as loaded so we don't show loading spinner
      lastFetchRef.current = 0;
      
      // Also update memory cache to zeros so next render picks it up
      memoryCache.set(ownerId, { data: DEFAULT_DATA, timestamp: Date.now() });
    } catch (error) {
      console.warn('[useStatisticsCache] Error clearing cache:', error);
    }
  }, [ownerId]);

  // Determine loading state
  // Only show loading/skeleton when we genuinely have no data to display
  const hasAnyData = hasCacheData || hasLoadedFresh;
  const isLoading = !!ownerId && !hasAnyData && (!cacheCheckDone || isFetching);

  return {
    data,
    isLoading,
    hasCache: hasCacheData,
    refetch,
    clearCache,
    lastFetchTime: lastFetchRef.current,
  };
}

export { STALE_TIME };

