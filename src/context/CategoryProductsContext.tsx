/**
 * Category Products Context
 * Global cache for products by category with staleTime
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { getProductsByCategory, getProductsNotInCategory } from '@/lib/supabase/queries/categories';
import {
  loadCachedCategoryProducts,
  saveCachedCategoryProducts,
  loadCachedProductsNotInCategory,
  saveCachedProductsNotInCategory,
} from '@/lib/cache/categoryProductsCache';
import type { Database } from '@/types/database';

type Product = Database['public']['Tables']['products']['Row'];

interface CategoryProductsCache {
  items: Product[];
  lastFetchedAt: number;
}

interface CategoryProductsContextValue {
  getCategoryProducts: (category: string | null) => Product[];
  refreshCategoryProducts: (category: string | null, force?: boolean) => Promise<void>;
  getProductsNotInCategory: (category: string | null) => Product[];
  refreshProductsNotInCategory: (category: string | null, force?: boolean) => Promise<void>;
  addProductOptimistic: (category: string | null, product: Product) => void;
  updateProductOptimistic: (category: string | null, productId: string, updates: Partial<Product>) => void;
  removeProductOptimistic: (category: string | null, productId: string) => void;
  removeProductFromNotInCategory: (category: string | null, productId: string) => void;
  isRefreshing: (category: string | null) => boolean;
  isRefreshingNotInCategory: (category: string | null) => boolean;
  hasCache: (category: string | null) => boolean;
  hasNotInCategoryCache: (category: string | null) => boolean;
  getLastFetchedAt: (category: string | null) => number | null;
}

const CategoryProductsContext = createContext<CategoryProductsContextValue | undefined>(undefined);

const STALE_TIME = 90 * 1000; // 90 seconds (between 60-120s as requested)

export function CategoryProductsProvider({ children }: { children: React.ReactNode }) {
  const { activeOwnerId } = useActiveOwner();
  const [productsByCategory, setProductsByCategory] = useState<Record<string, CategoryProductsCache>>({});
  const [productsNotInCategory, setProductsNotInCategory] = useState<Record<string, CategoryProductsCache>>({});
  const [refreshingCategories, setRefreshingCategories] = useState<Set<string>>(new Set());
  const [refreshingNotInCategory, setRefreshingNotInCategory] = useState<Set<string>>(new Set());
  const loadedFromCacheRef = useRef<Set<string>>(new Set());

  const getCategoryKey = useCallback((category: string | null) => {
    return category || '__NULL__';
  }, []);

  const getCategoryProducts = useCallback((category: string | null): Product[] => {
    const key = getCategoryKey(category);
    // Trigger lazy loading from cache if not already loaded
    if (!productsByCategory[key] && activeOwnerId) {
      loadCategoryProductsFromCache(category);
    }
    return productsByCategory[key]?.items || [];
  }, [productsByCategory, getCategoryKey, activeOwnerId, loadCategoryProductsFromCache]);

  // Load from cache on mount or owner change
  useEffect(() => {
    if (!activeOwnerId) {
      setProductsByCategory({});
      setProductsNotInCategory({});
      loadedFromCacheRef.current = new Set();
      return;
    }

    // This will be called when a category is first accessed
    // We load from cache lazily when getCategoryProducts is called
  }, [activeOwnerId]);

  // Load category products from cache (lazy loading)
  const loadCategoryProductsFromCache = useCallback(async (category: string | null) => {
    if (!activeOwnerId) return;

    const key = getCategoryKey(category);
    if (loadedFromCacheRef.current.has(key)) return; // Already loaded

    try {
      const cached = await loadCachedCategoryProducts(activeOwnerId, category);
      if (cached) {
        setProductsByCategory((prev) => ({
          ...prev,
          [key]: cached,
        }));
        loadedFromCacheRef.current.add(key);
      }
    } catch (error) {
      console.log(`[CategoryProductsContext] Failed to load cached products for ${category}`, error);
    }
  }, [activeOwnerId, getCategoryKey]);

  const refreshCategoryProducts = useCallback(async (category: string | null, force = false) => {
    if (!activeOwnerId) return;

    // Load from cache first if not already loaded
    await loadCategoryProductsFromCache(category);

    const key = getCategoryKey(category);
    const cache = productsByCategory[key];
    const now = Date.now();
    const isStale = !cache || (now - cache.lastFetchedAt) > STALE_TIME;

    // Skip if not stale and not forced
    if (!force && !isStale && cache) {
      return;
    }

    // Prevent multiple simultaneous fetches for same category
    if (refreshingCategories.has(key)) {
      return;
    }

    setRefreshingCategories((prev) => new Set(prev).add(key));

    try {
      const products = await getProductsByCategory(activeOwnerId, category);
      const newCache: CategoryProductsCache = {
        items: products,
        lastFetchedAt: now,
      };
      
      setProductsByCategory((prev) => ({
        ...prev,
        [key]: newCache,
      }));

      // Save to persistent cache
      await saveCachedCategoryProducts(activeOwnerId, category, newCache);
    } catch (error) {
      console.error(`[CategoryProductsContext] Error refreshing category ${category}:`, error);
    } finally {
      setRefreshingCategories((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [activeOwnerId, productsByCategory, refreshingCategories, getCategoryKey, loadCategoryProductsFromCache]);

  const addProductOptimistic = useCallback((category: string | null, product: Product) => {
    const key = getCategoryKey(category);
    setProductsByCategory((prev) => {
      const cache = prev[key];
      if (!cache) return prev;
      
      // Check if product already exists
      if (cache.items.some((p) => p.id === product.id)) {
        return prev;
      }

      return {
        ...prev,
        [key]: {
          ...cache,
          items: [...cache.items, product],
        },
      };
    });
  }, [getCategoryKey]);

  const updateProductOptimistic = useCallback((category: string | null, productId: string, updates: Partial<Product>) => {
    const key = getCategoryKey(category);
    setProductsByCategory((prev) => {
      const cache = prev[key];
      if (!cache) return prev;

      return {
        ...prev,
        [key]: {
          ...cache,
          items: cache.items.map((p) => (p.id === productId ? { ...p, ...updates } : p)),
        },
      };
    });
  }, [getCategoryKey]);

  const removeProductOptimistic = useCallback((category: string | null, productId: string) => {
    const key = getCategoryKey(category);
    setProductsByCategory((prev) => {
      const cache = prev[key];
      if (!cache) return prev;

      return {
        ...prev,
        [key]: {
          ...cache,
          items: cache.items.filter((p) => p.id !== productId),
        },
      };
    });
  }, [getCategoryKey]);

  const isRefreshing = useCallback((category: string | null) => {
    const key = getCategoryKey(category);
    return refreshingCategories.has(key);
  }, [refreshingCategories, getCategoryKey]);

  const hasCache = useCallback((category: string | null) => {
    const key = getCategoryKey(category);
    return !!productsByCategory[key];
  }, [productsByCategory, getCategoryKey]);

  const getLastFetchedAt = useCallback((category: string | null) => {
    const key = getCategoryKey(category);
    return productsByCategory[key]?.lastFetchedAt || null;
  }, [productsByCategory, getCategoryKey]);

  // Products not in category cache
  const getProductsNotInCategoryCache = useCallback((category: string | null): Product[] => {
    const key = getCategoryKey(category);
    // Trigger lazy loading from cache if not already loaded
    if (!productsNotInCategory[key] && activeOwnerId) {
      loadProductsNotInCategoryFromCache(category);
    }
    return productsNotInCategory[key]?.items || [];
  }, [productsNotInCategory, getCategoryKey, activeOwnerId, loadProductsNotInCategoryFromCache]);

  // Load products not in category from cache (lazy loading)
  const loadProductsNotInCategoryFromCache = useCallback(async (category: string | null) => {
    if (!activeOwnerId) return;

    const key = getCategoryKey(category);
    const cacheKey = `not-in-category:${key}`;
    if (loadedFromCacheRef.current.has(cacheKey)) return; // Already loaded

    try {
      const cached = await loadCachedProductsNotInCategory(activeOwnerId, category);
      if (cached) {
        setProductsNotInCategory((prev) => ({
          ...prev,
          [key]: cached,
        }));
        loadedFromCacheRef.current.add(cacheKey);
      }
    } catch (error) {
      console.log(`[CategoryProductsContext] Failed to load cached "not in category" products for ${category}`, error);
    }
  }, [activeOwnerId, getCategoryKey]);

  const refreshProductsNotInCategoryCache = useCallback(async (category: string | null, force = false) => {
    if (!activeOwnerId) return;

    // Load from cache first if not already loaded
    await loadProductsNotInCategoryFromCache(category);

    const key = getCategoryKey(category);
    const cache = productsNotInCategory[key];
    const now = Date.now();
    const isStale = !cache || (now - cache.lastFetchedAt) > STALE_TIME;

    // Skip if not stale and not forced
    if (!force && !isStale && cache) {
      return;
    }

    // Prevent multiple simultaneous fetches for same category
    if (refreshingNotInCategory.has(key)) {
      return;
    }

    setRefreshingNotInCategory((prev) => new Set(prev).add(key));

    try {
      const products = await getProductsNotInCategory(activeOwnerId, category);
      const newCache: CategoryProductsCache = {
        items: products,
        lastFetchedAt: now,
      };
      
      setProductsNotInCategory((prev) => ({
        ...prev,
        [key]: newCache,
      }));

      // Save to persistent cache
      await saveCachedProductsNotInCategory(activeOwnerId, category, newCache);
    } catch (error) {
      console.error(`[CategoryProductsContext] Error refreshing products not in category ${category}:`, error);
    } finally {
      setRefreshingNotInCategory((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [activeOwnerId, productsNotInCategory, refreshingNotInCategory, getCategoryKey, loadProductsNotInCategoryFromCache]);

  const removeProductFromNotInCategory = useCallback((category: string | null, productId: string) => {
    const key = getCategoryKey(category);
    setProductsNotInCategory((prev) => {
      const cache = prev[key];
      if (!cache) return prev;

      return {
        ...prev,
        [key]: {
          ...cache,
          items: cache.items.filter((p) => p.id !== productId),
        },
      };
    });
  }, [getCategoryKey]);

  const isRefreshingNotInCategoryCache = useCallback((category: string | null) => {
    const key = getCategoryKey(category);
    return refreshingNotInCategory.has(key);
  }, [refreshingNotInCategory, getCategoryKey]);

  const hasNotInCategoryCache = useCallback((category: string | null) => {
    const key = getCategoryKey(category);
    return !!productsNotInCategory[key];
  }, [productsNotInCategory, getCategoryKey]);

  const value: CategoryProductsContextValue = {
    getCategoryProducts,
    refreshCategoryProducts,
    getProductsNotInCategory: getProductsNotInCategoryCache,
    refreshProductsNotInCategory: refreshProductsNotInCategoryCache,
    addProductOptimistic,
    updateProductOptimistic,
    removeProductOptimistic,
    removeProductFromNotInCategory,
    isRefreshing,
    isRefreshingNotInCategory: isRefreshingNotInCategoryCache,
    hasCache,
    hasNotInCategoryCache,
    getLastFetchedAt,
  };

  return (
    <CategoryProductsContext.Provider value={value}>
      {children}
    </CategoryProductsContext.Provider>
  );
}

export function useCategoryProducts() {
  const context = useContext(CategoryProductsContext);
  if (context === undefined) {
    throw new Error('useCategoryProducts must be used within a CategoryProductsProvider');
  }
  return context;
}

