/**
 * Owner/Store ID Utilities
 * 
 * This file provides utilities for consistently getting the correct scope identifier
 * (owner_id or store_id) across the application.
 * 
 * ============================================================================
 * NAMING CONVENTION IN THIS PROJECT
 * ============================================================================
 * 
 * There are two naming conventions for the same concept (auth.users.id):
 * 
 * 1. CORE TABLES use `owner_id`:
 *    - items (batches/expiry records)
 *    - products
 *    - locations
 *    - collaborations
 *    - notification_sent_log
 * 
 * 2. BARCODE/NAMING TABLES use `store_id`:
 *    - barcode_name_suggestions
 *    - store_barcode_overrides
 *    - pending_items
 *    - expiry_events
 * 
 * Both refer to the same value: the store owner's auth.users.id
 * (or the activeOwnerId when viewing as a collaborator)
 * 
 * ============================================================================
 * WHY TWO NAMES?
 * ============================================================================
 * 
 * - Legacy: Core tables were created first with `owner_id`
 * - Barcode system: Added later with `store_id` to clarify it's store-scoped
 * 
 * Both columns always contain auth.users.id and are semantically identical.
 * 
 * ============================================================================
 */

import { supabase } from './client';

/**
 * Get the current authenticated user's ID
 * 
 * This returns the raw session.user.id which is used for:
 * - owner_id in core tables (items, products, locations, etc.)
 * - store_id in barcode tables (pending_items, store_barcode_overrides, etc.)
 * 
 * Note: When operating as a collaborator, you should use activeOwnerId from
 * useActiveOwner() hook instead of this function.
 * 
 * @returns The current user's ID or null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Type guard for tables that use owner_id
 * Use this when working with: items, products, locations, collaborations, notification_sent_log
 */
export type OwnerIdTable = 'items' | 'products' | 'locations' | 'collaborations' | 'notification_sent_log';

/**
 * Type guard for tables that use store_id
 * Use this when working with: barcode_name_suggestions, store_barcode_overrides, pending_items, expiry_events
 */
export type StoreIdTable = 'barcode_name_suggestions' | 'store_barcode_overrides' | 'pending_items' | 'expiry_events';

/**
 * Helper to get the correct column name for a table
 * This can be used to prevent mistakes when building dynamic queries
 * 
 * @param table - The table name
 * @returns 'owner_id' or 'store_id' depending on the table
 */
export function getScopeColumnName(table: OwnerIdTable | StoreIdTable): 'owner_id' | 'store_id' {
  const storeIdTables: StoreIdTable[] = [
    'barcode_name_suggestions',
    'store_barcode_overrides', 
    'pending_items',
    'expiry_events'
  ];
  
  if (storeIdTables.includes(table as StoreIdTable)) {
    return 'store_id';
  }
  
  return 'owner_id';
}

/**
 * Mapping of all tables to their scope column for reference
 */
export const TABLE_SCOPE_COLUMNS = {
  // Core tables - use owner_id
  items: 'owner_id',
  products: 'owner_id',
  locations: 'owner_id',
  collaborations: 'owner_id',
  notification_sent_log: 'owner_id',
  
  // Barcode/naming tables - use store_id
  barcode_name_suggestions: 'store_id',
  store_barcode_overrides: 'store_id',
  pending_items: 'store_id',
  expiry_events: 'store_id',
} as const;

