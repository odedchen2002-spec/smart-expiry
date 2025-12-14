# Supabase Edge Functions

This directory contains Supabase Edge Functions for server-side operations.

## Structure

```
supabase/functions/
├── _shared/              # Shared modules used by multiple functions
│   └── subscriptions.ts  # Subscription management helper
├── delete-account/       # Account deletion handler
│   └── index.ts
├── stripe-webhook/       # Stripe webhook handler
│   └── index.ts
└── README.md            # This file
```

## Shared Modules

### `_shared/subscriptions.ts`

Reusable helper for updating subscription state in the database. Can be called from:
- Webhook handlers (Stripe, Apple, Google)
- Admin tools
- Manual override functions

**Key Functions:**
- `applySubscriptionChange()` - Updates subscription in `public.profiles` table
- `mapStripeStatusToAutoRenew()` - Maps Stripe status to auto_renew flag
- `deriveTierFromStripe()` - Determines tier from Stripe price/product

## Functions

### `delete-account`

Permanently deletes a user account and all associated data.

**What it deletes:**
- All items, products, locations, notifications
- Collaboration records (as owner or member)
- Notification logs and events
- Terms acceptance records
- Subscription logs
- User profile
- Auth user account

**Setup:**
1. Ensure Supabase secrets are configured (see below)
2. Deploy: `supabase functions deploy delete-account --project-ref YOUR_PROJECT_REF`
3. Verify in Supabase Dashboard → Edge Functions that `delete-account` appears

**Environment Variables:**
- `SUPABASE_URL` - Auto-provided by Supabase
- `SUPABASE_ANON_KEY` - Auto-provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-provided by Supabase

**Client Usage:**
```typescript
import { deleteUserAccount } from '@/lib/supabase/mutations/auth';

try {
  await deleteUserAccount();
  await supabase.auth.signOut();
  // Navigate to login screen
} catch (err) {
  console.error('Delete account failed', err);
  // Show error to user
}
```

**Security Notes:**
- Requires valid user session (Bearer token in Authorization header)
- Uses service role key only on server-side to delete auth user
- All deletions are logged for debugging

### `stripe-webhook`

Handles Stripe webhook events for subscription management.

**Events Handled:**
- `customer.subscription.created` - New subscription created
- `customer.subscription.updated` - Subscription status changed
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Payment completed
- `invoice.payment_failed` - Payment failed

**Setup:**
1. Deploy: `supabase functions deploy stripe-webhook`
2. Configure in Stripe Dashboard:
   - Endpoint: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
   - Select events listed above
3. Set environment variables:
   - `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (for signature verification)
   - `STRIPE_PRICE_BASIC` - Stripe Price ID for Basic plan
   - `STRIPE_PRICE_PRO` - Stripe Price ID for Pro plan

**Environment Variables:**
- `SUPABASE_URL` - Auto-provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-provided by Supabase
- `STRIPE_WEBHOOK_SECRET` - Set manually (for signature verification)
- `STRIPE_PRICE_BASIC` - Set manually (optional, for tier detection)
- `STRIPE_PRICE_PRO` - Set manually (optional, for tier detection)

## Development

### Local Development

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Serve functions locally
supabase functions serve

# Deploy function
supabase functions deploy stripe-webhook
```

### Testing

```bash
# Test function locally
curl -X POST http://localhost:54321/functions/v1/stripe-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"customer.subscription.created","data":{"object":{...}}}'

# View logs
supabase functions logs stripe-webhook
```

## Security Notes

- **Service Role Key**: The `_shared/subscriptions.ts` module uses the service role key, which bypasses RLS. This is intentional for server-side operations, but **never expose this key to client-side code**.
- **Webhook Verification**: Currently, webhook signature verification is commented out. **Enable it before production** by uncommenting the verification code in `stripe-webhook/index.ts`.
- **Error Handling**: All functions log errors but return appropriate HTTP status codes to Stripe to prevent retries on permanent failures.

## Future Enhancements

- [ ] Add signature verification for Stripe webhooks
- [ ] Create audit log table for subscription changes
- [ ] Add support for Apple/Google subscription webhooks
- [ ] Implement retry logic for failed webhook processing
- [ ] Add monitoring and alerting for webhook failures

