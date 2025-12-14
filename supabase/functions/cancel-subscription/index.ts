/**
 * cancel-subscription Edge Function
 *
 * Cancels a user's Stripe subscription at the end of the current billing period.
 * 
 * Flow:
 * - Receives { userId } from the client
 * - Looks up stripe_customer_id and stripe_subscription_id from profiles
 * - If no active subscription, returns an error
 * - Calls Stripe API to set cancel_at_period_end = true
 * - On success, sets auto_renew = false in profiles
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const STRIPE_SECRET_KEY = Deno.env.get('SECRET_STRIPE_KEY');

serve(async (req) => {
  // CORS preflight
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
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[cancel-subscription] Missing Supabase service credentials');
    return new Response(
      JSON.stringify({ error: 'Supabase service not configured' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  if (!STRIPE_SECRET_KEY) {
    console.error('[cancel-subscription] SECRET_STRIPE_KEY is not configured');
    return new Response(
      JSON.stringify({ error: 'Stripe not configured' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    console.error('[cancel-subscription] Failed to parse JSON body:', err);
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  const userId = body?.userId as string | undefined;

  if (!userId || typeof userId !== 'string') {
    return new Response(
      JSON.stringify({ error: 'userId is required' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  console.log('[cancel-subscription] Request to cancel subscription for user:', userId);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Look up Stripe identifiers from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[cancel-subscription] Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to load profile' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    if (!profile) {
      console.warn('[cancel-subscription] Profile not found for user:', userId);
      return new Response(
        JSON.stringify({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    const stripeCustomerId = (profile as any).stripe_customer_id as string | null;
    const stripeSubscriptionId = (profile as any).stripe_subscription_id as string | null;

    if (!stripeSubscriptionId) {
      console.warn('[cancel-subscription] No active subscription to cancel for user:', userId, 'customer:', stripeCustomerId);
      return new Response(
        JSON.stringify({ error: 'No active subscription to cancel', code: 'NO_SUBSCRIPTION' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    console.log('[cancel-subscription] Calling Stripe API to cancel at period end for subscription:', stripeSubscriptionId);

    // Call Stripe API to set cancel_at_period_end = true
    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ cancel_at_period_end: 'true' }).toString(),
      },
    );

    const stripeBodyText = await stripeResponse.text();

    if (!stripeResponse.ok) {
      console.error('[cancel-subscription] Stripe API error:', stripeResponse.status, stripeBodyText);
      return new Response(
        JSON.stringify({
          error: 'Stripe API error',
          status: stripeResponse.status,
          details: stripeBodyText,
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    console.log('[cancel-subscription] Stripe subscription updated successfully:', stripeBodyText);

    // Update profile to mark that subscription will not auto-renew
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        auto_renew: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[cancel-subscription] Failed to update profile auto_renew flag:', updateError);
      // Still return success for the client because Stripe cancellation succeeded
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (err) {
    console.error('[cancel-subscription] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }
});


