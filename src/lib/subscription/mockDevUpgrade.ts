/**
 * DEV-ONLY: Mock Pro upgrade for development builds
 * This function should NEVER be called in production builds
 */

import { supabase } from '../supabase/client';
import { isDevEnv } from '../utils/devEnv';
import { logSubscription } from '../logging/subscriptionLogger';

/**
 * Mock upgrade to Pro plan (DEV ONLY)
 * Updates the user's subscription tier to "pro" in Supabase
 * and unlocks all locked items
 * 
 * @param userId - The user ID
 * @returns Promise that resolves when upgrade is complete
 */
export async function mockDevUpgradeToPro(userId: string): Promise<void> {
  if (!isDevEnv()) {
    throw new Error('mockDevUpgradeToPro can only be called in development builds');
  }

  logSubscription('[Subscription] mockDevUpgradeToPro called for user:', userId);

  try {
    // 1) Update subscription tier in Supabase profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        subscription_tier: 'pro',
        subscription_valid_until: null, // Pro is unlimited
        auto_renew: true,
        subscription_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[Subscription] Failed to update tier in Supabase:', profileError);
      throw profileError;
    }

    logSubscription('[Subscription] Successfully updated subscription tier to pro in Supabase');

    // 2) Unlock all locked items for this user
    const { error: unlockError } = await supabase
      .from('items')
      .update({ is_plan_locked: false })
      .eq('owner_id', userId);

    if (unlockError) {
      console.error('[Subscription] Failed to unlock items:', unlockError);
      // Don't throw - unlocking items is nice to have but not critical
    } else {
      logSubscription('[Subscription] Successfully unlocked all items for Pro plan');
    }

    logSubscription('[Subscription] mockDevUpgradeToPro finished successfully');
  } catch (error) {
    console.error('[Subscription] mockDevUpgradeToPro failed:', error);
    throw error;
  }
}

