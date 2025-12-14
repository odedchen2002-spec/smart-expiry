/**
 * Stripe Webhook Handler
 * 
 * This Edge Function receives webhook events from Stripe and updates
 * subscription state in Supabase accordingly.
 * 
 * SETUP:
 * 1. Deploy this function: supabase functions deploy stripe-webhook
 * 2. In Stripe Dashboard, add webhook endpoint:
 *    https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
 * 3. Select events:
 *    - customer.subscription.created
 *    - customer.subscription.updated
 *    - customer.subscription.deleted
 *    - invoice.payment_succeeded
 *    - invoice.payment_failed
 * 4. Copy webhook signing secret and set as STRIPE_WEBHOOK_SECRET
 * 
 * TODO (when ready for production):
 * - Add signature verification using STRIPE_WEBHOOK_SECRET
 * - Extract real userId, plan, and period end from Stripe objects
 * - Handle edge cases (partial payments, prorations, etc.)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  applySubscriptionChange,
  mapStripeStatusToAutoRenew,
  deriveTierFromStripe,
  type SubscriptionTier,
} from '../_shared/subscriptions.ts';

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
  items: {
    data: Array<{
      price: {
        id: string;
        metadata?: Record<string, string>;
      };
    }>;
  };
  metadata?: Record<string, string>;
}

serve(async (req) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // TODO: Verify webhook signature when STRIPE_WEBHOOK_SECRET is set
  // const signature = req.headers.get('stripe-signature');
  // if (!signature) {
  //   return new Response('Missing signature', { status: 400 });
  // }
  // const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  // if (webhookSecret) {
  //   try {
  //     const event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret);
  //   } catch (err) {
  //     return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  //   }
  // }

  // Parse request body
  let bodyText: string;
  let event: StripeEvent;

  try {
    bodyText = await req.text();
    event = JSON.parse(bodyText);
  } catch (err) {
    console.error('Invalid JSON in webhook request:', err);
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventType = event.type;
  console.log('Stripe webhook event received:', {
    id: event.id,
    type: eventType,
    timestamp: new Date().toISOString(),
  });

  try {
    switch (eventType) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await handleSubscriptionCreatedOrUpdated(event.data.object as StripeSubscription);
        break;
      }

      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object as StripeSubscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        await handlePaymentSucceeded(event.data.object);
        break;
      }

      case 'invoice.payment_failed': {
        await handlePaymentFailed(event.data.object);
        break;
      }

      default:
        console.log('Unhandled Stripe event type:', eventType);
        // Return 200 to acknowledge receipt even if we don't handle it
    }

    return new Response(
      JSON.stringify({ received: true, eventId: event.id }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Error handling Stripe webhook:', {
      eventId: event.id,
      eventType: eventType,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({ error: 'Webhook handling error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Handle subscription created or updated events
 */
async function handleSubscriptionCreatedOrUpdated(
  subscription: StripeSubscription
): Promise<void> {
  // Extract userId from metadata (set when creating checkout session)
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.warn('No user_id in subscription metadata:', subscription.id);
    return;
  }

  // Determine tier from Stripe price/product
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const priceMetadata = subscription.items?.data?.[0]?.price?.metadata;
  const tier = deriveTierFromStripe(priceId, {
    ...subscription.metadata,
    ...priceMetadata,
  }) as SubscriptionTier;

  // Convert period end timestamp to ISO string
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  // Determine auto_renew based on subscription status
  const autoRenew = mapStripeStatusToAutoRenew(
    subscription.status,
    subscription.cancel_at_period_end
  );

  // Apply the subscription change
  const result = await applySubscriptionChange({
    userId,
    tier,
    validUntil: periodEnd,
    autoRenew,
    reason: 'stripe_webhook_subscription_updated',
  });

  if (!result.success) {
    throw new Error(`Failed to update subscription: ${result.error}`);
  }

  console.log('Subscription updated successfully:', {
    userId,
    tier,
    periodEnd,
    autoRenew,
    stripeSubscriptionId: subscription.id,
  });
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(
  subscription: StripeSubscription
): Promise<void> {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.warn('No user_id in subscription metadata:', subscription.id);
    return;
  }

  // When subscription is deleted, downgrade to free
  const result = await applySubscriptionChange({
    userId,
    tier: 'free',
    validUntil: null,
    autoRenew: false,
    reason: 'stripe_webhook_subscription_deleted',
  });

  if (!result.success) {
    throw new Error(`Failed to downgrade subscription: ${result.error}`);
  }

  console.log('Subscription deleted, user downgraded to free:', {
    userId,
    stripeSubscriptionId: subscription.id,
  });
}

/**
 * Handle successful payment
 * 
 * This can be used to extend subscription period or log payment events.
 * For now, we mainly rely on subscription.updated events.
 */
async function handlePaymentSucceeded(invoice: any): Promise<void> {
  console.log('Payment succeeded:', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amount: invoice.amount_paid,
    currency: invoice.currency,
  });

  // If the invoice has a subscription, the subscription.updated event
  // will handle the subscription state change, so we don't need to do anything here.
  // However, you could use this event to:
  // - Send confirmation emails
  // - Log payment history
  // - Update billing records
}

/**
 * Handle failed payment
 * 
 * This can be used to notify users or handle dunning management.
 */
async function handlePaymentFailed(invoice: any): Promise<void> {
  console.log('Payment failed:', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amount: invoice.amount_due,
    currency: invoice.currency,
    attemptCount: invoice.attempt_count,
  });

  // You could use this event to:
  // - Send payment failure notifications
  // - Update subscription status to past_due (handled by subscription.updated)
  // - Trigger dunning emails
  // - Log payment failures for analytics
}

