/**
 * Category queries
 * Categories are stored as strings in the products table
 */

import { supabase } from '../client';

const DEFAULT_CATEGORY = 'ללא קטגוריה'; // Default category name

/**
 * Get all unique categories for an owner
 * Includes categories from placeholder products (used to create empty categories)
 */
export async function getCategories(ownerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('category')
    .eq('owner_id', ownerId)
    .not('category', 'is', null);

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  // Get unique categories (including from placeholder products)
  const uniqueCategories = [...new Set(
    data
      .map((p) => p.category)
      .filter(Boolean)
  )] as string[];
  
  // Sort alphabetically
  return uniqueCategories.sort();
}

/**
 * Get default category name
 */
export function getDefaultCategory(): string {
  return DEFAULT_CATEGORY;
}

/**
 * Update product category
 */
export async function updateProductCategory(
  productId: string,
  category: string | null
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ category })
    .eq('id', productId);

  if (error) {
    console.error('Error updating product category:', error);
    throw error;
  }
}

/**
 * Update all products with old category name to new category name
 */
export async function renameCategory(
  ownerId: string,
  oldCategoryName: string,
  newCategoryName: string
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ category: newCategoryName })
    .eq('owner_id', ownerId)
    .eq('category', oldCategoryName);

  if (error) {
    console.error('Error renaming category:', error);
    throw error;
  }
}

/**
 * Delete a category (sets all products with this category to null)
 */
export async function deleteCategory(
  ownerId: string,
  categoryName: string
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ category: null })
    .eq('owner_id', ownerId)
    .eq('category', categoryName);

  if (error) {
    console.error('Error deleting category:', error);
    throw error;
  }
}

/**
 * Get products by category
 * Excludes placeholder products used to create categories
 * Only returns products that have at least one active item
 */
export async function getProductsByCategory(
  ownerId: string,
  category: string | null
): Promise<any[]> {
  // First, get all products in the category
  let query = supabase
    .from('products')
    .select('*')
    .eq('owner_id', ownerId)
    .not('name', 'like', '__CATEGORY_PLACEHOLDER_%'); // Exclude placeholder products

  if (category === null) {
    query = query.is('category', null);
  } else {
    query = query.eq('category', category);
  }

  const { data: products, error: productsError } = await query;

  if (productsError) {
    console.error('Error fetching products by category:', productsError);
    return [];
  }

  if (!products || products.length === 0) {
    return [];
  }

  // Get all active items for this owner
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('product_id')
    .eq('owner_id', ownerId);

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
    return [];
  }

  // Create a set of product IDs that have active items
  const productIdsWithItems = new Set(
    (items || []).map((item) => item.product_id).filter(Boolean)
  );

  // Filter products to only include those that have active items
  return products.filter((product) => productIdsWithItems.has(product.id));
}

/**
 * Get products that are not currently in the specified category
 * Only returns products that have at least one active item
 */
export async function getProductsNotInCategory(
  ownerId: string,
  category: string | null
): Promise<any[]> {
  // First, get all products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*')
    .eq('owner_id', ownerId)
    .not('name', 'like', '__CATEGORY_PLACEHOLDER_%');

  if (productsError) {
    console.error('Error fetching products not in category:', productsError);
    return [];
  }

  if (!products || products.length === 0) {
    return [];
  }

  // Get all active items for this owner
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('product_id')
    .eq('owner_id', ownerId);

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
    return [];
  }

  // Create a set of product IDs that have active items
  const productIdsWithItems = new Set(
    (items || []).map((item) => item.product_id).filter(Boolean)
  );

  // Filter products to only include those that have active items and are not in the specified category
  return products.filter((product) => {
    // Only include products with active items
    if (!productIdsWithItems.has(product.id)) {
      return false;
    }
    
    // Filter by category
    if (category === null) {
      // Looking for products currently assigned to a category (non-null)
      return product.category !== null;
    }
    return product.category === null || product.category !== category;
  });
}

