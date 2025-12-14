/**
 * Items queries for Supabase
 * Updated to use owner_id instead of business_id
 */

import { supabase } from '../client';
import type { Database } from '@/types/database';

type Item = Database['public']['Tables']['items']['Row'];

export interface ItemWithDetails extends Item {
  product_name: string | null;
  product_barcode: string | null;
  product_category: string | null;
  product_image_url: string | null;
  location_name: string | null;
  location_order: number | null;
}

export interface ItemsQueryOptions {
  ownerId: string;
  status?: 'ok' | 'soon' | 'expired' | 'resolved';
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  limit?: number;
}

/**
 * Get items with optional filters
 */
export async function getItems(options: ItemsQueryOptions): Promise<ItemWithDetails[]> {
  const {
    ownerId,
    status,
    startDate,
    endDate,
    limit = 100,
  } = options;

  // Query items table using owner_id
  let query = supabase
    .from('items')
    .select('*')
    .eq('owner_id', ownerId)
    .order('expiry_date', { ascending: true })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  if (startDate) {
    query = query.gte('expiry_date', startDate);
  }

  if (endDate) {
    query = query.lte('expiry_date', endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching items:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Fetch related product data
  const productIds = [...new Set(data.map((item: any) => item.product_id).filter(Boolean))];
  
  let productsMap = new Map();
  if (productIds.length > 0) {
    const productsResult = await supabase
      .from('products')
      .select('id, name, barcode, category, image_url')
      .in('id', productIds);
    
    if (!productsResult.error && productsResult.data) {
      productsMap = new Map(productsResult.data.map((p: any) => [p.id, p]));
    }
  }

  // Transform to match ItemWithDetails format
  const itemsWithDetails: ItemWithDetails[] = data.map((item: any) => {
    const product = productsMap.get(item.product_id);
    return {
      ...item,
      product_name: product?.name || null,
      product_barcode: product?.barcode || null,
      product_category: product?.category || null,
      product_image_url: product?.image_url || null,
      location_name: null,
      location_order: null,
    };
  });

  return itemsWithDetails;
}

/**
 * Get items expiring today
 */
export async function getItemsExpiringToday(ownerId: string) {
  const today = new Date().toISOString().split('T')[0];
  const items = await getItems({
    ownerId,
    startDate: today,
    endDate: today,
  });
  return items.filter(item => item.status !== 'resolved');
}

/**
 * Get items expiring tomorrow
 */
export async function getItemsExpiringTomorrow(ownerId: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  return getItems({
    ownerId,
    startDate: tomorrowStr,
    endDate: tomorrowStr,
  }).then(items => items.filter(item => item.status !== 'resolved'));
}

/**
 * Get items expiring in the next 7 days
 */
export async function getItemsExpiringNextWeek(ownerId: string) {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  return getItems({
    ownerId,
    startDate: today.toISOString().split('T')[0],
    endDate: nextWeek.toISOString().split('T')[0],
  }).then(items => items.filter(item => item.status !== 'resolved'));
}

/**
 * Get all active items (not resolved)
 */
export async function getAllItems(ownerId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().split('T')[0];
  
  return getItems({
    ownerId,
    limit: 1000,
  }).then(items => items.filter(item => {
    // Exclude resolved items
    if (item.status === 'resolved') return false;
    // Exclude expired items (by status or by expiry_date)
    if (item.status === 'expired') return false;
    // Also check expiry_date in case status is not set correctly
    if (item.expiry_date && item.expiry_date <= todayISO) return false;
    return true;
  }));
}

/**
 * Get expired items (expiry_date < today)
 * Sorted by expiry_date ascending (oldest first)
 */
export async function getExpiredItems(ownerId: string): Promise<ItemWithDetails[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('owner_id', ownerId)
    .lte('expiry_date', todayISO)
    .order('expiry_date', { ascending: true });

  if (error) {
    console.error('Error fetching expired items:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Fetch related product data
  const productIds = [...new Set(data.map((item: any) => item.product_id).filter(Boolean))];
  
  let productsMap = new Map();
  if (productIds.length > 0) {
    const productsResult = await supabase
      .from('products')
      .select('id, name, barcode, category, image_url')
      .in('id', productIds);
    
    if (!productsResult.error && productsResult.data) {
      productsMap = new Map(productsResult.data.map((p: any) => [p.id, p]));
    }
  }

  // Transform to match ItemWithDetails format
  const itemsWithDetails: ItemWithDetails[] = data.map((item: any) => {
    const product = productsMap.get(item.product_id);
    return {
      ...item,
      product_name: product?.name || null,
      product_barcode: product?.barcode || null,
      product_category: product?.category || null,
      product_image_url: product?.image_url || null,
      location_name: null,
      location_order: null,
    };
  });

  return itemsWithDetails;
}

/**
 * Get a single item by ID
 */
export async function getItemById(itemId: string, ownerId: string): Promise<ItemWithDetails> {
  const { data: item, error: itemError } = await supabase
    .from('items')
    .select('*')
    .eq('id', itemId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (itemError) {
    console.error('Error fetching item:', itemError);
    throw itemError;
  }

  if (!item) {
    throw new Error('Item not found');
  }

  // Fetch related product if exists
  let product = null;
  if (item.product_id) {
    const { data: productData } = await supabase
      .from('products')
      .select('id, name, barcode, category, image_url')
      .eq('id', item.product_id)
      .maybeSingle();
    
    product = productData;
  }

  // Transform to match ItemWithDetails format
  return {
    ...item,
    product_name: product?.name || null,
    product_barcode: product?.barcode || null,
    product_category: product?.category || null,
    product_image_url: product?.image_url || null,
    location_name: null,
    location_order: null,
  } as ItemWithDetails;
}
