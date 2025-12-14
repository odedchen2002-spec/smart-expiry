import { supabase } from '../client';

export interface Product {
  id: string;
  owner_id?: string; // New field - products belong to owners
  business_id?: string; // Legacy field - will be removed
  name: string;
  barcode?: string | null;
  category?: string | null;
}

/**
 * Get product by barcode for a specific owner
 * Products are filtered by owner_id (or by items that belong to the owner)
 */
export async function getProductByBarcode(ownerId: string, barcode: string): Promise<Product | null> {
  // Query products by owner_id and barcode
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('barcode', barcode)
    .maybeSingle();

  if (error) {
    // Table may not exist yet; surface as null to allow graceful UX
    console.warn('getProductByBarcode error:', error.message);
    return null;
  }

  return (data as any) ?? null;
}
