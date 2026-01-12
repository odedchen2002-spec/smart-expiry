/**
 * Hook for managing home screen statistics with stale-while-revalidate pattern
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
import { getUnresolvedPendingItemsCount } from '../supabase/services/pendingItemsService';
import { useItems } from './useItems';

const CACHE_KEY_PREFIX = 'home_stats_cache_v1:';
const STALE_TIME = 30000; // 30 seconds

// In-memory cache for instant display (persists across component lifecycles)
const memoryCache: Map<string, { data: HomeStats; timestamp: number }> = new Map();

export interface HomeStats {
  expired: number;
  today: number;
  week: number;
  ok: number;
  total: number;
  pendingDates: number;
}

interface CachedStats extends HomeStats {
  updatedAt: string; // ISO timestamp
}

interface UseHomeStatsOptions {
  ownerId: string | null;
  autoFetch?: boolean;
}

interface UseHomeStatsResult {
  stats: HomeStats;
  isLoading: boolean; // True ONLY when no cache AND first fetch in progress
  hasCache: boolean;
  refetch: () => Promise<void>;
  lastFetchTime: number;
}

const DEFAULT_STATS: HomeStats = {
  expired: 0,
  today: 0,
  week: 0,
  ok: 0,
  total: 0,
  pendingDates: 0,
};

function getCacheKey(ownerId: string): string {
  return `${CACHE_KEY_PREFIX}${ownerId}`;
}

/**
 * Check if a date string is from today
 */
function isFromToday(dateString: string): boolean {
  const cacheDate = new Date(dateString);
  const today = new Date();
  return (
    cacheDate.getFullYear() === today.getFullYear() &&
    cacheDate.getMonth() === today.getMonth() &&
    cacheDate.getDate() === today.getDate()
  );
}

async function loadCachedStats(ownerId: string): Promise<CachedStats | null> {
  try {
    const cached = await AsyncStorage.getItem(getCacheKey(ownerId));
    if (cached) {
      const parsedCache = JSON.parse(cached) as CachedStats;

      // IMPORTANT: Invalidate cache if it's from a different day
      // This ensures stats are recalculated when items move from "today" to "expired" at midnight
      if (parsedCache.updatedAt && !isFromToday(parsedCache.updatedAt)) {
        console.log('[useHomeStats] Cache is from a different day, invalidating');
        await AsyncStorage.removeItem(getCacheKey(ownerId));
        return null;
      }

      return parsedCache;
    }
  } catch (error) {
    console.warn('[useHomeStats] Error loading cache:', error);
  }
  return null;
}

async function saveCachedStats(ownerId: string, stats: HomeStats): Promise<void> {
  try {
    const cached: CachedStats = {
      ...stats,
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(getCacheKey(ownerId), JSON.stringify(cached));
  } catch (error) {
    console.warn('[useHomeStats] Error saving cache:', error);
  }
}

/**
 * Preload cache from AsyncStorage into memory cache
 * Called by CacheProvider at app startup for instant display
 */
export async function preloadHomeStatsCache(ownerId: string): Promise<void> {
  try {
    // First, clear memory cache if it's from a different day
    const existing = memoryCache.get(ownerId);
    if (existing) {
      const cacheDate = new Date(existing.timestamp);
      const today = new Date();
      if (
        cacheDate.getFullYear() !== today.getFullYear() ||
        cacheDate.getMonth() !== today.getMonth() ||
        cacheDate.getDate() !== today.getDate()
      ) {
        console.log('[useHomeStats] Memory cache is from a different day, clearing');
        memoryCache.delete(ownerId);
      }
    }

    const cached = await loadCachedStats(ownerId);
    if (cached) {
      memoryCache.set(ownerId, { data: cached, timestamp: Date.now() });
    }
  } catch (error) {
    console.warn('[useHomeStats] Error preloading cache:', error);
  }
}

/**
 * Clear the home stats cache for a specific owner
 * Call this when items are deleted to ensure fresh stats
 */
export async function clearHomeStatsCache(ownerId: string): Promise<void> {
  try {
    memoryCache.delete(ownerId);
    await AsyncStorage.removeItem(getCacheKey(ownerId));
  } catch (error) {
    console.warn('[useHomeStats] Error clearing cache:', error);
  }
}

function calculateCounts(
  allItems: any[],
  expiredItems: any[]
): Omit<HomeStats, 'pendingDates'> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  let todayCount = 0;
  let weekCount = 0;
  let okCount = 0;

  allItems.forEach((item) => {
    if (!item.expiry_date) return;

    const expiry = new Date(item.expiry_date);
    expiry.setHours(0, 0, 0, 0);

    const expiryTime = expiry.getTime();
    const todayTime = today.getTime();
    const weekTime = nextWeek.getTime();

    if (expiryTime === todayTime) {
      todayCount++;
      weekCount++; // Today is also part of "this week"
    } else if (expiryTime > todayTime && expiryTime <= weekTime) {
      weekCount++;
    } else if (expiryTime > weekTime) {
      okCount++;
    }
  });

  return {
    expired: expiredItems.length,
    today: todayCount,
    week: weekCount,
    ok: okCount,
    total: allItems.length + expiredItems.length,
  };
}

export function useHomeStats({ ownerId, autoFetch = true }: UseHomeStatsOptions): UseHomeStatsResult {
  // Check memory cache SYNCHRONOUSLY on every render
  // This is the key to instant display - we read directly from memory cache
  // BUT: Invalidate if cache is from a different day (midnight rollover)
  let memoryCached = ownerId ? memoryCache.get(ownerId) : null;

  if (memoryCached) {
    const cacheDate = new Date(memoryCached.timestamp);
    const today = new Date();
    if (
      cacheDate.getFullYear() !== today.getFullYear() ||
      cacheDate.getMonth() !== today.getMonth() ||
      cacheDate.getDate() !== today.getDate()
    ) {
      // Cache is from a different day - invalidate it
      memoryCache.delete(ownerId!);
      memoryCached = null;
    }
  }

  // Internal state for fresh data from Supabase
  const [freshStats, setFreshStats] = useState<HomeStats | null>(null);
  const [asyncCachedStats, setAsyncCachedStats] = useState<HomeStats | null>(null);
  const [cacheCheckDone, setCacheCheckDone] = useState(false);
  const [hasLoadedFresh, setHasLoadedFresh] = useState(false);
  const lastFetchRef = useRef<number>(memoryCached?.timestamp || 0);
  const currentOwnerRef = useRef<string | null>(null);

  // Compute the stats to display - priority: fresh > memory cache > async cache > default
  // This is computed synchronously on each render, so memory cache is instant!
  const stats: HomeStats = freshStats || memoryCached?.data || asyncCachedStats || DEFAULT_STATS;
  const hasCacheData = !!(memoryCached || asyncCachedStats || freshStats);

  // Fetch items from Supabase
  const { items: allItems, loading: loadingAll, refetch: refetchAll } = useItems({
    scope: 'all',
    ownerId: ownerId || undefined,
    autoFetch: autoFetch && !!ownerId,
  });

  const { items: expiredItems, loading: loadingExpired, refetch: refetchExpired } = useItems({
    scope: 'expired',
    ownerId: ownerId || undefined,
    autoFetch: autoFetch && !!ownerId,
  });

  // Handle owner change and load from AsyncStorage (fallback)
  useEffect(() => {
    if (!ownerId) return;

    // Skip if same owner
    if (currentOwnerRef.current === ownerId) return;
    currentOwnerRef.current = ownerId;

    // Reset state for new owner
    setFreshStats(null);
    setAsyncCachedStats(null);
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
      const cached = await loadCachedStats(ownerId);
      if (cached) {
        setAsyncCachedStats(cached);
        // Save to memory cache for instant access next time
        memoryCache.set(ownerId, { data: cached, timestamp: Date.now() });
      }
      setCacheCheckDone(true);
    };

    loadCache();
  }, [ownerId]);

  // Fetch pending items count
  const fetchPendingCount = useCallback(async (): Promise<number> => {
    if (!ownerId) return 0;
    try {
      return await getUnresolvedPendingItemsCount(ownerId);
    } catch (error) {
      console.warn('[useHomeStats] Error fetching pending count:', error);
      return 0;
    }
  }, [ownerId]);

  // Update stats when fresh data arrives from useItems
  useEffect(() => {
    if (!ownerId) return;
    if (loadingAll || loadingExpired) return;

    const updateStats = async () => {
      const counts = calculateCounts(allItems, expiredItems);
      const pendingDates = await fetchPendingCount();

      const newStats: HomeStats = {
        ...counts,
        pendingDates,
      };

      // Check what we're currently displaying
      const currentStats = freshStats || memoryCached?.data || asyncCachedStats || DEFAULT_STATS;

      // Check if anything actually changed compared to current display
      const hasChanged =
        currentStats.expired !== newStats.expired ||
        currentStats.today !== newStats.today ||
        currentStats.week !== newStats.week ||
        currentStats.ok !== newStats.ok ||
        currentStats.total !== newStats.total ||
        currentStats.pendingDates !== newStats.pendingDates;

      if (hasChanged || !hasLoadedFresh) {
        // Save to both memory cache and AsyncStorage
        const now = Date.now();
        memoryCache.set(ownerId, { data: newStats, timestamp: now });
        saveCachedStats(ownerId, newStats);
        setFreshStats(newStats);
      }

      setHasLoadedFresh(true);
      lastFetchRef.current = Date.now();
    };

    updateStats();
  }, [ownerId, allItems, expiredItems, loadingAll, loadingExpired, fetchPendingCount, hasLoadedFresh, freshStats, memoryCached, asyncCachedStats]);

  // Refetch function - clears cache and fetches fresh data
  const refetch = useCallback(async () => {
    if (!ownerId) return;

    // Clear memory cache to force fresh calculation
    memoryCache.delete(ownerId);

    // Reset fresh stats so new data will be used
    setFreshStats(null);
    setHasLoadedFresh(false);

    // Fetch fresh items from database
    await Promise.all([refetchAll(), refetchExpired()]);
  }, [ownerId, refetchAll, refetchExpired]);

  // Determine if we should show skeleton
  // 
  // Key principle: Once we have ANY data (from cache or fresh), NEVER show skeleton again.
  // Even during refresh, keep showing the current data.
  //
  // Show skeleton ONLY when:
  // 1. We have an owner (otherwise nothing to load)
  // 2. AND we have no data to display yet (no cache AND no fresh fetch completed)
  //
  // IMPORTANT: We don't check loadingAll/loadingExpired here because there's a timing gap
  // between when useItems finishes loading and when we calculate stats. During that gap,
  // we'd show 0s instead of skeleton.

  const hasAnyData = hasCacheData || hasLoadedFresh;

  // isLoading = true means "show skeleton"
  // Simple condition: show skeleton until we have data
  const isLoading = !!ownerId && !hasAnyData;

  return {
    stats,
    isLoading,
    hasCache: hasCacheData,
    refetch,
    lastFetchTime: lastFetchRef.current,
  };
}

export { STALE_TIME };

