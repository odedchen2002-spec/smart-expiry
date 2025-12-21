/**
 * useNotificationsHistory Hook
 * 
 * Provides notifications history with caching, background refresh, and pagination.
 * - Shows cached data immediately on mount
 * - Background refresh only if cache is stale (60s)
 * - Supports infinite scroll pagination
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  NotificationHistory,
  getNotificationHistoryPaginated,
} from '../supabase/queries/notifications';
import {
  getCachedNotifications,
  setCachedNotifications,
  appendCachedNotifications,
  prependNotification,
  isCacheStale,
  loadCacheFromStorage,
  PAGE_SIZE,
} from '../stores/notificationsCache';
import { supabase } from '../supabase/client';

interface UseNotificationsHistoryOptions {
  userId: string | undefined;
  ownerId: string | undefined;
  enabled?: boolean;
}

interface UseNotificationsHistoryResult {
  notifications: NotificationHistory[];
  isLoading: boolean;        // Initial load (no cache)
  isFetching: boolean;       // Background fetch in progress
  isRefreshing: boolean;     // Pull-to-refresh in progress
  isLoadingMore: boolean;    // Loading next page
  hasMore: boolean;
  hasInitialized: boolean;   // True after first data check (cache or fetch)
  error: Error | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function useNotificationsHistory({
  userId,
  ownerId,
  enabled = true,
}: UseNotificationsHistoryOptions): UseNotificationsHistoryResult {
  const [notifications, setNotifications] = useState<NotificationHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // hasInitialized = true ONLY after we've done a real fetch with valid userId/ownerId
  const [hasInitialized, setHasInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  
  const isMounted = useRef(true);
  const isLoadingMoreRef = useRef(false);
  const lastUserOwnerRef = useRef<string | null>(null);

  // Load from cache and optionally fetch fresh data
  // IMPORTANT: Never reset notifications to [] - always preserve existing data during fetch
  const loadData = useCallback(async (forceRefresh: boolean = false) => {
    // If userId/ownerId not ready, don't do anything - keep isLoading true, hasInitialized false
    if (!userId || !ownerId || !enabled) {
      return;
    }
    
    const userOwnerKey = `${userId}_${ownerId}`;
    const isNewUserOwner = lastUserOwnerRef.current !== userOwnerKey;
    
    // If switching to different user/owner, load from storage first
    if (isNewUserOwner) {
      lastUserOwnerRef.current = userOwnerKey;
      
      // First try to load from AsyncStorage (persisted cache)
      const storedCache = await loadCacheFromStorage(userId, ownerId);
      if (storedCache && storedCache.data.length > 0) {
        setNotifications(storedCache.data);
        setHasMore(storedCache.hasMore);
        setCursor(storedCache.lastId);
        setIsLoading(false);
        setHasInitialized(true);
        
        // If cache is fresh, we're done
        if (!isCacheStale(userId, ownerId) && !forceRefresh) {
          return;
        }
        // Otherwise continue to background fetch below
      }
    }

    try {
      // Check in-memory cache
      const cached = getCachedNotifications(userId, ownerId);
      const hasExistingData = (cached && cached.data.length > 0) || notifications.length > 0;
      
      if (cached && !forceRefresh && !isNewUserOwner) {
        // We have fresh cache - use it
        setNotifications(cached.data);
        setHasMore(cached.hasMore);
        setCursor(cached.lastId);
        setIsLoading(false);
        setHasInitialized(true);
        
        // Check if cache is stale and fetch in background
        if (isCacheStale(userId, ownerId)) {
          setIsFetching(true);
          try {
            const result = await getNotificationHistoryPaginated(userId, ownerId, PAGE_SIZE);
            if (isMounted.current) {
              setNotifications(result.data);
              setHasMore(result.hasMore);
              setCursor(result.nextCursor);
              setCachedNotifications(userId, ownerId, result.data, result.hasMore);
            }
          } catch (err) {
            console.error('Background fetch error:', err);
            // Don't update error state for background fetches - keep showing cached data
          } finally {
            if (isMounted.current) {
              setIsFetching(false);
            }
          }
        }
      } else {
        // No cache or force refresh - fetch fresh data
        setIsFetching(true);
        // Only show full loading if we have no data to display
        if (!hasExistingData) {
          setIsLoading(true);
        }
        
        const result = await getNotificationHistoryPaginated(userId, ownerId, PAGE_SIZE);
        
        if (isMounted.current) {
          setNotifications(result.data);
          setHasMore(result.hasMore);
          setCursor(result.nextCursor);
          setCachedNotifications(userId, ownerId, result.data, result.hasMore);
          setError(null);
          setIsLoading(false);
          setHasInitialized(true);
        }
      }
    } catch (err) {
      console.error('Error loading notifications:', err);
      if (isMounted.current) {
        setError(err as Error);
        setIsLoading(false);
        setHasInitialized(true); // Mark as initialized even on error
        // On error, don't clear existing notifications - keep showing what we have
      }
    } finally {
      if (isMounted.current) {
        setIsFetching(false);
        setIsRefreshing(false);
      }
    }
  }, [userId, ownerId, enabled, notifications.length]);

  // Initial load
  useEffect(() => {
    isMounted.current = true;
    loadData();
    
    return () => {
      isMounted.current = false;
    };
  }, [loadData]);

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!userId || !ownerId || !enabled) return;

    const channel = supabase
      .channel(`notif_history_hook_${userId}_${ownerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_sent_log',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          // Only handle if the notification is for the current owner
          if ((payload.new as any)?.owner_id === ownerId) {
            // Fetch fresh data to ensure consistency
            setTimeout(() => {
              loadData(true);
            }, 100);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, ownerId, enabled, loadData]);

  // Refresh function (pull-to-refresh)
  const refresh = useCallback(async () => {
    if (!userId || !ownerId) return;
    
    setIsRefreshing(true);
    await loadData(true);
  }, [userId, ownerId, loadData]);

  // Load more function (pagination)
  const loadMore = useCallback(async () => {
    if (!userId || !ownerId || !hasMore || isLoadingMoreRef.current) return;
    
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    
    try {
      const result = await getNotificationHistoryPaginated(userId, ownerId, PAGE_SIZE, cursor);
      
      if (isMounted.current) {
        setNotifications(prev => {
          // Deduplicate
          const existingIds = new Set(prev.map(n => n.id));
          const uniqueNew = result.data.filter(n => !existingIds.has(n.id));
          return [...prev, ...uniqueNew];
        });
        setHasMore(result.hasMore);
        setCursor(result.nextCursor);
        appendCachedNotifications(userId, ownerId, result.data, result.hasMore);
      }
    } catch (err) {
      console.error('Error loading more notifications:', err);
      if (isMounted.current) {
        setError(err as Error);
      }
    } finally {
      if (isMounted.current) {
        setIsLoadingMore(false);
      }
      isLoadingMoreRef.current = false;
    }
  }, [userId, ownerId, hasMore, cursor]);

  return {
    notifications,
    isLoading,
    isFetching,
    isRefreshing,
    isLoadingMore,
    hasMore,
    hasInitialized,
    error,
    refresh,
    loadMore,
  };
}

