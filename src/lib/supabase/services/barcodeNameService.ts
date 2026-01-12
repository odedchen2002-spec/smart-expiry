/**
 * Barcode Name Resolution Service
 * 
 * Implements the product name resolution order (C1):
 * 1. Check store_barcode_overrides (store_id + barcode)
 * 2. Else check barcode_catalog
 * 3. Else call resolve_barcode_name() Edge Function (stub, returns null)
 * 
 * If still no name, the UI shows "Unknown product" and optionally prompts for a name.
 * 
 * Note: Barcode tables use `store_id` (not `owner_id`).
 * See src/lib/supabase/ownerUtils.ts for naming convention documentation.
 */

import { supabase } from '../client';

/**
 * Check if text contains Arabic characters
 * Used to filter out Arabic names for Hebrew users
 */
function containsArabic(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

/**
 * Check if a name should be rejected based on user's locale
 * Hebrew users should not see Arabic names
 */
function shouldRejectNameForLocale(name: string | null | undefined, locale: string | undefined): boolean {
  if (!name || !locale) return false;
  const locLower = locale.toLowerCase();
  
  // Hebrew users should not see Arabic names
  if (locLower.startsWith('he') && containsArabic(name)) {
    return true;
  }
  
  return false;
}

export type BarcodeNameSource = 
  | 'store_override' 
  | 'catalog_stub' 
  | 'catalog_api' 
  | 'catalog_user' 
  | 'catalog_mixed' 
  | 'api' 
  | 'not_found';

export interface BarcodeNameResult {
  name: string | null;
  source: BarcodeNameSource;
  confidenceScore: number | null;
}

/**
 * Resolve a barcode to a product name using the priority order:
 * 1. Store overrides (per-store custom names)
 * 2. Global catalog
 * 3. Edge Function (stub - returns null)
 * 
 * @param barcode - The barcode to look up
 * @param storeId - The store/owner ID for checking overrides
 * @param locale - Optional locale for localized names
 * @returns The resolved name and source, or null if not found
 */
export async function resolveBarcodeToName(
  barcode: string,
  storeId?: string,
  locale?: string
): Promise<BarcodeNameResult> {
  if (!barcode) {
    return { name: null, source: 'not_found', confidenceScore: null };
  }

  try {
    // Step 1: Check store_barcode_overrides if storeId provided
    if (storeId) {
      const { data: override, error: overrideError } = await supabase
        .from('store_barcode_overrides')
        .select('custom_name')
        .eq('store_id', storeId)
        .eq('barcode', barcode)
        .maybeSingle();

      if (!overrideError && override?.custom_name) {
        // Skip Arabic names for Hebrew users
        if (!shouldRejectNameForLocale(override.custom_name, locale)) {
          return {
            name: override.custom_name,
            source: 'store_override',
            confidenceScore: 1.0,
          };
        }
        // If name is rejected (e.g., Arabic for Hebrew user), continue to next step
        console.log(`[barcodeNameService] Skipping store override (wrong script for locale): ${override.custom_name}`);
      }
    }

    // Step 2: Check barcode_catalog
    // Each barcode+locale combination is stored separately for multilingual support
    let catalogQuery = supabase
      .from('barcode_catalog')
      .select('name, source, confidence_score, locale')
      .eq('barcode', barcode);

    // Filter by exact locale - no fallback to null locales
    if (locale) {
      catalogQuery = catalogQuery.eq('locale', locale);
    } else {
      // If no locale specified, skip catalog lookup and go straight to Edge Function
      catalogQuery = catalogQuery.is('locale', null);
    }

    const { data: catalogEntry, error: catalogError } = await catalogQuery.maybeSingle();

    if (!catalogError && catalogEntry?.name) {
      // Skip Arabic names for Hebrew users (shouldn't happen with locale filter, but just in case)
      if (!shouldRejectNameForLocale(catalogEntry.name, locale)) {
        return {
          name: catalogEntry.name,
          source: `catalog_${catalogEntry.source}` as BarcodeNameSource,
          confidenceScore: catalogEntry.confidence_score,
        };
      }
      console.log(`[barcodeNameService] Skipping catalog entry (wrong script for locale): ${catalogEntry.name}`);
    }

    // Step 3: Call Edge Function (stub - returns null)
    // This allows the architecture to be in place for future API integration
    const { data: edgeResult, error: edgeError } = await supabase.functions.invoke(
      'resolve-barcode-name',
      {
        body: { barcode, store_id: storeId, locale },
      }
    );

    if (!edgeError && edgeResult?.name) {
      // Skip Arabic names for Hebrew users
      if (!shouldRejectNameForLocale(edgeResult.name, locale)) {
        return {
          name: edgeResult.name,
          source: edgeResult.source || 'api',
          confidenceScore: edgeResult.confidence_score || null,
        };
      }
      console.log(`[barcodeNameService] Skipping edge result (wrong script for locale): ${edgeResult.name}`);
    }

    // No name found
    return { name: null, source: 'not_found', confidenceScore: null };
  } catch (error) {
    console.error('[barcodeNameService] Error resolving barcode name:', error);
    return { name: null, source: 'not_found', confidenceScore: null };
  }
}

/**
 * Save a store-specific barcode override.
 * This takes precedence over the global catalog for this store.
 * 
 * @param storeId - The store/owner ID
 * @param barcode - The barcode
 * @param customName - The custom name to use for this barcode
 */
export async function saveStoreOverride(
  storeId: string,
  barcode: string,
  customName: string
): Promise<boolean> {
  if (!storeId || !barcode || !customName) {
    console.error('[barcodeNameService] saveStoreOverride: Missing required parameters');
    return false;
  }

  try {
    const { error } = await supabase
      .from('store_barcode_overrides')
      .upsert(
        {
          store_id: storeId,
          barcode,
          custom_name: customName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id,barcode' }
      );

    if (error) {
      console.error('[barcodeNameService] Error saving store override:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[barcodeNameService] Error saving store override:', error);
    return false;
  }
}

/**
 * Submit a barcode name suggestion.
 * These are stored for potential promotion to the global catalog.
 * 
 * Names are promoted to the global catalog after 10 distinct stores
 * suggest the same normalized name within the same locale.
 * 
 * @param barcode - The barcode
 * @param suggestedName - The suggested name
 * @param storeId - The store/owner ID submitting the suggestion
 * @param locale - The locale for the suggestion (defaults to 'he' if not provided)
 */
export async function submitBarcodeSuggestion(
  barcode: string,
  suggestedName: string,
  storeId?: string,
  locale?: string
): Promise<boolean> {
  if (!barcode || !suggestedName) {
    console.error('[barcodeNameService] submitBarcodeSuggestion: Missing required parameters');
    return false;
  }

  // Ensure locale is provided (required for promotion logic)
  const effectiveLocale = locale || 'he';

  try {
    const { error } = await supabase
      .from('barcode_name_suggestions')
      .upsert(
        {
          barcode,
          suggested_name: suggestedName,
          store_id: storeId || null,
          locale: effectiveLocale,
          // normalized_name is auto-computed by database trigger
        },
        {
          // Upsert to handle duplicate suggestions from same store
          onConflict: 'store_id,barcode,locale,normalized_name',
          ignoreDuplicates: true,
        }
      );

    if (error) {
      // Ignore unique constraint violations (duplicate suggestions are expected)
      if (error.code === '23505') {
        console.log('[barcodeNameService] Duplicate suggestion ignored');
        return true;
      }
      console.error('[barcodeNameService] Error submitting suggestion:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[barcodeNameService] Error submitting suggestion:', error);
    return false;
  }
}

/**
 * Get the display name for a barcode, with fallback to "Unknown product".
 * Useful for UI display when we need a name but don't have one.
 * 
 * @param barcode - The barcode to look up
 * @param storeId - The store/owner ID
 * @param fallback - Custom fallback text (default: "Unknown product")
 */
export async function getDisplayNameForBarcode(
  barcode: string,
  storeId?: string,
  fallback: string = 'Unknown product'
): Promise<string> {
  const result = await resolveBarcodeToName(barcode, storeId);
  return result.name || fallback;
}

/**
 * Check if a barcode has a name in the catalog or overrides.
 * Quick check without returning the full name.
 */
export async function hasNameForBarcode(
  barcode: string,
  storeId?: string
): Promise<boolean> {
  const result = await resolveBarcodeToName(barcode, storeId);
  return result.name !== null;
}

/**
 * Update or insert a name into the barcode_catalog.
 * This is used when a user provides/corrects a product name.
 * The name is saved with source='user' to indicate it was user-provided.
 * 
 * Note: barcode_catalog has RLS that prevents direct client writes.
 * This function uses an RPC call to bypass RLS with SECURITY DEFINER.
 * 
 * @param barcode - The barcode
 * @param name - The product name to save
 * @param locale - The locale for the name
 * @returns true if successful, false otherwise
 */
export async function updateBarcodeCatalog(
  barcode: string,
  name: string,
  locale?: string
): Promise<boolean> {
  if (!barcode || !name) {
    console.error('[barcodeNameService] updateBarcodeCatalog: Missing required parameters');
    return false;
  }

  // Ensure locale is provided
  const effectiveLocale = locale || 'he';

  try {
    // Use RPC function to bypass RLS (barcode_catalog is read-only for clients)
    const { error: rpcError } = await supabase.rpc('upsert_barcode_catalog_name', {
      p_barcode: barcode,
      p_name: name,
      p_locale: effectiveLocale,
    });

    if (rpcError) {
      // If RPC doesn't exist, log and continue (graceful degradation)
      if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
        console.warn('[barcodeNameService] RPC upsert_barcode_catalog_name not found, skipping catalog update');
        return false;
      }
      // Ignore duplicate key violations (barcode already exists with same or different name)
      if (rpcError.code === '23505') {
        console.log('[barcodeNameService] Barcode already exists in catalog, treating as success');
        return true;
      }
      console.error('[barcodeNameService] Error updating catalog via RPC:', rpcError);
      return false;
    }

    console.log(`[barcodeNameService] Updated barcode_catalog: ${barcode} -> "${name}" (locale: ${effectiveLocale})`);
    return true;
  } catch (error) {
    console.error('[barcodeNameService] Error updating catalog:', error);
    return false;
  }
}

