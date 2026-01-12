/**
 * Resolve Barcode Name Edge Function
 * 
 * This function resolves a barcode to a product name using the following order:
 * 1. Check store_barcode_overrides (store-specific custom names) - highest priority
 * 2. Check barcode_catalog (global catalog cache)
 * 3. Call Open Food Facts API (real external lookup)
 * 
 * Localization:
 * - When calling OFF API, requests localized name fields (product_name, product_name_he, product_name_en, lang)
 * - Uses pickLocalizedName() to select the best name based on user's locale
 * - Hebrew users get Hebrew names when available
 * - Results are cached in barcode_catalog with the resolved locale
 * 
 * Important: store_barcode_overrides are NEVER overwritten by OFF data
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
  lang?: string; // The product's primary language code (e.g., 'he', 'en')
}

interface OpenFoodFactsResponse {
  status: number;
  status_verbose?: string;
  product?: OpenFoodFactsProduct;
}

// Debug info for logging which field was chosen
interface PickedNameInfo {
  name: string | null;
  field: string | null; // Which field the name came from
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,product_name_en,product_name_he,lang,abbreviated_product_name,brands,quantity';
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
 * Check if text is primarily in Hebrew (contains Hebrew characters and more Hebrew than Latin)
 * Hebrew Unicode range: \u0590-\u05FF
 */
function isPrimarilyHebrew(text: string | undefined | null): boolean {
  if (!text) return false;
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  // If there are Hebrew chars and more Hebrew than Latin
  return hebrewChars > 0 && hebrewChars >= latinChars;
}

/**
 * Check if text is primarily in Latin script (English)
 */
function isPrimarilyLatin(text: string | undefined | null): boolean {
  if (!text) return false;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  // If there are Latin chars and more Latin than Hebrew
  return latinChars > 0 && latinChars > hebrewChars;
}

/**
 * Check if text is primarily in Arabic script
 * Arabic Unicode ranges: \u0600-\u06FF (Arabic), \u0750-\u077F (Arabic Supplement), \u08A0-\u08FF (Arabic Extended-A)
 */
function isPrimarilyArabic(text: string | undefined | null): boolean {
  if (!text) return false;
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const otherScripts = latinChars + hebrewChars;
  // If there are Arabic chars and more Arabic than other scripts
  return arabicChars > 0 && arabicChars >= otherScripts;
}

/**
 * Check if a name matches the user's locale (or is neutral like numbers)
 * Stricter version: rejects Arabic text for Hebrew/English users
 */
function matchesLocale(text: string | undefined | null, locale: string | null): boolean {
  if (!text) return false;
  
  const locLower = (locale || '').toLowerCase();
  const isHebrew = isPrimarilyHebrew(text);
  const isLatin = isPrimarilyLatin(text);
  const isArabic = isPrimarilyArabic(text);
  
  // Check if text has any letters (not just numbers/symbols)
  const hasAnyLetter = /\p{L}/u.test(text);
  
  // If no letters (numbers, symbols only), accept it as neutral
  if (!hasAnyLetter) return true;
  
  // If locale is Hebrew → only accept Hebrew text (reject Arabic and other scripts)
  if (locLower.startsWith('he')) return isHebrew;
  
  // If locale is English → only accept Latin text
  if (locLower.startsWith('en')) return isLatin;
  
  // If locale is Arabic → accept Arabic text
  if (locLower.startsWith('ar')) return isArabic;
  
  // Unknown locale → accept anything
  return true;
}

/**
 * Pick the best localized product name based on locale preference.
 * 
 * Priority:
 * 1. If locale starts with 'he' and product_name_he exists → return it
 * 2. If locale starts with 'en' and product_name_en exists → return it
 * 3. If product.lang exists and product_name_<lang> exists → return it
 * 4. Smart fallback: Try product_name only if it matches user's locale script
 * 5. Final fallback: Any available name (may be in wrong language)
 * 
 * @param product - The OpenFoodFacts product object
 * @param locale - The user's locale (e.g., 'he', 'en', 'he-IL')
 * @returns Object with the picked name and which field it came from
 */
function pickLocalizedName(product: OpenFoodFactsProduct, locale: string | null): PickedNameInfo {
  const locLower = (locale || '').toLowerCase();
  
  // Step 1: If locale is Hebrew and product_name_he exists
  if (locLower.startsWith('he')) {
    const heName = cleanName(product.product_name_he);
    if (heName) {
      return { name: heName, field: 'product_name_he' };
    }
    
    // Step 1b: Fallback to English for Hebrew users (better than Arabic or unknown)
    const enName = cleanName(product.product_name_en);
    if (enName) {
      return { name: enName, field: 'product_name_en (fallback-for-he)' };
    }
  }
  
  // Step 2: If locale is English and product_name_en exists
  if (locLower.startsWith('en')) {
    const enName = cleanName(product.product_name_en);
    if (enName) {
      return { name: enName, field: 'product_name_en' };
    }
  }
  
  // Step 3: If product has a primary language and product_name_<lang> exists
  if (product.lang) {
    const productLang = product.lang.toLowerCase();
    if (productLang === 'he' || productLang.startsWith('he')) {
      const heName = cleanName(product.product_name_he);
      if (heName) {
        return { name: heName, field: `product_name_he (via lang=${product.lang})` };
      }
    } else if (productLang === 'en' || productLang.startsWith('en')) {
      const enName = cleanName(product.product_name_en);
      if (enName) {
        return { name: enName, field: `product_name_en (via lang=${product.lang})` };
      }
    }
  }
  
  // Step 4: Smart fallback - try product_name only if it matches user's locale script
  const productName = cleanName(product.product_name);
  if (productName && matchesLocale(productName, locale)) {
    return { name: productName, field: 'product_name (locale-matched)' };
  }
  
  // Step 5: Try abbreviated_product_name if it matches locale
  const abbreviatedName = cleanName(product.abbreviated_product_name);
  if (abbreviatedName && matchesLocale(abbreviatedName, locale)) {
    return { name: abbreviatedName, field: 'abbreviated_product_name (locale-matched)' };
  }
  
  // Step 6: Final fallback - return null if nothing matches
  // This allows the user to enter their own name in their preferred language
  // Previously we would return a name in the wrong language here
  
  // Log what was available but didn't match
  const availableNames = [
    productName ? `product_name="${productName}"` : null,
    product.product_name_en ? `en="${product.product_name_en}"` : null,
    product.product_name_he ? `he="${product.product_name_he}"` : null,
  ].filter(Boolean).join(', ');
  
  console.log(`[pickLocalizedName] no_locale_match locale=${locale || 'none'} available=[${availableNames}]`);
  
  // If user is in a specific locale but no matching name found, return null
  // This is better UX - let them enter their own name rather than showing wrong language
  if (locale && (locLower.startsWith('he') || locLower.startsWith('en'))) {
    return { name: null, field: 'no_locale_match' };
  }
  
  // If no locale specified, return whatever we have as last resort
  const lastResort: Array<{ value: string | undefined; field: string }> = [
    { value: product.product_name, field: 'product_name' },
    { value: product.product_name_en, field: 'product_name_en' },
    { value: product.product_name_he, field: 'product_name_he' },
    { value: product.abbreviated_product_name, field: 'abbreviated_product_name' },
  ];
  
  for (const { value, field } of lastResort) {
    const cleaned = cleanName(value);
    if (cleaned) {
      return { name: cleaned, field: `${field} (last-resort)` };
    }
  }
  
  return { name: null, field: null };
}

/**
 * Open Food Facts API lookup
 */
async function resolveBarcodeName(
  barcode: string, 
  locale: string | null
): Promise<ExternalLookupResult> {
  const url = `${OFF_API_BASE}/${barcode}.json?fields=${OFF_FIELDS}`;
  
  console.log(`[OFF] off_call barcode=${barcode} locale=${locale || 'none'}`);
  
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
    
    // Debug log: show available name fields
    const product = data.product;
    console.log(`[OFF] off_fields barcode=${barcode} product_name="${product.product_name || ''}" product_name_he="${product.product_name_he || ''}" product_name_en="${product.product_name_en || ''}" lang="${product.lang || ''}"`);
    
    // Pick the best localized name based on locale
    const { name, field } = pickLocalizedName(product, locale);
    
    if (!name) {
      console.log(`[OFF] off_not_found barcode=${barcode} (no valid name fields)`);
      return { name: null, source: 'not_found', confidence: null };
    }
    
    // Debug log: which field was chosen
    console.log(`[OFF] off_success barcode=${barcode} name="${name}" chosen_field="${field}" locale=${locale || 'none'}`);
    
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
 * Cache the external API result into barcode_catalog.
 * Stores the resolved name with source='api' (from Open Food Facts).
 * 
 * Note: This will NOT overwrite store_barcode_overrides - those are separate tables
 * and take precedence in the resolution order.
 * 
 * Important: Each barcode+locale combination is stored separately to support
 * multilingual product names.
 */
async function cacheToBarcodeCatalog(
  supabase: SupabaseClient,
  barcode: string,
  name: string,
  confidence: number | null,
  locale: string | null
): Promise<void> {
  // Don't cache if no locale is provided - we need locale for proper multilingual support
  if (!locale) {
    console.log(`[cache] skip_cache barcode=${barcode} reason=no_locale`);
    return;
  }
  
  try {
    const { error } = await supabase.from('barcode_catalog').upsert(
      {
        barcode,
        name,
        source: 'api', // Indicates this came from Open Food Facts API
        confidence_score: confidence,
        locale,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'barcode,locale' }
    );
    
    if (error) {
      console.log(`[cache] cache_error barcode=${barcode} error=${error.message}`);
    } else {
      console.log(`[cache] cache_saved barcode=${barcode} name="${name}" locale=${locale}`);
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
    // Each barcode+locale combination is stored separately for multilingual support
    let catalogQuery = supabase
      .from('barcode_catalog')
      .select('name, source, confidence_score, locale')
      .eq('barcode', barcode);

    // Filter by exact locale - no fallback to null locales
    if (locale) {
      catalogQuery = catalogQuery.eq('locale', locale);
    } else {
      // If no locale specified, skip catalog lookup and go straight to API
      catalogQuery = catalogQuery.is('locale', null);
    }

    const { data: catalogEntry, error: catalogError } = await catalogQuery.maybeSingle();

    if (catalogError) {
      console.error('[resolve-barcode-name] Error checking catalog:', catalogError);
    } else if (catalogEntry?.name) {
      console.log(`[resolve] cache_hit barcode=${barcode} locale=${locale || 'none'} source=${catalogEntry.source}`);
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
