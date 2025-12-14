import AsyncStorage from '@react-native-async-storage/async-storage';

export type Category = string;

const CATEGORY_CACHE_KEY = (ownerId: string) => `categories:${ownerId}`;

export async function loadCachedCategories(ownerId: string): Promise<Category[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_CACHE_KEY(ownerId));
    if (!raw) return null;
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

export async function clearCategoriesCache(ownerId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CATEGORY_CACHE_KEY(ownerId));
  } catch (e) {
    console.log('[CategoriesCache] Failed to clear cache', e);
  }
}



