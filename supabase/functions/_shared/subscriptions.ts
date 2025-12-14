/**
 * Shared subscription management helper for Edge Functions
 * 
 * This module provides a reusable function to update subscription state in the database.
 * It can be called from webhooks, admin tools, or other server-side functions.
 * 
 * IMPORTANT: This uses the Supabase service role client (server-side only).
 * Never expose this client to the client-side app.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type SubscriptionTier = 'free' | 'basic' | 'pro';

export interface SubscriptionChangeInput {
  userId: string;
  tier: SubscriptionTier;
  validUntil: string | null; // ISO string or null for free
  autoRenew: boolean;
  reason?: string; // optional audit reason, e.g. 'stripe_webhook', 'admin_override'
}

/**
 * Apply a subscription change to a user's profile
 * 
 * This function updates the public.profiles table with new subscription information.
 * It validates input and logs errors for debugging.
 * 
 * @param input - Subscription change details
 * @returns Success status and optional error message
 */
export async function applySubscriptionChange(
  input: SubscriptionChangeInput
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate input
    if (!input.userId || typeof input.userId !== 'string') {
      console.error('Invalid userId:', input.userId);
      return { success: false, error: 'Invalid userId' };
    }

    if (!['free', 'basic', 'pro'].includes(input.tier)) {
      console.error('Invalid tier:', input.tier);
      return { success: false, error: 'Invalid tier' };
    }

    // Create Supabase service role client (server-side only)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return { success: false, error: 'Server configuration error' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Prepare update data
    const updateData: {
      subscription_tier: SubscriptionTier;
      subscription_valid_until: string | null;
      auto_renew: boolean;
      updated_at: string;
    } = {
      subscription_tier: input.tier,
      subscription_valid_until: input.validUntil,
      auto_renew: input.autoRenew,
      updated_at: new Date().toISOString(),
    };

    // For free tier, ensure validUntil is null
    if (input.tier === 'free') {
      updateData.subscription_valid_until = null;
      updateData.auto_renew = false;
    }

    // Update the profile
    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', input.userId);

    if (error) {
      console.error(
        'Error updating subscription:',
        {
          userId: input.userId,
          tier: input.tier,
          reason: input.reason,
          error: error.message,
        }
      );
      return { success: false, error: error.message };
    }

    // If moving from free trial to free tier, enforce hard free-plan item limit
    if (input.tier === 'free') {
      await enforceFreePlanItemLimitForOwner(input.userId, 150, supabase);
    }

    // If upgrading to pro, unlock all items for this user (no locked products on Pro)
    if (input.tier === 'pro') {
      await unlockAllItemsForOwner(input.userId, supabase);
    }

    // Log successful update
    console.log(
      'Subscription updated successfully:',
      {
        userId: input.userId,
        tier: input.tier,
        validUntil: input.validUntil,
        autoRenew: input.autoRenew,
        reason: input.reason || 'unknown',
      }
    );

    // TODO: Optionally insert audit log if we have a logs table
    // Example:
    // await supabase.from('subscription_logs').insert({
    //   user_id: input.userId,
    //   old_tier: ...,
    //   new_tier: input.tier,
    //   reason: input.reason,
    //   created_at: new Date().toISOString(),
    // });

    return { success: true };
  } catch (error) {
    console.error(
      'Exception in applySubscriptionChange:',
      {
        userId: input.userId,
        tier: input.tier,
        reason: input.reason,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Enforce free plan item limit for an owner
 * Keeps the first 150 items (by created_at ASC) unlocked, locks all others
 * This operation is idempotent (safe to run multiple times)
 * 
 * @param ownerId - The owner ID
 * @param limit - Maximum number of items to keep unlocked (default: 150)
 * @param supabase - Supabase client instance
 */
export async function enforceFreePlanItemLimitForOwner(
  ownerId: string,
  limit: number = 150,
  supabase: SupabaseClient
): Promise<void> {
  try {
    console.log('[Subscriptions] Enforcing free plan item limit for owner:', ownerId, 'limit:', limit);

    // Fetch all items for this owner, ordered by created_at ASC (oldest first)
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });

    if (itemsError) {
      console.error('[Subscriptions] Error fetching items for limit enforcement:', itemsError.message);
      return;
    }

    if (!items || items.length === 0) {
      console.log('[Subscriptions] No items found for owner:', ownerId);
      return;
    }

    // Compute the list of item IDs to keep unlocked (first `limit` items)
    const keepIds = items.slice(0, limit).map((item: any) => item.id);
    const totalItems = items.length;
    const keptCount = keepIds.length;
    const lockedCount = totalItems - keptCount;

    console.log('[Subscriptions] Free plan limit enforcement:', {
      ownerId,
      totalItems,
      keptCount,
      lockedCount,
      limit,
    });

    // Unlock the first `limit` items
    if (keepIds.length > 0) {
      const { error: unlockError } = await supabase
        .from('items')
        .update({ is_plan_locked: false })
        .eq('owner_id', ownerId)
        .in('id', keepIds);

      if (unlockError) {
        console.error('[Subscriptions] Failed to unlock items:', unlockError.message);
      } else {
        console.log('[Subscriptions] Unlocked', keptCount, 'items for owner:', ownerId);
      }
    }

    // Lock all other items (those not in keepIds)
    if (lockedCount > 0) {
      // Use a more efficient approach: update all items for this owner, then unlock the ones we want to keep
      // This handles the case where keepIds might be empty or we need to lock everything
      const { error: lockAllError } = await supabase
        .from('items')
        .update({ is_plan_locked: true })
        .eq('owner_id', ownerId);

      if (lockAllError) {
        console.error('[Subscriptions] Failed to lock items:', lockAllError.message);
      } else {
        // Now unlock the ones we want to keep
        if (keepIds.length > 0) {
          const { error: unlockKeepError } = await supabase
            .from('items')
            .update({ is_plan_locked: false })
            .eq('owner_id', ownerId)
            .in('id', keepIds);

          if (unlockKeepError) {
            console.error('[Subscriptions] Failed to unlock kept items after locking all:', unlockKeepError.message);
          } else {
            console.log('[Subscriptions] Locked', lockedCount, 'items and kept', keptCount, 'unlocked for owner:', ownerId);
          }
        }
      }
    } else {
      // All items fit within the limit, ensure all are unlocked
      const { error: unlockAllError } = await supabase
        .from('items')
        .update({ is_plan_locked: false })
        .eq('owner_id', ownerId);

      if (unlockAllError) {
        console.error('[Subscriptions] Failed to unlock all items:', unlockAllError.message);
      }
    }
  } catch (error) {
    console.error('[Subscriptions] Exception while enforcing free plan item limit:', error);
  }
}

/**
 * Unlock all items for an owner (used when upgrading to Pro)
 * 
 * @param ownerId - The owner ID
 * @param supabase - Supabase client instance
 */
export async function unlockAllItemsForOwner(
  ownerId: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    console.log('[Subscriptions] Unlocking all items for Pro plan - owner:', ownerId);
    
    const { error: unlockAllError } = await supabase
      .from('items')
      .update({ is_plan_locked: false })
      .eq('owner_id', ownerId);

    if (unlockAllError) {
      console.error('[Subscriptions] Failed to unlock items on pro upgrade:', unlockAllError.message);
    } else {
      console.log('[Subscriptions] Successfully unlocked all items for Pro plan - owner:', ownerId);
    }
  } catch (unlockException) {
    console.error('[Subscriptions] Exception while unlocking items on pro upgrade:', unlockException);
  }
}

/**
 * Helper to map Stripe subscription status to our app's auto_renew flag
 * 
 * @param stripeStatus - Stripe subscription status
 * @param cancelAtPeriodEnd - Whether Stripe subscription is set to cancel at period end
 * @returns boolean indicating if subscription should auto-renew
 */
export function mapStripeStatusToAutoRenew(
  stripeStatus: string,
  cancelAtPeriodEnd: boolean
): boolean {
  // If explicitly set to cancel at period end, auto_renew is false
  if (cancelAtPeriodEnd) {
    return false;
  }

  // Active subscriptions auto-renew
  if (stripeStatus === 'active' || stripeStatus === 'trialing') {
    return true;
  }

  // All other statuses (canceled, past_due, etc.) don't auto-renew
  return false;
}

/**
 * Helper to derive subscription tier from Stripe price/product metadata
 * 
 * In the future, this will read from Stripe price metadata or product metadata
 * to determine if it's 'basic' or 'pro'.
 * 
 * @param stripePriceId - Stripe Price ID
 * @param metadata - Optional metadata object from Stripe
 * @returns Subscription tier ('basic' or 'pro')
 */
export function deriveTierFromStripe(
  stripePriceId: string | null,
  metadata?: Record<string, string>
): 'basic' | 'pro' {
  // Check metadata first (most reliable)
  if (metadata?.tier) {
    if (metadata.tier === 'basic' || metadata.tier === 'pro') {
      return metadata.tier;
    }
  }

  // Fallback: check price ID against environment variables
  const basicPriceId = Deno.env.get('STRIPE_PRICE_BASIC');
  const proPriceId = Deno.env.get('STRIPE_PRICE_PRO');

  if (stripePriceId === basicPriceId) {
    return 'basic';
  }
  if (stripePriceId === proPriceId) {
    return 'pro';
  }

  // Default to basic if we can't determine
  console.warn('Could not determine tier from Stripe data, defaulting to basic:', {
    stripePriceId,
    metadata,
  });
  return 'basic';
}

