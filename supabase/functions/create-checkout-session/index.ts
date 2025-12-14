/**
 * create-checkout-session Edge Function
 *
 * Creates a Stripe Checkout Session for starting a subscription (Pro plan).
 *
 * Flow:
 * - Authenticated user calls this function via Supabase Functions client
 * - Function validates JWT (via Authorization header)
 * - Reads { userId, plan } from body
 * - Verifies that userId === authenticated user.id
 * - Chooses Stripe Price ID based on plan (currently only 'pro' is used)
 * - Calls Stripe to create a Checkout Session (mode=subscription)
 * - Returns { checkoutUrl } to the client
 *
 * Required secrets (set in Supabase Dashboard → Project Settings → Edge Functions → Secrets):
 * - STRIPE_SECRET_KEY  (your Stripe secret key, starts with sk_)
 * - STRIPE_PRICE_PRO   (Stripe Price ID for the Pro monthly subscription)
 * - APP_URL            (deep link / base URL for success/cancel redirects, e.g. expiryxclean://)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_PRICE_PRO = Deno.env.get('STRIPE_PRICE_PRO'); // Stripe Price ID for Pro plan
const APP_URL = Deno.env.get('APP_URL') || 'expiryxclean://';

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    if (!STRIPE_SECRET_KEY) {
      console.error('[create-checkout-session] STRIPE_SECRET_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    // Get authorization header (JWT from client)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    // Create Supabase client using the JWT so we can get the current user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error('[create-checkout-session] Unauthorized user:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    // Parse request body
    const { userId, plan } = await req.json();

    // Validate input (we only support 'pro' plan for now)
    if (!userId || !plan || plan !== 'pro') {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    // Verify userId matches authenticated user
    if (userId !== user.id) {
      console.warn('[create-checkout-session] userId mismatch. Auth user:', user.id, 'body userId:', userId);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    // Get Stripe price ID for Pro plan
    const priceId = STRIPE_PRICE_PRO;
    if (!priceId) {
      console.error('[create-checkout-session] STRIPE_PRICE_PRO is not configured');
      return new Response(
        JSONIFY({ error: 'Stripe price not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    // Create Stripe Checkout Session
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        payment_method_types: 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        customer_email: user.email || '',
        success_url: `${APP_URL}/(paywall)/subscribe?success=true`,
        cancel_url: `${APP_URL}/(paywall)/subscribe?canceled=true`,
        'metadata[userId]': user.id,
        'metadata[plan]': plan,
      }).toString(),
    });

    const bodyText = await stripeResponse.text();

    if (!stripeResponse.ok) {
      console.error('[create-checkout-session] Stripe API error:', stripeResponse.status, bodyText);
      return new Response(
        JSON.stringify({ error: 'Failed to create checkout session' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    const session = JSON.parse(bodyText);

    if (!session?.url) {
      console.error('[create-checkout-session] Stripe session has no URL:', session);
      return new Response(
        JSON.stringify({ error: 'Invalid Stripe session response' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    return new Response(
      JSON.stringify({ checkoutUrl: session.url }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
    );
  } catch (error) {
    console.error('[create-checkout-session] Error in handler:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
    );
  }
});


