/**
 * Resolve Barcode Name Edge Function
 * 
 * This function resolves a barcode to a product name using the following order:
 * 1. Check store_barcode_overrides (store-specific custom names)
 * 2. Check barcode_catalog (global catalog cache)
 * 3. Call Open Food Facts API (real external lookup)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ResolveRequest {
  barcode: string;
  store_id?: string;
  locale?: string;
}

interface ResolveResponse {
  name: string | null;
  source: 'store_override' | 'catalog_stub' | 'catalog_api' | 'catalog_user' | 'catalog_mixed' | 'api' | 'not_found';
  confidence_score: number | null;
}

interface ExternalLookupResult {
  name: string | null;
  source: 'api' | 'not_found';
  confidence: number | null;
  raw?: Record<string, unknown>;
}

interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_en?: string;
  product_name_he?: string;
  abbreviated_product_name?: string;
  brands?: string;
  quantity?: string;
}

interface OpenFoodFactsResponse {
  status: number;
  status_verbose?: string;
  product?: OpenFoodFactsProduct;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,product_name_en,product_name_he,abbreviated_product_name,brands,quantity';
const OFF_TIMEOUT_MS = 5500;
const OFF_USER_AGENT = 'SmartExpiry/1.0 (barcode-lookup; contact: odedchen@gmail.com)';

/**
 * Clean whitespace from a string (collapse multiple spaces, trim)
 */
function cleanName(name: string | undefined | null): string | null {
  if (!name) return null;
  const cleaned = name.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Pick the best product name based on locale preference
 */
function pickBestName(product: OpenFoodFactsProduct, locale: string | null): string | null {
  const locLower = (locale || '').toLowerCase();
  
  let candidates: (string | undefined)[];
  
  if (locLower.startsWith('he')) {
    // Hebrew preference
    candidates = [
      product.product_name_he,
      product.product_name,
      product.product_name_en,
      product.abbreviated_product_name,
    ];
  } else if (locLower.startsWith('en')) {
    // English preference
    candidates = [
      product.product_name_en,
      product.product_name,
      product.product_name_he,
      product.abbreviated_product_name,
    ];
  } else {
    // Default preference
    candidates = [
      product.product_name,
      product.product_name_en,
      product.product_name_he,
      product.abbreviated_product_name,
    ];
  }
  
  for (const candidate of candidates) {
    const cleaned = cleanName(candidate);
    if (cleaned) return cleaned;
  }
  
  return null;
}

/**
 * Open Food Facts API lookup
 */
async function resolveBarcodeName(
  barcode: string, 
  locale: string | null
): Promise<ExternalLookupResult> {
  const url = `${OFF_API_BASE}/${barcode}.json?fields=${OFF_FIELDS}`;
  
  console.log(`[OFF] off_call barcode=${barcode}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': OFF_USER_AGENT,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`[OFF] off_error barcode=${barcode} status=${response.status}`);
      return { name: null, source: 'not_found', confidence: null };
    }
    
    const data: OpenFoodFactsResponse = await response.json();
    
    // Check if product was found
    if (data.status !== 1 || !data.product) {
      console.log(`[OFF] off_not_found barcode=${barcode}`);
      return { name: null, source: 'not_found', confidence: null };
    }
    
    const name = pickBestName(data.product, locale);
    
    if (!name) {
      console.log(`[OFF] off_not_found barcode=${barcode} (no valid name fields)`);
      return { name: null, source: 'not_found', confidence: null };
    }
    
    console.log(`[OFF] off_success barcode=${barcode} name="${name}"`);
    
    return {
      name,
      source: 'api',
      confidence: 0.75,
      raw: data.product as Record<string, unknown>,
    };
    
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    
    console.log(`[OFF] off_error barcode=${barcode} error=${isTimeout ? 'timeout' : errorMessage}`);
    
    return { name: null, source: 'not_found', confidence: null };
  }
}

/**
 * Cache the external API result into barcode_catalog
 */
async function cacheToBarcodeCatalog(
  supabase: SupabaseClient,
  barcode: string,
  name: string,
  confidence: number | null,
  locale: string | null
): Promise<void> {
  try {
    const { error } = await supabase.from('barcode_catalog').upsert(
      {
        barcode,
        name,
        source: 'api',
        confidence_score: confidence,
        locale: locale ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'barcode' }
    );
    
    if (error) {
      console.log(`[cache] cache_error barcode=${barcode} error=${error.message}`);
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.log(`[cache] cache_error barcode=${barcode} error=${errorMessage}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { barcode, store_id, locale } = await req.json() as ResolveRequest;

    if (!barcode || typeof barcode !== 'string') {
      return new Response(
        JSON.stringify({ error: 'barcode is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[resolve-barcode-name] Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Step 1: Check store_barcode_overrides if store_id provided
    if (store_id) {
      const { data: override, error: overrideError } = await supabase
        .from('store_barcode_overrides')
        .select('custom_name')
        .eq('store_id', store_id)
        .eq('barcode', barcode)
        .maybeSingle();

      if (overrideError) {
        console.error('[resolve-barcode-name] Error checking store overrides:', overrideError);
      } else if (override?.custom_name) {
        console.log(`[resolve] override_hit barcode=${barcode}`);
        const response: ResolveResponse = {
          name: override.custom_name,
          source: 'store_override',
          confidence_score: 1.0,
        };
        return new Response(
          JSON.stringify(response),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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

    if (catalogError) {
      console.error('[resolve-barcode-name] Error checking catalog:', catalogError);
    } else if (catalogEntry?.name) {
      console.log(`[resolve] cache_hit barcode=${barcode}`);
      const response: ResolveResponse = {
        name: catalogEntry.name,
        source: `catalog_${catalogEntry.source}` as ResolveResponse['source'],
        confidence_score: catalogEntry.confidence_score,
      };
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Call Open Food Facts API
    const externalResult = await resolveBarcodeName(barcode, locale ?? null);

    if (externalResult.name) {
      // Cache the result in barcode_catalog for future lookups
      await cacheToBarcodeCatalog(
        supabase,
        barcode,
        externalResult.name,
        externalResult.confidence,
        locale ?? null
      );

      const response: ResolveResponse = {
        name: externalResult.name,
        source: 'api',
        confidence_score: externalResult.confidence,
      };
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No name found anywhere
    const response: ResolveResponse = {
      name: null,
      source: 'not_found',
      confidence_score: null,
    };
    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[resolve-barcode-name] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
