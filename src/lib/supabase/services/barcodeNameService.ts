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
        return {
          name: override.custom_name,
          source: 'store_override',
          confidenceScore: 1.0,
        };
      }
    }

    // Step 2: Check barcode_catalog
    let catalogQuery = supabase
      .from('barcode_catalog')
      .select('name, source, confidence_score')
      .eq('barcode', barcode);

    // Filter by locale if provided
    if (locale) {
      catalogQuery = catalogQuery.or(`locale.is.null,locale.eq.${locale}`);
    }

    const { data: catalogEntry, error: catalogError } = await catalogQuery.maybeSingle();

    if (!catalogError && catalogEntry?.name) {
      return {
        name: catalogEntry.name,
        source: `catalog_${catalogEntry.source}` as BarcodeNameSource,
        confidenceScore: catalogEntry.confidence_score,
      };
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
      return {
        name: edgeResult.name,
        source: edgeResult.source || 'api',
        confidenceScore: edgeResult.confidence_score || null,
      };
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
 * @param barcode - The barcode
 * @param suggestedName - The suggested name
 * @param storeId - The store/owner ID submitting the suggestion
 * @param locale - Optional locale for the suggestion
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

  try {
    const { error } = await supabase
      .from('barcode_name_suggestions')
      .insert({
        barcode,
        suggested_name: suggestedName,
        store_id: storeId || null,
        locale: locale || null,
      });

    if (error) {
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

