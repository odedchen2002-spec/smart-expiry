/**
 * Hook for fetching and managing items
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getItemsExpiringToday,
  getItemsExpiringTomorrow,
  getItemsExpiringNextWeek,
  getAllItems,
  getExpiredItems,
  type ItemsQueryOptions,
} from '../supabase/queries/items';
import { useSubscription } from './useSubscription';
import type { Database } from '@/types/database';
import { supabase } from '@/lib/supabase/client';
import { saveItemsToCache, loadItemsFromCache } from '@/lib/storage/itemsCache';
import { logSubscription } from '../logging/subscriptionLogger';

type ItemWithDetails = Database['public']['Views']['items_with_details']['Row'];

export type ItemsScope = 'today' | 'tomorrow' | 'week' | 'all' | 'expired';

interface UseItemsOptions {
  scope: ItemsScope;
  ownerId?: string; // Changed from businessId to ownerId
  autoFetch?: boolean;
}

export function useItems({ scope, ownerId, autoFetch = true }: UseItemsOptions) {
  const { user } = useAuth();
  const { subscription, isPro, isFreeTrialActive } = useSubscription();
  const [allItems, setAllItems] = useState<ItemWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const fetchingRef = useRef(false);

  const enforceFreePlanLocks = useCallback(
    async (oid: string) => {
      try {
        if (!subscription) {
          return;
        }

        // Precedence: Pro > Free Trial > Free
        // Pro plan takes absolute precedence - unlock all items
        if (isPro) {
          try {
            logSubscription('[useItems] Pro plan active - unlocking all plan-locked items for owner:', oid);
            const { error: unlockError } = await supabase
              .from('items')
              .update({ is_plan_locked: false })
              .eq('owner_id', oid);

            if (unlockError) {
              console.error('[useItems] Error unlocking items for pro plan:', unlockError);
            } else {
              // Update local state immediately
              setAllItems((prev) =>
                prev.map((item) =>
                  item.is_plan_locked ? { ...item, is_plan_locked: false } : item
                )
              );
              logSubscription('[useItems] Successfully unlocked all items for Pro plan');
            }
          } catch (unlockEx) {
            console.error('[useItems] Exception while unlocking items for pro plan:', unlockEx);
          }
          return;
        }

        // Free trial active (and NOT Pro) - unlock all items
        if (isFreeTrialActive) {
          try {
            logSubscription('[useItems] Free trial active - unlocking all plan-locked items for owner:', oid);
            const { error: unlockError } = await supabase
              .from('items')
              .update({ is_plan_locked: false })
              .eq('owner_id', oid);

            if (unlockError) {
              console.error('[useItems] Error unlocking items for trial:', unlockError);
            } else {
              setAllItems((prev) =>
                prev.map((item) =>
                  item.is_plan_locked ? { ...item, is_plan_locked: false } : item
                )
              );
            }
          } catch (unlockEx) {
            console.error('[useItems] Exception while unlocking items for trial:', unlockEx);
          }
          return;
        }

        // Free plan - enforce item locks based on created_at order
        logSubscription('[useItems] Free plan - enforcing item locks for owner:', oid, {
          activeItemsCount: subscription.activeItemsCount,
          maxItems: subscription.maxItems,
        });

        // If maxItems is null (unlimited), don't apply locks
        if (subscription.maxItems === null) {
          return;
        }

        // Enforce free plan locks: keep first maxItems unlocked, lock the rest
        try {
          const FREE_PLAN_LIMIT = subscription.maxItems || 150;
          
          // Fetch all items for this owner, ordered by created_at ASC (oldest first)
          const { data: items, error: itemsError } = await supabase
            .from('items')
            .select('id')
            .eq('owner_id', oid)
            .order('created_at', { ascending: true });

          if (itemsError) {
            console.error('[useItems] Error fetching items for free plan lock enforcement:', itemsError);
            return;
          }

          if (!items || items.length === 0) {
            return;
          }

          // Compute the list of item IDs to keep unlocked (first FREE_PLAN_LIMIT items)
          const keepIds = items.slice(0, FREE_PLAN_LIMIT).map((item: any) => item.id);
          const totalItems = items.length;

          if (totalItems > FREE_PLAN_LIMIT) {
            // Lock all items first
            const { error: lockAllError } = await supabase
              .from('items')
              .update({ is_plan_locked: true })
              .eq('owner_id', oid);

            if (lockAllError) {
              console.error('[useItems] Failed to lock items:', lockAllError);
              return;
            }

            // Then unlock the first FREE_PLAN_LIMIT items
            if (keepIds.length > 0) {
              const { error: unlockError } = await supabase
                .from('items')
                .update({ is_plan_locked: false })
                .eq('owner_id', oid)
                .in('id', keepIds);

              if (unlockError) {
                console.error('[useItems] Failed to unlock kept items:', unlockError);
              } else {
                logSubscription('[useItems] Free plan locks enforced:', {
                  ownerId: oid,
                  totalItems,
                  unlockedCount: keepIds.length,
                  lockedCount: totalItems - keepIds.length,
                });
                
                // Update local state to reflect the locks
                setAllItems((prev) =>
                  prev.map((item) => {
                    const shouldBeLocked = !keepIds.includes(item.id);
                    return shouldBeLocked !== item.is_plan_locked
                      ? { ...item, is_plan_locked: shouldBeLocked }
                      : item;
                  })
                );
              }
            }
          } else {
            // All items fit within the limit, ensure all are unlocked
            const { error: unlockAllError } = await supabase
              .from('items')
              .update({ is_plan_locked: false })
              .eq('owner_id', oid);

            if (unlockAllError) {
              console.error('[useItems] Failed to unlock all items:', unlockAllError);
            } else {
              // Update local state
              setAllItems((prev) =>
                prev.map((item) =>
                  item.is_plan_locked ? { ...item, is_plan_locked: false } : item
                )
              );
            }
          }
        } catch (lockError) {
          console.error('[useItems] Exception while enforcing free plan locks:', lockError);
        }
      } catch (e) {
        console.error('[useItems] Exception in enforceFreePlanLocks:', e);
      }
    },
    [subscription, isPro, isFreeTrialActive]
  );

  // Helper function to filter items by scope
  const filterItemsByScope = useCallback((items: ItemWithDetails[], currentScope: ItemsScope): ItemWithDetails[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    switch (currentScope) {
      case 'today': {
        return items.filter((item) => {
          if (item.status === 'resolved') return false;
          if (!item.expiry_date) return false;
          const expiry = new Date(item.expiry_date);
          expiry.setHours(0, 0, 0, 0);
          return expiry.getTime() === today.getTime();
        });
      }
      case 'tomorrow': {
        return items.filter((item) => {
          if (item.status === 'resolved') return false;
          if (!item.expiry_date) return false;
          const expiry = new Date(item.expiry_date);
          expiry.setHours(0, 0, 0, 0);
          return expiry.getTime() === tomorrow.getTime();
        });
      }
      case 'week': {
        return items.filter((item) => {
          if (item.status === 'resolved') return false;
          if (!item.expiry_date) return false;
          const expiry = new Date(item.expiry_date);
          expiry.setHours(0, 0, 0, 0);
          return expiry.getTime() >= today.getTime() && expiry.getTime() <= nextWeek.getTime();
        });
      }
      case 'all': {
        return items.filter((item) => item.status !== 'resolved');
      }
      case 'expired': {
        return items.filter((item) => {
          if (!item.expiry_date) return false;
          const expiry = new Date(item.expiry_date);
          expiry.setHours(0, 0, 0, 0);
          return expiry.getTime() < today.getTime();
        });
      }
      default:
        return items;
    }
  }, []);

  const fetchItems = useCallback(async (oid?: string, skipCache = false) => {
    if (!oid) {
      setAllItems([]);
      setFromCache(false);
      return;
    }

    // Prevent multiple simultaneous fetches
    if (fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;
    setError(null);

    // Step 1: Try to load from cache first (unless skipCache is true)
    if (!skipCache) {
      try {
        const cached = await loadItemsFromCache(oid);
        if (cached && cached.items && cached.items.length > 0) {
          // Filter cached items by current scope
          const filteredCached = filterItemsByScope(cached.items, scope);
          
          // Apply Pro unlock if needed
          let processedCached = filteredCached;
          if (subscription?.isPaidActive && subscription?.plan === 'pro') {
            processedCached = filteredCached.map((item) => ({
              ...item,
              is_plan_locked: false,
            }));
          }

          setAllItems(processedCached);
          setFromCache(true);
          setLoading(false); // UI can render immediately with cached data
        } else {
          setLoading(true);
        }
      } catch (cacheError) {
        console.warn('[useItems] Error loading from cache:', cacheError);
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    // Step 2: Fetch fresh data from Supabase
    try {
      let data: ItemWithDetails[] = [];

      switch (scope) {
        case 'today':
          data = await getItemsExpiringToday(oid);
          break;
        case 'tomorrow':
          data = await getItemsExpiringTomorrow(oid);
          break;
        case 'week':
          data = await getItemsExpiringNextWeek(oid);
          break;
        case 'all':
          data = await getAllItems(oid);
          break;
        case 'expired':
          data = await getExpiredItems(oid);
          break;
      }

      // Free plan locking is now handled deterministically server-side when subscription changes.
      // We only need to ensure Pro/Trial unlocks are applied client-side.
      if (oid) {
        enforceFreePlanLocks(oid).catch(() => {
          // Error is already logged inside helper
        });
      }

      // If user is on Pro, ensure all items are unlocked in the fetched data
      // This handles the case where items are fetched after subscription upgrade
      let processedData = data;
      if (subscription?.isPaidActive && subscription?.plan === 'pro') {
        processedData = data.map((item) => ({
          ...item,
          is_plan_locked: false, // Force unlock for Pro users
        }));
      }

      setAllItems(processedData);
      setFromCache(false);
      setError(null);

      // Step 3: Update cache with all items (fetch all items in background for cache)
      // This ensures cache has complete data for all scopes
      getAllItems(oid)
        .then((allItemsData) => {
          // Apply Pro unlock to all items if needed
          let processedAllItems = allItemsData;
          if (subscription?.isPaidActive && subscription?.plan === 'pro') {
            processedAllItems = allItemsData.map((item) => ({
              ...item,
              is_plan_locked: false,
            }));
          }
          saveItemsToCache(oid, processedAllItems).catch((cacheError) => {
            console.warn('[useItems] Failed to update cache:', cacheError);
          });
        })
        .catch((err) => {
          console.warn('[useItems] Failed to fetch all items for cache:', err);
          // Don't fail the main fetch if cache update fails
        });
    } catch (err) {
      setError(err as Error);
      console.error('useItems: Error fetching items:', err);
      // Keep cached items if available (fromCache will still be true)
      // If there's no cache, items will be empty
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [scope, enforceFreePlanLocks, subscription, filterItemsByScope]);

  useEffect(() => {
    if (autoFetch && ownerId) {
      fetchItems(ownerId);
    }
  }, [autoFetch, ownerId, fetchItems]);

  // Create a subscription key that changes when subscription status changes
  // This ensures the effect triggers when subscription becomes Pro
  const subscriptionKey = useMemo(() => {
    if (!subscription) return null;
    return `${subscription.plan}-${subscription.isPaidActive}-${subscription.status}`;
  }, [subscription?.plan, subscription?.isPaidActive, subscription?.status]);

  // Immediately unlock items when subscription changes to Pro
  // This ensures instant UI update without waiting for refetch
  const prevSubscriptionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ownerId || !subscription || !subscriptionKey) {
      prevSubscriptionKeyRef.current = null;
      return;
    }

    const wasPro = prevSubscriptionKeyRef.current?.includes('pro-true') || false;
    const isPro = subscription.isPaidActive && subscription.plan === 'pro';

    // Only unlock if subscription just became Pro (wasn't Pro before)
    if (!wasPro && isPro) {
      // Optimistically update local state to remove locks immediately (SYNCHRONOUS)
      // This MUST happen before any async operations to ensure instant UI update
      setAllItems((prev) =>
        prev.map((item) =>
          item.is_plan_locked ? { ...item, is_plan_locked: false } : item
        )
      );

      // Unlock items in database in the background (async, non-blocking)
      (async () => {
        try {
          const { error: unlockError } = await supabase
            .from('items')
            .update({ is_plan_locked: false })
            .eq('owner_id', ownerId);

          if (unlockError) {
            console.error('[useItems] Error unlocking items in DB:', unlockError);
          }
        } catch (unlockEx) {
          console.error('[useItems] Exception while unlocking items in DB:', unlockEx);
        }
      })();
    }

    // Update ref for next comparison
    prevSubscriptionKeyRef.current = subscriptionKey;
  }, [ownerId, subscription, subscriptionKey]);

  // Also run enforceFreePlanLocks when subscription changes
  // This ensures items are unlocked/locked correctly based on current subscription
  useEffect(() => {
    if (ownerId && subscription) {
      enforceFreePlanLocks(ownerId).catch(() => {
        // Error is already logged inside helper
      });
    }
  }, [ownerId, subscription, isPro, isFreeTrialActive, enforceFreePlanLocks]);

  const refetch = useCallback(() => {
    if (ownerId) {
      fetchItems(ownerId, true); // Skip cache on manual refetch
    }
  }, [ownerId, fetchItems]);

  // Apply basic post-processing to items
  // Note: Expired items should always be shown in full
  const items = useMemo(() => {
    // Never apply subscription limits to expired items
    // Users should always see all their expired items
    if (scope === 'expired') {
      return allItems;
    }

    // For non-expired scopes, always show all items; limits are enforced via is_plan_locked + UI
    return allItems;
  }, [allItems, scope]);

  return {
    items,
    loading,
    error,
    refetch,
    totalItemsCount: allItems.length, // Total items including hidden ones
    fromCache, // Flag indicating if current items are from cache
  };
}

