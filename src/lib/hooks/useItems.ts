/**
 * Hook for fetching and managing items
 */

import { useAuth } from '@/context/AuthContext';
import { clearItemsCache, loadItemsFromCache, saveItemsToCache } from '@/lib/storage/itemsCache';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/types/database';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logSubscription } from '../logging/subscriptionLogger';
import {
  getAllItems,
  getExpiredItems,
  getItemsExpiringNextWeek,
  getItemsExpiringToday,
  getItemsExpiringTomorrow
} from '../supabase/queries/items';
import { useSubscription } from './useSubscription';

type ItemWithDetails = Database['public']['Views']['items_with_details']['Row'];

export type ItemsScope = 'today' | 'tomorrow' | 'week' | 'all' | 'expired';

// Global mutex to prevent concurrent DB unlock operations (causes deadlock)
// UI will still show correct lock state due to useMemo force-unlock for Pro users
let isUnlockingInProgress = false;

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

  // Refs to store subscription values without causing fetchItems to be recreated
  const subscriptionRef = useRef(subscription);
  const isProRef = useRef(isPro);
  const isFreeTrialActiveRef = useRef(isFreeTrialActive);

  // Keep refs in sync
  useEffect(() => {
    subscriptionRef.current = subscription;
    isProRef.current = isPro;
    isFreeTrialActiveRef.current = isFreeTrialActive;
  }, [subscription, isPro, isFreeTrialActive]);

  // Track if we've done the initial fetch to prevent flickering
  const hasInitialFetchRef = useRef(false);
  // Track if we had items (to allow update to empty when items are deleted)
  const hadItemsRef = useRef(false);

  // Track if we have items (for allowing empty list updates after deletion)
  useEffect(() => {
    hadItemsRef.current = allItems.length > 0;
  }, [allItems.length]);

  const enforceFreePlanLocks = useCallback(
    async (oid: string) => {
      try {
        // Use refs to get current values without causing callback recreation
        const currentSubscription = subscriptionRef.current;
        const currentIsPro = isProRef.current;

        if (!currentSubscription) {
          return;
        }

        // Skip DB operations if another lock/unlock is in progress (prevents deadlock)
        // UI will still show correct state due to useMemo force-unlock
        if (isUnlockingInProgress) {
          logSubscription('[useItems] Skipping enforceFreePlanLocks - another operation in progress');
          return;
        }

        isUnlockingInProgress = true;

        // Precedence: Pro > Free Trial > Free
        // Pro plan takes absolute precedence - unlock all items
        if (currentIsPro) {
          try {
            logSubscription('[useItems] Pro plan active - unlocking all plan-locked items for owner:', oid);
            const { error: unlockError } = await (supabase.from('items') as any)
              .update({ is_plan_locked: false })
              .eq('owner_id', oid);

            if (unlockError) {
              // Handle deadlock gracefully
              if (unlockError.code === '40P01') {
                console.warn('[useItems] Deadlock in Pro unlock (UI is correct, skipping)');
              } else {
                // Suppress network errors (expected when offline)
                const errorMsg = unlockError?.message || '';
                const isNetworkError = errorMsg.includes('Network request failed') ||
                  errorMsg.includes('Failed to fetch') ||
                  errorMsg.includes('network');
                if (!isNetworkError) {
                  console.error('[useItems] Error unlocking items for pro plan:', unlockError);
                }
              }
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
          } finally {
            isUnlockingInProgress = false;
          }
          return;
        }

        // Free trial active (and NOT Pro) - unlock all items
        const currentIsFreeTrialActive = isFreeTrialActiveRef.current;
        if (currentIsFreeTrialActive) {
          try {
            logSubscription('[useItems] Free trial active - unlocking all plan-locked items for owner:', oid);
            const { error: unlockError } = await (supabase.from('items') as any)
              .update({ is_plan_locked: false })
              .eq('owner_id', oid);

            if (unlockError) {
              if (unlockError.code === '40P01') {
                console.warn('[useItems] Deadlock in Trial unlock (UI is correct, skipping)');
              } else {
                console.error('[useItems] Error unlocking items for trial:', unlockError);
              }
            } else {
              setAllItems((prev) =>
                prev.map((item) =>
                  item.is_plan_locked ? { ...item, is_plan_locked: false } : item
                )
              );
            }
          } catch (unlockEx) {
            console.error('[useItems] Exception while unlocking items for trial:', unlockEx);
          } finally {
            isUnlockingInProgress = false;
          }
          return;
        }

        // Free plan - enforce item locks based on created_at order
        logSubscription('[useItems] Free plan - enforcing item locks for owner:', oid, {
          activeItemsCount: currentSubscription.activeItemsCount,
          maxItems: currentSubscription.maxItems,
        });

        // If maxItems is null (unlimited), don't apply locks
        if (currentSubscription.maxItems === null) {
          isUnlockingInProgress = false;
          return;
        }

        // Enforce free plan locks: keep first maxItems unlocked, lock the rest
        try {
          const FREE_PLAN_LIMIT = currentSubscription.maxItems || 150;

          // Fetch ONLY non-resolved items for this owner, ordered by created_at ASC (oldest first)
          const { data: items, error: itemsError } = await (supabase.from('items') as any)
            .select('id')
            .eq('owner_id', oid)
            .neq('status', 'resolved')
            .order('created_at', { ascending: true });

          if (itemsError) {
            // Suppress network errors (expected when offline)
            const errorMsg = itemsError?.message || '';
            const isNetworkError = errorMsg.includes('Network request failed') ||
              errorMsg.includes('Failed to fetch') ||
              errorMsg.includes('network');
            if (!isNetworkError) {
              console.error('[useItems] Error fetching items for free plan lock enforcement:', itemsError);
            }
            isUnlockingInProgress = false;
            return;
          }

          if (!items || items.length === 0) {
            isUnlockingInProgress = false;
            return;
          }

          // Compute the list of item IDs to keep unlocked (first FREE_PLAN_LIMIT items)
          const keepIds = items.slice(0, FREE_PLAN_LIMIT).map((item: any) => item.id);
          const totalItems = items.length;

          if (totalItems > FREE_PLAN_LIMIT) {
            // Lock all NON-RESOLVED items first
            const { error: lockAllError } = await (supabase.from('items') as any)
              .update({ is_plan_locked: true })
              .eq('owner_id', oid)
              .neq('status', 'resolved');

            if (lockAllError) {
              console.error('[useItems] Failed to lock items:', lockAllError);
              isUnlockingInProgress = false;
              return;
            }

            // Then unlock the first FREE_PLAN_LIMIT items
            if (keepIds.length > 0) {
              const { error: unlockError } = await (supabase.from('items') as any)
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
            // All items fit within the limit, ensure all NON-RESOLVED items are unlocked
            const { error: unlockAllError } = await (supabase.from('items') as any)
              .update({ is_plan_locked: false })
              .eq('owner_id', oid)
              .neq('status', 'resolved');

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
        } catch (lockError: any) {
          // Suppress network errors (expected when offline)
          const errorMsg = lockError?.message || '';
          const isNetworkError = errorMsg.includes('Network request failed') ||
            errorMsg.includes('Failed to fetch') ||
            errorMsg.includes('network');
          if (!isNetworkError) {
            console.error('[useItems] Exception while enforcing free plan locks:', lockError);
          }
        } finally {
          isUnlockingInProgress = false;
        }
      } catch (e: any) {
        // Suppress network errors (expected when offline)
        const errorMsg = e?.message || '';
        const isNetworkError = errorMsg.includes('Network request failed') ||
          errorMsg.includes('Failed to fetch') ||
          errorMsg.includes('network');
        if (!isNetworkError) {
          console.error('[useItems] Exception in enforceFreePlanLocks:', e);
        }
        isUnlockingInProgress = false;
      }
    },
    // Note: subscription, isPro, and isFreeTrialActive are accessed via refs
    // This makes enforceFreePlanLocks stable and prevents unnecessary recreations
    []
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
          if (item.status === 'resolved') return false;
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
      // ANTI-FLICKER: Don't clear items if we already have some (prevents flickering)
      if (!hasInitialFetchRef.current) {
        setAllItems([]);
      }
      setFromCache(false);
      return;
    }

    // Prevent multiple simultaneous fetches
    if (fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;
    setError(null);

    // Use refs for subscription to avoid recreating fetchItems
    const currentSubscription = subscriptionRef.current;
    const currentIsPro = isProRef.current;

    // Step 1: Try to load from cache first (unless skipCache is true)
    if (!skipCache) {
      try {
        const cached = await loadItemsFromCache(oid);
        if (cached && cached.items && cached.items.length > 0) {
          // Filter cached items by current scope
          const filteredCached = filterItemsByScope(cached.items, scope);

          // Apply Pro Plus unlock if needed (Pro respects server-side limits)
          let processedCached = filteredCached;
          if (currentSubscription?.isPaidActive && currentSubscription?.plan === 'pro_plus') {
            processedCached = filteredCached.map((item) => ({
              ...item,
              is_plan_locked: false,
            }));
          }

          setAllItems(processedCached);
          setFromCache(true);
          setLoading(false); // UI can render immediately with cached data
          hasInitialFetchRef.current = true;
        } else if (!hasInitialFetchRef.current) {
          // Only show loading if we haven't fetched before
          setLoading(true);
        }
      } catch (cacheError) {
        console.warn('[useItems] Error loading from cache:', cacheError);
        if (!hasInitialFetchRef.current) {
          setLoading(true);
        }
      }
    } else if (!hasInitialFetchRef.current) {
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

      // DISABLED: Free plan locking is now handled by enforce_plan_limits Postgres function
      // This client-side logic was conflicting with server-side enforcement
      // if (oid) {
      //   enforceFreePlanLocks(oid).catch(() => {
      //     // Error is already logged inside helper
      //   });
      // }

      // If user is on Pro Plus (unlimited), ensure all items are unlocked in the fetched data
      // Pro plan (2000 limit) respects server-side locking
      let processedData = data;
      if (currentSubscription?.isPaidActive && currentSubscription?.plan === 'pro_plus') {
        processedData = data.map((item) => ({
          ...item,
          is_plan_locked: false, // Force unlock for Pro Plus users (unlimited)
        }));
      }

      // ANTI-FLICKER: Only update if we have data, this is the first fetch, 
      // OR if we previously had items (meaning items were deleted)
      // This prevents brief empty screen when transitioning from cache to fresh,
      // while still allowing the UI to update when all items are deleted
      if (processedData.length > 0 || !hasInitialFetchRef.current || hadItemsRef.current) {
        setAllItems(processedData);
        hasInitialFetchRef.current = true;
      }
      setFromCache(false);
      setError(null);

      // Step 3: Update cache with all items (fetch all items in background for cache)
      // This ensures cache has complete data for all scopes
      getAllItems(oid)
        .then((allItemsData) => {
          // Apply Pro Plus unlock to all items if needed (use ref to get current value)
          let processedAllItems = allItemsData;
          const subNow = subscriptionRef.current;
          if (subNow?.isPaidActive && subNow?.plan === 'pro_plus') {
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
      // Check if it's a network error - if so, fall back to cache
      const errorMessage = (err as Error)?.message || '';
      const isNetworkError = errorMessage.includes('Network request failed') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('network');
      
      // Only log non-network errors (network errors are expected when offline)
      if (!isNetworkError) {
        console.error('[useItems] Error fetching items:', err);
      } else {
        console.log('[useItems] Network error (offline), using cached data');
      }

      if (isNetworkError && skipCache) {
        // We tried to skip cache but network failed - fall back to cache
        console.log('[useItems] Network error with skipCache - falling back to cache');
        try {
          const cached = await loadItemsFromCache(oid);
          if (cached && cached.items && cached.items.length > 0) {
            const filteredCached = filterItemsByScope(cached.items, scope);
            let processedCached = filteredCached;
            if (currentSubscription?.isPaidActive && currentSubscription?.plan === 'pro_plus') {
              processedCached = filteredCached.map((item) => ({
                ...item,
                is_plan_locked: false,
              }));
            }
            setAllItems(processedCached);
            setFromCache(true);
            hasInitialFetchRef.current = true;
            setError(null); // Clear error since we have cached data
          }
        } catch (cacheError) {
          console.warn('[useItems] Error loading from cache after network failure:', cacheError);
          setError(err as Error);
        }
      } else {
        setError(err as Error);
      }
      // Keep cached items if available (fromCache will still be true)
      // If there's no cache, items will be empty
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
    // Note: subscription is accessed via ref, so it's not in dependencies
    // This prevents fetchItems from being recreated on every subscription change
  }, [scope, enforceFreePlanLocks, filterItemsByScope]);

  // Separate effect for initial fetch - only depends on ownerId
  // This prevents refetching when subscription changes
  useEffect(() => {
    if (autoFetch && ownerId) {
      fetchItems(ownerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, ownerId]);

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

    const wasProPlus = prevSubscriptionKeyRef.current?.includes('pro_plus-true') || false;
    const isNowProPlus = subscription.isPaidActive && subscription.plan === 'pro_plus';

    // Only unlock if subscription just became Pro Plus (wasn't Pro Plus before)
    if (!wasProPlus && isNowProPlus) {
      logSubscription('[useItems] Subscription upgraded to Pro Plus - unlocking all items immediately');

      // 1) Optimistically update local state to remove locks immediately (SYNCHRONOUS)
      // This MUST happen before any async operations to ensure instant UI update
      setAllItems((prev) =>
        prev.map((item) =>
          item.is_plan_locked ? { ...item, is_plan_locked: false } : item
        )
      );

      // 2) Unlock items in database, clear cache, and refetch (async, non-blocking)
      // Use mutex to prevent concurrent DB updates (causes deadlock)
      (async () => {
        if (isUnlockingInProgress) {
          logSubscription('[useItems] Skipping DB unlock - another unlock in progress');
          return;
        }

        isUnlockingInProgress = true;
        try {
          // Unlock all items in database
          const { error: unlockError } = await (supabase.from('items') as any)
            .update({ is_plan_locked: false })
            .eq('owner_id', ownerId);

          if (unlockError) {
            // Deadlock or other error - UI is fine due to useMemo, just log
            if (unlockError.code === '40P01') {
              console.warn('[useItems] Deadlock while unlocking items in DB (UI is correct, skipping)');
            } else {
              console.error('[useItems] Error unlocking items in DB:', unlockError);
            }
          } else {
            logSubscription('[useItems] Successfully unlocked all items in DB for Pro Plus user');
          }

          // Clear the stale cache so other screens get fresh data
          await clearItemsCache(ownerId);
          logSubscription('[useItems] Cleared items cache after Pro Plus upgrade');

          // Refetch fresh data from DB (skip cache) to ensure this instance has latest data
          fetchItems(ownerId, true);
        } catch (unlockEx) {
          console.error('[useItems] Exception while unlocking items in DB:', unlockEx);
        } finally {
          isUnlockingInProgress = false;
        }
      })();
    }

    // Update ref for next comparison
    prevSubscriptionKeyRef.current = subscriptionKey;
  }, [ownerId, subscription, subscriptionKey, fetchItems]);

  // DISABLED: enforceFreePlanLocks conflicts with enforce_plan_limits Postgres function
  // Plan limits are now enforced server-side in enforce_plan_limits
  // useEffect(() => {
  //   if (ownerId && subscription) {
  //     enforceFreePlanLocks(ownerId).catch(() => {
  //       // Error is already logged inside helper
  //     });
  //   }
  // }, [ownerId, subscription, isPro, isFreeTrialActive, enforceFreePlanLocks]);

  const refetch = useCallback(async () => {
    if (ownerId) {
      await fetchItems(ownerId, true); // Skip cache on manual refetch
    }
  }, [ownerId, fetchItems]);

  /**
   * Optimistically remove an item from the list for instant UI feedback
   * Returns a rollback function to restore the item if the API call fails
   */
  const optimisticRemove = useCallback((itemId: string): (() => void) => {
    let removedItem: ItemWithDetails | null = null;
    let removedIndex = -1;

    // Immediately remove the item from state
    setAllItems((prev) => {
      removedIndex = prev.findIndex(item => item.id === itemId);
      if (removedIndex !== -1) {
        removedItem = prev[removedIndex];
        return prev.filter(item => item.id !== itemId);
      }
      return prev;
    });

    // Return a rollback function
    return () => {
      if (removedItem && removedIndex !== -1) {
        setAllItems((prev) => {
          // Insert item back at its original position
          const newItems = [...prev];
          newItems.splice(removedIndex, 0, removedItem!);
          return newItems;
        });
      }
    };
  }, []);

  // Apply basic post-processing to items
  // CRITICAL: Force-unlock only for Pro Plus (unlimited) or Trial users
  // Pro users (2000 limit) should see locks from server-side enforcement
  const items = useMemo(() => {
    // Pro Plus or Trial users should NEVER see locked items
    const isProPlus = subscription?.isPaidActive && subscription?.plan === 'pro_plus';
    
    if (isProPlus || isFreeTrialActive) {
      return allItems.map((item) =>
        item.is_plan_locked ? { ...item, is_plan_locked: false } : item
      );
    }

    // Free and Pro users see items as-is (locks applied by server-side enforcement)
    return allItems;
  }, [allItems, subscription, isFreeTrialActive]);

  return {
    items,
    loading,
    error,
    refetch,
    optimisticRemove, // For instant UI feedback on item removal
    totalItemsCount: allItems.length, // Total items including hidden ones
    fromCache, // Flag indicating if current items are from cache
  };
}

