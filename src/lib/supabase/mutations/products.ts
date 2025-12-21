/**
 * Products mutations for Supabase
 * 
 * Note: The `products` table uses `owner_id` (not `store_id`).
 * See src/lib/supabase/ownerUtils.ts for naming convention documentation.
 */

import { supabase } from '../client';

export async function createProduct(params: { ownerId: string; name: string; barcode?: string | null; category?: string | null }) {
  const { ownerId, name, barcode, category } = params;
  
  const { data, error } = await supabase
    .from('products')
    .insert({
      owner_id: ownerId,
      name,
      barcode: barcode || null,
      category: category || null,
    } as any)
    .select()
    .single();

  if (error) {
    console.warn('createProduct error:', error.message);
    throw error;
  }

  return data as any;
}
