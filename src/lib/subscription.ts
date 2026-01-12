/**
 * Subscription management utilities
 * Works with user profiles for subscription tier management
 * 
 * Note: For purchasing subscriptions, use startSubscriptionPurchase() from @/lib/billing
 */

import type { SubscriptionTier } from '@/lib/billing';
import { getMaxItemsForTier } from '@/lib/billing';
import { supabase } from './supabase/client';
import { enforcePlanLimitAfterCreate } from './supabase/mutations/enforcePlanLimits';

export type SubscriptionTierType = SubscriptionTier;

export interface SubscriptionStatus {
  subscription_tier: SubscriptionTier;
  subscription_valid_until: string | null;
  auto_renew: boolean | null;
}

/**
 * Check and automatically downgrade expired subscriptions
 * This should be called whenever subscription status is loaded
 * 
 * @param userId - The user ID
 * @returns true if downgrade was performed, false otherwise
 */
async function checkAndDowngradeExpiredSubscription(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_valid_until, auto_renew')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    const tier = (data.subscription_tier as SubscriptionTier) || 'free';
    const validUntil = data.subscription_valid_until;
    const autoRenew = data.auto_renew || false;

    // Only downgrade if:
    // 1. User is on a paid plan (basic or pro)
    // 2. Subscription has expired (valid_until is in the past)
    // 3. Auto-renew is disabled
    if ((tier === 'basic' || tier === 'pro') && validUntil && !autoRenew) {
      const validUntilDate = new Date(validUntil);
      const now = new Date();

      if (validUntilDate < now) {
        // Downgrade to free
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            subscription_valid_until: null,
            auto_renew: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (updateError) {
          console.error('Error downgrading expired subscription:', updateError);
          return false;
        }

        // Enforce plan limits after downgrade to free
        // This will lock items beyond the Free limit (150)
        enforcePlanLimitAfterCreate(userId).catch((err) => {
          console.error('[checkAndDowngradeExpiredSubscription] Error enforcing plan limit:', err);
        });

        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Exception checking expired subscription:', error);
    return false;
  }
}

/**
 * Get subscription status for a user
 * Automatically downgrades expired subscriptions before returning status
 * 
 * @param userId - The user ID
 * @returns Subscription status or null if error
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus | null> {
  try {
    // First, check and downgrade if needed
    await checkAndDowngradeExpiredSubscription(userId);

    // Then fetch the current status
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_valid_until, auto_renew')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('getSubscriptionStatus error', error);
      return null;
    }

    if (!data) {
      return {
        subscription_tier: 'free',
        subscription_valid_until: null,
        auto_renew: false,
      };
    }

    return {
      subscription_tier: (data.subscription_tier as SubscriptionTier) || 'free',
      subscription_valid_until: data.subscription_valid_until || null,
      auto_renew: data.auto_renew || false,
    };
  } catch (error) {
    console.error('Exception in getSubscriptionStatus:', error);
    return null;
  }
}

/**
 * Upgrade user to Basic plan
 * @deprecated Use startSubscriptionPurchase() from @/lib/billing instead
 * @param userId - The user ID
 */
export async function upgradeToBasic(userId: string): Promise<{ success: boolean; error?: any }> {
  try {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_tier: 'basic',
        subscription_valid_until: in30Days,
        auto_renew: true,
        subscription_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Error upgrading to Basic:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('Exception upgrading to Basic:', error);
    return { success: false, error };
  }
}

/**
 * Upgrade user to Pro plan
 * @deprecated Use startSubscriptionPurchase() from @/lib/billing instead
 * @param userId - The user ID
 */
export async function upgradeToPro(userId: string): Promise<{ success: boolean; error?: any }> {
  try {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_tier: 'pro',
        subscription_valid_until: in30Days,
        auto_renew: true,
        subscription_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Error upgrading to Pro:', error);
      return { success: false, error };
    }

    // Enforce plan limits after subscription change
    // This will lock items beyond the Pro limit (2000)
    enforcePlanLimitAfterCreate(userId).catch((err) => {
      console.error('[upgradeToPro] Error enforcing plan limit:', err);
    });

    return { success: true };
  } catch (error) {
    console.error('Exception upgrading to Pro:', error);
    return { success: false, error };
  }
}

/**
 * Check if subscription is expired
 * @param subscriptionStatus - The subscription status
 * @returns true if expired, false otherwise
 */
export function isSubscriptionExpired(subscriptionStatus: SubscriptionStatus | null): boolean {
  if (!subscriptionStatus) return false;
  if (subscriptionStatus.subscription_tier === 'free') return false;
  if (!subscriptionStatus.subscription_valid_until) return false;

  const validUntil = new Date(subscriptionStatus.subscription_valid_until);
  const now = new Date();
  return validUntil < now;
}

/**
 * Get effective subscription tier (considering expiration)
 * @param subscriptionStatus - The subscription status
 * @returns The effective tier (downgrades to 'free' if expired)
 */
export function getEffectiveTier(subscriptionStatus: SubscriptionStatus | null): SubscriptionTier {
  if (!subscriptionStatus) return 'free';
  if (isSubscriptionExpired(subscriptionStatus)) return 'free';
  return subscriptionStatus.subscription_tier;
}

/**
 * Check if user can add more items based on their subscription tier
 * @param ownerId - The owner ID (profile ID) to count items for
 * @returns Object with canAdd flag and reason if blocked
 */
export async function canUserAddItem(
  ownerId: string
): Promise<{ canAdd: boolean; reason?: string; tier?: SubscriptionTier }> {
  try {
    // Get subscription status for the owner
    const subscription = await getSubscriptionStatus(ownerId);
    if (!subscription) {
      // If we can't get subscription, default to free tier
      return { canAdd: false, reason: 'לא ניתן לבדוק את סטטוס המנוי', tier: 'free' };
    }

    // Check if subscription is expired
    if (isSubscriptionExpired(subscription)) {
      return {
        canAdd: false,
        reason: 'המנוי שלך הסתיים. כדי להמשיך להשתמש בתוכנית בתשלום, יש לחדש את המנוי.',
        tier: 'free',
      };
    }

    const effectiveTier = getEffectiveTier(subscription);

    // Pro+ tier has unlimited items (fair use)
    if (effectiveTier === 'pro_plus') {
      return { canAdd: true, tier: 'pro_plus' };
    }

    // Pro tier has 2000 items limit
    if (effectiveTier === 'pro') {
      const { count, error } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .neq('status', 'resolved');

      if (error) {
        console.warn('[Subscription] Error counting items for Pro:', error);
        return { canAdd: true, tier: 'pro' }; // Fail open
      }

      const activeItemsCount = count || 0;
      const PRO_LIMIT = getMaxItemsForTier('pro') || 2000;

      if (activeItemsCount >= PRO_LIMIT) {
        return {
          canAdd: false,
          reason: 'pro_limit',
          tier: 'pro',
        };
      }

      return { canAdd: true, tier: 'pro' };
    }

    // Get profile to check account creation date for trial status
    const { data: profile } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', ownerId)
      .maybeSingle();

    // Check if user is in trial period (first 30 days after account creation)
    let isTrialActive = false;
    if (profile?.created_at) {
      const signupDate = new Date(profile.created_at);
      signupDate.setHours(0, 0, 0, 0);
      const trialEnd = new Date(signupDate);
      trialEnd.setDate(trialEnd.getDate() + 30);
      trialEnd.setHours(23, 59, 59, 999);

      const nowDate = new Date();
      nowDate.setHours(0, 0, 0, 0);

      if (nowDate <= trialEnd) {
        isTrialActive = true;
      }
    }

    // During trial, allow unlimited items
    if (isTrialActive) {
      return { canAdd: true, tier: 'free' };
    }

    // For free plan (post-trial), count only unlocked items (is_plan_locked = false)
    if (effectiveTier === 'free') {
      // Count only unlocked items for free plan
      const { count, error } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .eq('is_plan_locked', false)
        .neq('status', 'resolved');

      if (error) {
        console.warn('[Subscription] Error counting unlocked items:', error);
        // On error, be conservative and prevent adding
        return { canAdd: false, reason: 'לא ניתן לבדוק את מספר המוצרים', tier: 'free' };
      }

      const unlockedItemsCount = count || 0;
      const FREE_LIMIT = 150;

      if (unlockedItemsCount >= FREE_LIMIT) {
        return {
          canAdd: false,
          reason: 'free_limit',
          tier: 'free',
        };
      }

      return { canAdd: true, tier: 'free' };
    }

    // For basic tier (if it exists), use the same logic as before
    // Count active items for this owner
    const { count, error } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .neq('status', 'resolved');

    if (error) {
      console.warn('[Subscription] Error counting items:', error);
      // On error, allow adding (fail open)
      return { canAdd: true, tier: effectiveTier };
    }

    const activeItemsCount = count || 0;
    // Get max items from centralized billing configuration
    const maxItems = getMaxItemsForTier(effectiveTier);

    // If maxItems is null (unlimited), allow adding
    if (maxItems === null) {
      return { canAdd: true, tier: effectiveTier };
    }

    if (activeItemsCount >= maxItems) {
      if (effectiveTier === 'basic') {
        return {
          canAdd: false,
          reason: 'basic_limit',
          tier: 'basic',
        };
      }
    }

    return { canAdd: true, tier: effectiveTier };
  } catch (error) {
    console.error('Exception in canUserAddItem:', error);
    // On exception, allow adding (fail open)
    return { canAdd: true, tier: 'free' };
  }
}

/**
 * Cancel a user's subscription
 * Cancels the Stripe subscription at period end and marks auto_renew = false
 * 
 * @param userId - The user ID
 * @returns Result indicating success or failure
 */
export async function cancelSubscription(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Call Edge Function to cancel Stripe subscription at period end
    const { data, error } = await supabase.functions.invoke('cancel-subscription', {
      body: { userId },
    });

    if (error) {
      console.error('Error invoking cancel-subscription function:', error);
      return { success: false, error: 'edge_function_error' };
    }

    if (!data || data.success !== true) {
      console.error('cancel-subscription function returned failure:', data);
      return { success: false, error: data?.code || 'cancel_failed' };
    }

    // Edge Function already sets auto_renew = false in profiles.
    // We can rely on getSubscriptionStatus / hooks to pick up the change.
    return { success: true };
  } catch (error) {
    console.error('Exception canceling subscription:', error);
    return { success: false, error: 'cancel_failed' };
  }
}


