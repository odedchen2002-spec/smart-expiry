import AsyncStorage from '@react-native-async-storage/async-storage';

export type Category = string;

const CATEGORY_CACHE_KEY = (ownerId: string) => `categories:${ownerId}`;
const CATEGORIES_FULL_CACHE_KEY = (ownerId: string) => `categories-full:${ownerId}`;

export interface CategoriesFullCache {
  categories: Category[];
  productCounts: Record<string, number>;
  lastFetchedAt: number;
}

// Legacy functions for backward compatibility
export async function loadCachedCategories(ownerId: string): Promise<Category[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_CACHE_KEY(ownerId));
    if (!raw) {
      // Try loading from full cache
      const fullCache = await loadCachedCategoriesFull(ownerId);
      return fullCache?.categories || null;
    }
    return JSON.parse(raw) as Category[];
  } catch (e) {
    console.log('[CategoriesCache] Failed to load cache', e);
    return null;
  }
}

export async function saveCachedCategories(ownerId: string, categories: Category[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CATEGORY_CACHE_KEY(ownerId), JSON.stringify(categories));
  } catch (e) {
    console.log('[CategoriesCache] Failed to save cache', e);
  }
}

// New functions for full cache with productCounts and lastFetchedAt
export async function loadCachedCategoriesFull(ownerId: string): Promise<CategoriesFullCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORIES_FULL_CACHE_KEY(ownerId));
    if (!raw) return null;
    return JSON.parse(raw) as CategoriesFullCache;
  } catch (e) {
    console.log('[CategoriesCache] Failed to load full cache', e);
    return null;
  }
}

export async function saveCachedCategoriesFull(
  ownerId: string,
  cache: CategoriesFullCache
): Promise<void> {
  try {
    await AsyncStorage.setItem(CATEGORIES_FULL_CACHE_KEY(ownerId), JSON.stringify(cache));
    // Also save categories separately for backward compatibility
    await saveCachedCategories(ownerId, cache.categories);
  } catch (e) {
    console.log('[CategoriesCache] Failed to save full cache', e);
  }
}

export async function clearCategoriesCache(ownerId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CATEGORY_CACHE_KEY(ownerId));
    await AsyncStorage.removeItem(CATEGORIES_FULL_CACHE_KEY(ownerId));
  } catch (e) {
    console.log('[CategoriesCache] Failed to clear cache', e);
  }
}



