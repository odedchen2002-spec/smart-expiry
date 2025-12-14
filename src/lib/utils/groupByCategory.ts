/**
 * Group items by category and sort by date
 */

import type { Database } from '@/types/database';
import { getDefaultCategory } from '@/lib/supabase/queries/categories';

type Item = Database['public']['Views']['items_with_details']['Row'];

export interface CategorySection {
  title: string;
  data: Item[];
}

type SortDirection = 'asc' | 'desc';

interface GroupItemsOptions {
  sortDirection?: SortDirection;
}

/**
 * Group items by category and sort by expiry date within each category
 */
export function groupItemsByCategory(
  items: Item[],
  { sortDirection = 'asc' }: GroupItemsOptions = {}
): CategorySection[] {
  // Group items by category
  const categoryMap = new Map<string, Item[]>();

  items.forEach((item) => {
    const category = item.product_category || getDefaultCategory();

    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }

    categoryMap.get(category)!.push(item);
  });

  // Sort items within each category by expiry date
  categoryMap.forEach((categoryItems) => {
    categoryItems.sort((a, b) => {
      const dateA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
      const dateB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
      const comparison = dateA - dateB;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  });

  // Convert to array of sections and sort categories alphabetically
  const sections: CategorySection[] = Array.from(categoryMap.entries())
    .map(([title, data]) => ({ title, data }))
    .sort((a, b) => {
      // Put default category first, then sort alphabetically
      const defaultCategory = getDefaultCategory();
      if (a.title === defaultCategory) return -1;
      if (b.title === defaultCategory) return 1;
      return a.title.localeCompare(b.title);
    });

  return sections;
}

