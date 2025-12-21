import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@/types/database';

type Product = Database['public']['Tables']['products']['Row'];

export interface CategoryProductsCache {
  items: Product[];
  lastFetchedAt: number;
}

const PRODUCTS_BY_CATEGORY_KEY = (ownerId: string, category: string | null) => 
  `category-products:${ownerId}:${category || '__NULL__'}`;

const PRODUCTS_NOT_IN_CATEGORY_KEY = (ownerId: string, category: string | null) => 
  `products-not-in-category:${ownerId}:${category || '__NULL__'}`;

// Products by category cache
export async function loadCachedCategoryProducts(
  ownerId: string,
  category: string | null
): Promise<CategoryProductsCache | null> {
  try {
    const key = PRODUCTS_BY_CATEGORY_KEY(ownerId, category);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CategoryProductsCache;
  } catch (e) {
    console.log('[CategoryProductsCache] Failed to load cache', e);
    return null;
  }
}

export async function saveCachedCategoryProducts(
  ownerId: string,
  category: string | null,
  cache: CategoryProductsCache
): Promise<void> {
  try {
    const key = PRODUCTS_BY_CATEGORY_KEY(ownerId, category);
    await AsyncStorage.setItem(key, JSON.stringify(cache));
  } catch (e) {
    console.log('[CategoryProductsCache] Failed to save cache', e);
  }
}

// Products not in category cache
export async function loadCachedProductsNotInCategory(
  ownerId: string,
  category: string | null
): Promise<CategoryProductsCache | null> {
  try {
    const key = PRODUCTS_NOT_IN_CATEGORY_KEY(ownerId, category);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CategoryProductsCache;
  } catch (e) {
    console.log('[CategoryProductsCache] Failed to load "not in category" cache', e);
    return null;
  }
}

export async function saveCachedProductsNotInCategory(
  ownerId: string,
  category: string | null,
  cache: CategoryProductsCache
): Promise<void> {
  try {
    const key = PRODUCTS_NOT_IN_CATEGORY_KEY(ownerId, category);
    await AsyncStorage.setItem(key, JSON.stringify(cache));
  } catch (e) {
    console.log('[CategoryProductsCache] Failed to save "not in category" cache', e);
  }
}

export async function clearCategoryProductsCache(ownerId: string): Promise<void> {
  try {
    // Get all keys for this owner
    const allKeys = await AsyncStorage.getAllKeys();
    const prefix = `category-products:${ownerId}:`;
    const notInCategoryPrefix = `products-not-in-category:${ownerId}:`;
    
    const keysToRemove = allKeys.filter(
      (key) => key.startsWith(prefix) || key.startsWith(notInCategoryPrefix)
    );
    
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (e) {
    console.log('[CategoryProductsCache] Failed to clear cache', e);
  }
}

