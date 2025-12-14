/**
 * Search utility functions
 * Filters items based on search query
 */

import type { Database } from '@/types/database';

type Item = Database['public']['Views']['items_with_details']['Row'];

/**
 * Filter items based on search query
 * Searches in: product name, barcode, location name, product barcode
 */
export function filterItems(items: Item[], searchQuery: string): Item[] {
  if (!searchQuery.trim()) {
    return items;
  }

  const query = searchQuery.toLowerCase().trim();

  return items.filter((item) => {
    // Search in product name
    const productName = item.product_name?.toLowerCase() || '';
    if (productName.includes(query)) return true;

    // Search in product barcode
    const productBarcode = item.product_barcode?.toLowerCase() || '';
    if (productBarcode.includes(query)) return true;

    // Search in barcode snapshot
    const barcodeSnapshot = item.barcode_snapshot?.toLowerCase() || '';
    if (barcodeSnapshot.includes(query)) return true;

    // Search in location name
    const locationName = item.location_name?.toLowerCase() || '';
    if (locationName.includes(query)) return true;

    // Search in product category
    const category = item.product_category?.toLowerCase() || '';
    if (category.includes(query)) return true;

    return false;
  });
}

