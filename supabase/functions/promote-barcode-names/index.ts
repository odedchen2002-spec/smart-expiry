/**
 * Promote Barcode Names Edge Function
 * 
 * Promotes suggested barcode names to the global catalog when:
 * - The same normalized name is suggested by 10+ DISTINCT stores
 * - Within the SAME locale (no cross-locale promotion)
 * 
 * Core rule: Promotion unit = (barcode, locale, normalized_name)
 * 
 * This function should be scheduled to run periodically (e.g., every 6 hours).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PromotionCandidate {
  barcode: string;
  locale: string;
  normalized_name: string;
  distinct_stores: number;
  display_name: string;
  suggestion_count: number;
}

interface PromotionResult {
  promoted: number;
  skipped: number;
  errors: number;
  details: {
    barcode: string;
    locale: string;
    name: string;
    stores: number;
  }[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const MIN_STORES_FOR_PROMOTION = 10;
const MAX_PROMOTIONS_PER_RUN = 500;
const MIN_NAME_LENGTH = 3;

/**
 * Normalize product name for consistent comparison
 * Mirrors the SQL normalize_product_name function
 */
function normalizeProductName(name: string | null): string | null {
  if (!name) return null;
  
  // Remove punctuation, collapse whitespace, trim, lowercase
  return name
    .toLowerCase()
    .replace(/[-/.,;:!?()'"[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a name passes safety rules
 */
function isValidName(name: string | null): boolean {
  if (!name) return false;
  
  const normalized = normalizeProductName(name);
  if (!normalized) return false;
  
  // Rule 1: Minimum length
  if (normalized.length < MIN_NAME_LENGTH) {
    return false;
  }
  
  // Rule 2: Not digits only
  if (/^[\d\s]+$/.test(normalized)) {
    return false;
  }
  
  return true;
}

/**
 * Get promotion candidates from database
 */
async function getPromotionCandidates(
  supabase: SupabaseClient
): Promise<PromotionCandidate[]> {
  const { data, error } = await supabase.rpc('get_barcode_promotion_candidates', {
    p_min_stores: MIN_STORES_FOR_PROMOTION,
    p_max_results: MAX_PROMOTIONS_PER_RUN,
  });

  if (error) {
    console.error('[promote] Error getting candidates:', error);
    throw error;
  }

  return data || [];
}

/**
 * Promote a single candidate to the global catalog
 */
async function promoteCandidate(
  supabase: SupabaseClient,
  candidate: PromotionCandidate
): Promise<{ success: boolean; error?: string }> {
  // Validate the display name
  if (!isValidName(candidate.display_name)) {
    return {
      success: false,
      error: `Invalid name: "${candidate.display_name}"`,
    };
  }

  // Upsert into barcode_catalog
  const { error } = await supabase.from('barcode_catalog').upsert(
    {
      barcode: candidate.barcode,
      locale: candidate.locale,
      name: candidate.display_name,
      source: 'mixed',
      confidence_score: Math.min(0.5 + (candidate.distinct_stores / 100), 1.0),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'barcode,locale',
    }
  );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Main promotion logic
 */
async function runPromotion(supabase: SupabaseClient): Promise<PromotionResult> {
  const result: PromotionResult = {
    promoted: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  console.log('[promote] Starting barcode name promotion run...');
  console.log(`[promote] Config: MIN_STORES=${MIN_STORES_FOR_PROMOTION}, MAX_PER_RUN=${MAX_PROMOTIONS_PER_RUN}`);

  // Get candidates
  let candidates: PromotionCandidate[];
  try {
    candidates = await getPromotionCandidates(supabase);
    console.log(`[promote] Found ${candidates.length} promotion candidates`);
  } catch (error) {
    console.error('[promote] Failed to get candidates:', error);
    throw error;
  }

  if (candidates.length === 0) {
    console.log('[promote] No candidates to promote');
    return result;
  }

  // Process each candidate
  for (const candidate of candidates) {
    // Skip invalid entries
    if (!candidate.barcode || !candidate.locale || !candidate.display_name) {
      console.log(`[promote] Skipping invalid candidate: barcode=${candidate.barcode}`);
      result.skipped++;
      continue;
    }

    // Additional safety check
    if (!isValidName(candidate.display_name)) {
      console.log(
        `[promote] Skipping unsafe name: barcode=${candidate.barcode}, ` +
        `locale=${candidate.locale}, name="${candidate.display_name}"`
      );
      result.skipped++;
      continue;
    }

    // Promote the candidate
    const promoteResult = await promoteCandidate(supabase, candidate);

    if (promoteResult.success) {
      console.log(
        `[promote] PROMOTED: barcode=${candidate.barcode}, locale=${candidate.locale}, ` +
        `name="${candidate.display_name}", stores=${candidate.distinct_stores}`
      );
      result.promoted++;
      result.details.push({
        barcode: candidate.barcode,
        locale: candidate.locale,
        name: candidate.display_name,
        stores: candidate.distinct_stores,
      });
    } else {
      console.error(
        `[promote] FAILED: barcode=${candidate.barcode}, ` +
        `locale=${candidate.locale}, error=${promoteResult.error}`
      );
      result.errors++;
    }
  }

  console.log(
    `[promote] Promotion run complete: ` +
    `promoted=${result.promoted}, skipped=${result.skipped}, errors=${result.errors}`
  );

  return result;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // This function should only be called by cron or admin
    // Verify authorization (allow service role or cron)
    const authHeader = req.headers.get('Authorization');
    
    // Create Supabase client with service role (required for this operation)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[promote-barcode-names] Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Run the promotion
    const result = await runPromotion(supabase);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Promotion run completed',
        result,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[promote-barcode-names] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

