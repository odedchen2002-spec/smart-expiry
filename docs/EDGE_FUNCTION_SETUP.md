# Supabase Edge Function Setup for Stripe Checkout

## Overview

The subscription system requires a Supabase Edge Function named `create-checkout-session` to handle Stripe payment processing. This function creates a Stripe Checkout Session and returns the checkout URL.

## Error: Edge Function Not Deployed

If you see the error:
```
Error calling create-checkout-session: [FunctionsHttpError: Edge Function returned a non-2xx status code]
```

This means the Edge Function is not deployed or not configured correctly.

## Setup Instructions

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link Your Project

```bash
cd expiryx-clean
supabase link --project-ref YOUR_PROJECT_REF
```

### 4. Create the Edge Function

```bash
supabase functions new create-checkout-session
```

### 5. Implement the Function

Create/edit `supabase/functions/create-checkout-session/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_PRICE_BASIC = Deno.env.get('STRIPE_PRICE_BASIC'); // Stripe Price ID for Basic plan
const STRIPE_PRICE_PRO = Deno.env.get('STRIPE_PRICE_PRO'); // Stripe Price ID for Pro plan
const APP_URL = Deno.env.get('APP_URL') || 'expiryxclean://';

serve(async (req) => {
  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the user from the JWT
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { userId, plan } = await req.json();

    // Validate input
    if (!userId || !plan || (plan !== 'basic' && plan !== 'pro')) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify userId matches authenticated user
    if (userId !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get Stripe price ID based on plan
    const priceId = plan === 'basic' ? STRIPE_PRICE_BASIC : STRIPE_PRICE_PRO;
    if (!priceId) {
      return new Response(
        JSON.stringify({ error: 'Stripe price not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
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
        line_items: JSON.stringify([{
          price: priceId,
          quantity: 1,
        }]),
        customer_email: user.email || undefined,
        success_url: `${APP_URL}/(paywall)/subscribe?success=true`,
        cancel_url: `${APP_URL}/(paywall)/subscribe?canceled=true`,
        metadata: JSON.stringify({
          userId: user.id,
          plan: plan,
        }),
      }),
    });

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.text();
      console.error('Stripe API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to create checkout session' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const session = await stripeResponse.json();

    return new Response(
      JSON.stringify({ checkoutUrl: session.url }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in create-checkout-session:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

### 6. Set Environment Variables

In your Supabase project dashboard:
1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add the following secrets:
   - `STRIPE_SECRET_KEY`: Your Stripe secret key (starts with `sk_`)
   - `STRIPE_PRICE_BASIC`: Stripe Price ID for Basic plan (create in Stripe Dashboard)
   - `STRIPE_PRICE_PRO`: Stripe Price ID for Pro plan (create in Stripe Dashboard)
   - `APP_URL`: Your app deep link URL (e.g., `expiryxclean://`)

### 7. Deploy the Function

```bash
supabase functions deploy create-checkout-session
```

### 8. Set Up Stripe Webhook

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Add endpoint: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the webhook signing secret

### 9. Webhook Handler

The webhook handler is already created at `supabase/functions/stripe-webhook/index.ts`. 

**Setup:**
1. Deploy the webhook function:
   ```bash
   supabase functions deploy stripe-webhook
   ```

2. In Stripe Dashboard, add webhook endpoint:
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
   - Select events:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

3. Copy the webhook signing secret and set it as an environment variable:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```

4. The webhook handler will automatically update subscription status in Supabase when Stripe events are received.

**Note:** The webhook handler uses the shared `applySubscriptionChange()` helper from `supabase/functions/_shared/subscriptions.ts` to update subscription state safely and consistently.

## Testing

After deployment, test the function:

```bash
supabase functions invoke create-checkout-session \
  --body '{"userId":"test-user-id","plan":"basic"}' \
  --header "Authorization: Bearer YOUR_ANON_KEY"
```

## Troubleshooting

- **404 Error**: Function not deployed. Run `supabase functions deploy create-checkout-session`
- **401 Error**: Missing or invalid authorization header
- **500 Error**: Check function logs: `supabase functions logs create-checkout-session`
- **Stripe errors**: Verify Stripe API keys and price IDs are correct

## Alternative: Development Mode

For development/testing without Stripe, you can temporarily modify `initiateStripeCheckout` in `src/lib/billing.ts` to use mock payment logic until the Edge Function is ready.

