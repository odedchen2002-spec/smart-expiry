/**
 * Categories Context
 * Global state management for categories with cache and staleTime
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { getCategories, getProductsByCategory } from '@/lib/supabase/queries/categories';
import { 
  loadCachedCategories, 
  saveCachedCategories, 
  loadCachedCategoriesFull,
  saveCachedCategoriesFull,
  Category 
} from '@/lib/cache/categoriesCache';

interface CategoriesContextValue {
  categories: Category[];
  productCounts: Record<string, number>;
  loading: boolean;
  error: Error | null;
  refresh: (force?: boolean) => Promise<void>;
  invalidate: () => void;
  addCategoryOptimistic: (category: Category) => void;
  updateCategoryOptimistic: (oldName: Category, newName: Category) => void;
  deleteCategoryOptimistic: (category: Category) => void;
}

const CategoriesContext = createContext<CategoriesContextValue | undefined>(undefined);

const STALE_TIME = 60 * 1000; // 60 seconds

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const { activeOwnerId } = useActiveOwner();
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoadedFromCache, setHasLoadedFromCache] = useState(false);
  
  const lastFetchTimeRef = useRef<number>(0);
  const fetchInProgressRef = useRef<boolean>(false);

  // Load from cache immediately on mount or owner change
  useEffect(() => {
    if (!activeOwnerId) {
      setCategories([]);
      setProductCounts({});
      setHasLoadedFromCache(false);
      lastFetchTimeRef.current = 0;
      return;
    }

    const loadFromCache = async () => {
      if (hasLoadedFromCache) return; // Only load from cache once per owner

      try {
        // Try loading full cache first (with productCounts + lastFetchedAt)
        const fullCache = await loadCachedCategoriesFull(activeOwnerId);
        if (fullCache) {
          setCategories(fullCache.categories);
          setProductCounts(fullCache.productCounts);
          lastFetchTimeRef.current = fullCache.lastFetchedAt;
        } else {
          // Fallback to legacy cache (categories only)
          const cached = await loadCachedCategories(activeOwnerId);
          if (cached && cached.length > 0) {
            setCategories(cached);
            // Set product counts to 0 (will be updated on background refresh)
            const counts: Record<string, number> = {};
            cached.forEach((cat) => {
              counts[cat] = 0;
            });
            setProductCounts(counts);
            lastFetchTimeRef.current = 0; // Mark as stale to trigger refresh
          }
        }
      } catch (error) {
        console.log('[CategoriesContext] Failed to load cached categories', error);
      } finally {
        setHasLoadedFromCache(true);
      }
    };

    loadFromCache();
  }, [activeOwnerId, hasLoadedFromCache]);

  // Background refresh with staleTime
  const refresh = useCallback(async (force = false) => {
    if (!activeOwnerId) return;

    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    const isStale = timeSinceLastFetch > STALE_TIME;
    const hasNoCounts = categories.length > 0 && Object.keys(productCounts).length === 0;
    // Check if all counts are 0 (which means they're from cache and not yet loaded)
    const allCountsAreZero = categories.length > 0 && 
      Object.keys(productCounts).length > 0 && 
      Object.values(productCounts).every(count => count === 0);

    // Skip if not stale, not forced, and we already have real counts (not all zeros)
    if (!force && !isStale && !hasNoCounts && !allCountsAreZero && categories.length > 0) {
      return;
    }

    // Prevent multiple simultaneous fetches
    if (fetchInProgressRef.current) {
      return;
    }

    fetchInProgressRef.current = true;
    setError(null);

    try {
      // Only show loading if we don't have cached data
      if (categories.length === 0) {
        setLoading(true);
      }

      const cats = await getCategories(activeOwnerId);
      
      // Check if categories changed
      const currentCatsSorted = [...categories].sort();
      const newCatsSorted = [...cats].sort();
      const hasChanged = JSON.stringify(newCatsSorted) !== JSON.stringify(currentCatsSorted);
      
      // Always update product counts (they can change even if categories don't)
      // Get product counts for each category (in parallel)
      const counts: Record<string, number> = {};
      await Promise.all(
        cats.map(async (cat) => {
          const products = await getProductsByCategory(activeOwnerId, cat);
          counts[cat] = products.length;
        })
      );
      setProductCounts(counts);
      
      // Only update categories if they changed
      if (hasChanged || force) {
        setCategories(cats);
      }

      // Always save full cache (categories + productCounts + lastFetchedAt)
      await saveCachedCategoriesFull(activeOwnerId, {
        categories: cats,
        productCounts: counts,
        lastFetchedAt: now,
      });

      lastFetchTimeRef.current = now;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load categories');
      setError(error);
      console.error('[CategoriesContext] Error refreshing categories:', error);
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [activeOwnerId, categories, productCounts]);

  // Initial load: cache first, then background refresh
  useEffect(() => {
    if (!activeOwnerId || !hasLoadedFromCache) return;

    // Always refresh in background on initial load to get product counts
    // This ensures counts are loaded even if cache exists
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    const isStale = timeSinceLastFetch > STALE_TIME;
    const isFirstLoad = lastFetchTimeRef.current === 0;
    const hasNoCounts = categories.length > 0 && Object.keys(productCounts).length === 0;
    // Check if all counts are 0 (which means they're from cache and not yet loaded)
    const allCountsAreZero = categories.length > 0 && 
      Object.keys(productCounts).length > 0 && 
      Object.values(productCounts).every(count => count === 0);

    // Refresh if stale OR if first load OR if we have categories but no counts yet OR all counts are 0
    if (isStale || isFirstLoad || categories.length === 0 || hasNoCounts || allCountsAreZero) {
      refresh(false); // Background refresh
    }
  }, [activeOwnerId, hasLoadedFromCache, refresh, categories.length, productCounts]);

  // Invalidate cache (force next refresh)
  const invalidate = useCallback(() => {
    lastFetchTimeRef.current = 0;
  }, []);

  // Optimistic update helpers
  const addCategoryOptimistic = useCallback((category: Category) => {
    setCategories((prev) => {
      if (prev.includes(category)) return prev;
      const next = [...prev, category];
      return next.sort((a, b) => a.localeCompare(b));
    });
    setProductCounts((prev) => ({
      ...prev,
      [category]: 0,
    }));
  }, []);

  const updateCategoryOptimistic = useCallback((oldName: Category, newName: Category) => {
    setCategories((prev) => {
      const updated = prev.map((c) => (c === oldName ? newName : c));
      return [...updated].sort((a, b) => a.localeCompare(b));
    });
    setProductCounts((prev) => {
      const next = { ...prev };
      next[newName] = prev[oldName] || 0;
      delete next[oldName];
      return next;
    });
  }, []);

  const deleteCategoryOptimistic = useCallback((category: Category) => {
    setCategories((prev) => prev.filter((c) => c !== category));
    setProductCounts((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
  }, []);

  const value: CategoriesContextValue = {
    categories,
    productCounts,
    loading,
    error,
    refresh,
    invalidate,
    addCategoryOptimistic,
    updateCategoryOptimistic,
    deleteCategoryOptimistic,
  };

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoriesContext);
  if (context === undefined) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
}

