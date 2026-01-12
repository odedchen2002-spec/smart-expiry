/**
 * DEV-ONLY: Mock Pro/Pro+ upgrade for development builds
 * This function should NEVER be called in production builds
 */

import { supabase } from '../supabase/client';
import { isDevEnv } from '../utils/devEnv';
import { logSubscription } from '../logging/subscriptionLogger';
import type { SubscriptionTier } from '../billing';

/**
 * Mock upgrade to Pro or Pro+ plan (DEV ONLY)
 * Updates the user's subscription tier in Supabase
 * and unlocks all locked items
 * 
 * @param userId - The user ID
 * @param tier - The subscription tier to upgrade to ('pro' or 'pro_plus')
 * @returns Promise that resolves when upgrade is complete
 */
export async function mockDevUpgradeToPro(userId: string, tier: 'pro' | 'pro_plus' = 'pro'): Promise<void> {
  if (!isDevEnv()) {
    throw new Error('mockDevUpgradeToPro can only be called in development builds');
  }

  logSubscription(`[Subscription] mockDevUpgradeToPro called for user: ${userId}, tier: ${tier}`);

  try {
    // 1) Update subscription tier in Supabase profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        subscription_tier: tier,
        subscription_valid_until: null, // Pro/Pro+ is unlimited
        auto_renew: true,
        subscription_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[Subscription] Failed to update tier in Supabase:', profileError);
      throw profileError;
    }

    logSubscription(`[Subscription] Successfully updated subscription tier to ${tier} in Supabase`);

    // 2) Unlock all locked items for this user
    const { error: unlockError } = await supabase
      .from('items')
      .update({ is_plan_locked: false })
      .eq('owner_id', userId);

    if (unlockError) {
      console.error('[Subscription] Failed to unlock items:', unlockError);
      // Don't throw - unlocking items is nice to have but not critical
    } else {
      logSubscription(`[Subscription] Successfully unlocked all items for ${tier} plan`);
    }

    logSubscription('[Subscription] mockDevUpgradeToPro finished successfully');
  } catch (error) {
    console.error('[Subscription] mockDevUpgradeToPro failed:', error);
    throw error;
  }
}

