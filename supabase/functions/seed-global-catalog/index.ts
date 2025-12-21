/**
 * Seed Global Catalog Edge Function
 * 
 * Seeds the global barcode_catalog with a name ONLY if the barcode doesn't exist yet.
 * Never overwrites existing entries.
 * 
 * Called from supplier intake flow when a barcode+name pair is detected.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('[seed-global-catalog] Function called, method:', req.method);
  
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { barcode, name, locale } = requestBody;

    if (!barcode || typeof barcode !== 'string') {
      return new Response(
        JSON.stringify({ error: 'barcode is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!name || typeof name !== 'string') {
      return new Response(
        JSON.stringify({ error: 'name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[seed-global-catalog] Supabase credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase service role client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if barcode already exists in catalog
    const { data: existing, error: checkError } = await supabase
      .from('barcode_catalog')
      .select('barcode')
      .eq('barcode', barcode.trim())
      .maybeSingle();

    if (checkError) {
      console.error('[seed-global-catalog] Error checking catalog:', checkError);
      return new Response(
        JSON.stringify({ error: 'Database error', details: checkError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If exists, do nothing (never overwrite)
    if (existing) {
      console.log('[seed-global-catalog] Barcode already exists, skipping:', barcode);
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'skipped', 
          reason: 'barcode_exists' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new entry
    const { error: insertError } = await supabase
      .from('barcode_catalog')
      .insert({
        barcode: barcode.trim(),
        name: name.trim(),
        locale: locale || null,
        source: 'user',
        confidence_score: 0.8,
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      // Handle race condition - another request might have inserted
      if (insertError.code === '23505') { // Unique violation
        console.log('[seed-global-catalog] Concurrent insert detected, skipping:', barcode);
        return new Response(
          JSON.stringify({ 
            success: true, 
            action: 'skipped', 
            reason: 'concurrent_insert' 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.error('[seed-global-catalog] Error inserting:', insertError);
      return new Response(
        JSON.stringify({ error: 'Insert failed', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[seed-global-catalog] Successfully seeded:', barcode, '→', name);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        action: 'inserted',
        barcode: barcode.trim(),
        name: name.trim(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[seed-global-catalog] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

