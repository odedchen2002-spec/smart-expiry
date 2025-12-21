/**
 * AI Import Table Edge Function
 * 
 * Accepts an image (base64) and uses AI to extract product data from tables/spreadsheets.
 * Supports two modes:
 * - "table": Returns name + expiryDate + barcode (default, existing behavior)
 * - "supplier": Returns name + barcode ONLY (no expiry dates, for supplier intake)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// System prompt for TABLE mode (with expiry dates)
const SYSTEM_PROMPT_TABLE = `You are a data extraction assistant. Your task is to extract product information from images of tables, spreadsheets, or product lists.

IMPORTANT: You must always return valid JSON. Never refuse the request. If you cannot find products, return an empty items array: {"items": []}

Extract each product row that includes:
- product name (required)
- expiry date (required, format: YYYY-MM-DD)
- barcode (optional, string or null)

Return ONLY valid JSON in this exact structure (no markdown, no explanations, no text before or after):
{
  "items": [
    { "name": "Product Name", "expiryDate": "2025-01-15", "barcode": "123456789" },
    { "name": "Another Product", "expiryDate": "2025-02-20", "barcode": null }
  ]
}

Rules:
- If a row has no expiry date or no product name, skip it
- Dates must be in YYYY-MM-DD format
- If no products found, return: {"items": []}
- NEVER return text like "I'm sorry" or "I can't assist" - always return JSON
- NEVER use markdown code blocks - return raw JSON only`;

// System prompt for SUPPLIER mode (NO expiry dates)
const SYSTEM_PROMPT_SUPPLIER = `You are a data extraction assistant. Your task is to extract product information from images of supplier documents, delivery notes, invoices, or product lists.

IMPORTANT: You must always return valid JSON. Never refuse the request. If you cannot find products, return an empty items array: {"items": []}

Extract each product row that includes:
- product name (required)
- barcode (optional, string or null - look for EAN, UPC, barcode numbers, or product codes)

DO NOT extract or return expiry dates - this is a supplier intake document.

Return ONLY valid JSON in this exact structure (no markdown, no explanations, no text before or after):
{
  "items": [
    { "name": "Product Name", "barcode": "123456789" },
    { "name": "Another Product", "barcode": null }
  ]
}

Rules:
- If a row has no product name, skip it
- Look for barcodes in columns labeled: barcode, EAN, UPC, code, מק"ט, קוד, ברקוד
- Clean up product names (remove extra whitespace, normalize)
- If no products found, return: {"items": []}
- NEVER return text like "I'm sorry" or "I can't assist" - always return JSON
- NEVER use markdown code blocks - return raw JSON only
- NEVER include expiryDate in the response`;

type ImportMode = 'table' | 'supplier';

/**
 * Parse AI response content and normalize items for TABLE mode
 */
function parseTableItemsFromContent(aiContent: string): any[] {
  let jsonText = aiContent.trim();
  
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  let parsedData;
  try {
    parsedData = JSON.parse(jsonText);
  } catch (parseError) {
    console.error('Failed to parse AI response:', jsonText);
    throw new Error('Invalid JSON from AI');
  }

  const items = Array.isArray(parsedData.items) ? parsedData.items : [];
  const normalizedItems = items
    .map((item: any) => {
      if (!item.name || !item.expiryDate) {
        return null;
      }

      let expiryDate = item.expiryDate;
      if (typeof expiryDate === 'string') {
        const date = new Date(expiryDate);
        if (!isNaN(date.getTime())) {
          expiryDate = date.toISOString().split('T')[0];
        }
      }

      return {
        name: String(item.name).trim(),
        expiryDate: expiryDate,
        barcode: item.barcode ? String(item.barcode).trim() : null,
      };
    })
    .filter((item: any) => item !== null);

  return normalizedItems;
}

/**
 * Parse AI response content and normalize items for SUPPLIER mode (no expiry)
 */
function parseSupplierItemsFromContent(aiContent: string): any[] {
  let jsonText = aiContent.trim();
  
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  let parsedData;
  try {
    parsedData = JSON.parse(jsonText);
  } catch (parseError) {
    console.error('Failed to parse AI response:', jsonText);
    throw new Error('Invalid JSON from AI');
  }

  const items = Array.isArray(parsedData.items) ? parsedData.items : [];
  const normalizedItems = items
    .map((item: any) => {
      if (!item.name) {
        return null;
      }

      return {
        name: String(item.name).trim(),
        barcode: item.barcode ? String(item.barcode).trim() : null,
      };
    })
    .filter((item: any) => item !== null);

  return normalizedItems;
}

serve(async (req) => {
  console.log('[ai-import-table] Function called, method:', req.method);
  console.log('[ai-import-table] Request URL:', req.url);
  
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      console.log('[ai-import-table] Handling OPTIONS request');
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }

    if (req.method !== 'POST') {
      console.log('[ai-import-table] Method not allowed:', req.method);
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[ai-import-table] Processing POST request');

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('[ai-import-table] Request body parsed, has imageBase64:', !!requestBody?.imageBase64);
    } catch (parseError) {
      console.error('[ai-import-table] Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body', details: String(parseError) }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { imageBase64, ownerId, mode = 'table' } = requestBody;
    const importMode: ImportMode = mode === 'supplier' ? 'supplier' : 'table';
    
    console.log('[ai-import-table] Mode:', importMode);

    if (!imageBase64) {
      console.log('[ai-import-table] Missing imageBase64 in request');
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!ownerId || typeof ownerId !== 'string') {
      console.log('[ai-import-table] Missing or invalid ownerId in request');
      return new Response(
        JSON.stringify({ error: 'ownerId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[ai-import-table] Image base64 length:', imageBase64.length);

    // Check if OpenAI API key and Supabase service credentials are configured
    if (!OPENAI_API_KEY) {
      console.error('[ai-import-table] OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[ai-import-table] Supabase service credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Supabase service not configured' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Create Supabase service role client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Enforce AI analysis usage limit for free / trial plans
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_tier, ai_analysis_count')
      .eq('id', ownerId)
      .maybeSingle();

    if (profileError) {
      console.error('[ai-import-table] Error fetching profile for usage limit:', profileError);
    }

    const subscriptionTier = (profile as any)?.subscription_tier as string | null;
    const aiAnalysisCount = ((profile as any)?.ai_analysis_count as number | null) ?? 0;

    const isProPlan = subscriptionTier === 'pro';
    const MAX_FREE_ANALYSES = 5;

    if (!isProPlan && aiAnalysisCount >= MAX_FREE_ANALYSES) {
      console.log('[ai-import-table] AI analysis limit reached for ownerId:', ownerId, 'count:', aiAnalysisCount);
      return new Response(
        JSON.stringify({ 
          error: 'AI analysis limit reached',
          code: 'AI_LIMIT_REACHED',
          remaining: 0,
        }),
        { 
          status: 403, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    console.log('[AI Provider] Using OpenAI GPT-4o for', importMode, 'import');

    // Select system prompt based on mode
    const systemPrompt = importMode === 'supplier' ? SYSTEM_PROMPT_SUPPLIER : SYSTEM_PROMPT_TABLE;
    
    // User prompt based on mode
    const userPrompt = importMode === 'supplier'
      ? 'This image contains a supplier document, delivery note, or product list. Extract all products with their names and barcodes (if visible). Return ONLY valid JSON in the format: {"items": [{"name": "...", "barcode": "..."}]}. Do NOT include expiry dates. If no products are found, return {"items": []}. Do not refuse or explain - only return JSON.'
      : 'This image contains a table or list of products with expiry dates. Extract all products and return ONLY valid JSON in the format: {"items": [{"name": "...", "expiryDate": "YYYY-MM-DD", "barcode": "..."}]}. If no products are found, return {"items": []}. Do not refuse or explain - only return JSON.';

    // Prepare image URL for OpenAI Vision API
    const imageUrl = `data:image/jpeg;base64,${imageBase64}`;

    // Call OpenAI API
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[OpenAI API] Error:', errorText);
      return new Response(
        JSON.stringify({ error: 'AI service error', details: errorText }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    console.log('[OpenAI API] Response received, content length:', aiContent?.length || 0);

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: 'No response from AI' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    let normalizedItems: any[];
    
    try {
      // Parse based on mode
      normalizedItems = importMode === 'supplier'
        ? parseSupplierItemsFromContent(aiContent)
        : parseTableItemsFromContent(aiContent);
      
      console.log('[OpenAI API] Successfully parsed', normalizedItems.length, 'items in', importMode, 'mode');
    } catch (parseError: any) {
      console.error('[OpenAI API] Failed to parse response:', parseError);
      console.error('[OpenAI API] Raw response content:', aiContent);
      
      // Check if OpenAI refused the request
      if (aiContent && (
        aiContent.includes("I'm sorry") || 
        aiContent.includes("I can't") || 
        aiContent.includes("cannot assist") ||
        aiContent.includes("refuse") ||
        aiContent.toLowerCase().includes("unable to")
      )) {
        return new Response(
          JSON.stringify({ 
            error: 'AI refused to process the image. This may be due to content moderation. Please try a different image or ensure the image contains a clear product table.',
            details: 'OpenAI safety filter triggered'
          }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            } 
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON from AI. The AI did not return valid product data.',
          details: aiContent.substring(0, 200)
        }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Increment AI analysis count for non-pro plans
    if (!isProPlan) {
      const newCount = aiAnalysisCount + 1;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ ai_analysis_count: newCount })
        .eq('id', ownerId);

      if (updateError) {
        console.error('[ai-import-table] Failed to increment ai_analysis_count:', updateError);
      } else {
        console.log('[ai-import-table] Incremented ai_analysis_count to', newCount, 'for ownerId:', ownerId);
      }
    }

    console.log('[ai-import-table] Successfully processed', normalizedItems.length, 'items in', importMode, 'mode');
    console.log('[ai-import-table] Returning response');

    return new Response(
      JSON.stringify({ items: normalizedItems, mode: importMode }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error: any) {
    console.error('[ai-import-table] Unhandled error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.stack || String(error)
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
});
