/**
 * Subscription management utilities
 * Handles 30-day free trial, free plan (150 products), paid plans, and payment status
 */

import { getMaxItemsForTier } from '@/lib/billing';
import { differenceInDays } from 'date-fns';
import { logSubscription } from '../logging/subscriptionLogger';
import { supabase } from '../supabase/client';

export type SubscriptionStatus = 'free' | 'active' | 'expired' | 'cancelled' | 'trial';
export type Plan = 'free' | 'pro' | 'pro_plus' | 'trial';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: Plan;
  trialEndDate: string | null;
  subscriptionEndDate: string | null;
  trialDaysRemaining: number;
  activeItemsCount: number;
  maxItems: number | null; // null means unlimited/fair use
  canAddItems: boolean;
  isTrialActive: boolean;
  isPaidActive: boolean;
  totalItemsCount: number; // Total items including hidden ones
}

const FREE_PLAN_MAX_ITEMS = getMaxItemsForTier('free') || 150;
const PRO_PLAN_MAX_ITEMS = getMaxItemsForTier('pro') || 2000;
const BASIC_PLAN_PRICE_ILS = 50;
const TRIAL_DAYS = 30;

/**
 * Check subscription status for an owner
 * @param ownerId - The owner ID (profile ID) to check
 * @param accountCreatedAt - Account created_at date (from profiles or auth.users) for trial tracking
 * @param profileSubscriptionTier - Subscription tier from profiles table
 * @param profileSubscriptionValidUntil - Subscription expiration date from profiles table
 */
export async function checkSubscriptionStatus(
  ownerId: string,
  profileSubscriptionTier?: string | null,
  accountCreatedAt?: string,
  profileSubscriptionTier2?: string | null, // Duplicate parameter for backward compatibility
  profileSubscriptionValidUntil?: string | null
): Promise<SubscriptionInfo> {
  return await calculateSubscriptionStatus(
    ownerId,
    profileSubscriptionTier || profileSubscriptionTier2,
    accountCreatedAt,
    profileSubscriptionValidUntil
  );
}

/**
 * Calculate subscription status manually
 * @param ownerId - The owner ID (profile ID)
 * @param accountCreatedAt - Account created_at date (from profiles or auth.users) for trial tracking
 * @param profileSubscriptionTier - Subscription tier from profiles table
 * @param profileSubscriptionValidUntil - Subscription expiration date from profiles table
 */
async function calculateSubscriptionStatus(
  ownerId: string,
  profileSubscriptionTier?: string | null,
  accountCreatedAt?: string,
  profileSubscriptionValidUntil?: string | null
): Promise<SubscriptionInfo> {
  // Use subscription tier from profile
  let currentPlan: string = (profileSubscriptionTier as string) || 'free';

  let subscriptionStatus: string | undefined;
  let subscriptionEndDate: string | undefined = profileSubscriptionValidUntil || undefined;

  // Count ALL active items (including those that might be hidden due to limits)
  let totalItemsCount = 0;
  let activeItemsCount = 0;
  try {
    const { count: totalCount, error: totalError } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .neq('status', 'resolved');

    if (totalError) {
      const isNetworkError =
        totalError.message?.includes('Network request failed') ||
        totalError.message?.includes('fetch failed') ||
        totalError.message?.includes('network');

      const isRLSError = totalError.code === '42P17';

      if (isNetworkError || isRLSError) {
        console.log('Error counting total items, defaulting to 0');
        totalItemsCount = 0;
      } else {
        console.warn('Error counting total items:', totalError.message);
        totalItemsCount = 0;
      }
    } else {
      totalItemsCount = totalCount || 0;
    }

    activeItemsCount = totalItemsCount; // For now, same as total
  } catch (error) {
    console.log('Error counting items, defaulting to 0:', (error as Error).message);
    totalItemsCount = 0;
    activeItemsCount = 0;
  }

  const now = new Date();
  const endDate = subscriptionEndDate ? new Date(subscriptionEndDate) : null;
  let isPaidActive = false;

  if (currentPlan === 'pro' || currentPlan === 'pro_plus') {
    if (endDate) {
      if (endDate > now) {
        isPaidActive = true;
        subscriptionStatus = 'active';
      } else {
        subscriptionStatus = 'expired';
        currentPlan = 'free';
      }
    } else {
      // No end date provided - assume active pro/pro+ plan
      isPaidActive = true;
      subscriptionStatus = 'active';
    }
  }

  // Check if user is in trial period (first 30 days after account creation)
  // IMPORTANT: Pro plan takes precedence - if user is on Pro, they are NOT on free trial
  // Use account created date from profiles or auth.users, not business created date
  let isTrialActive = false;
  let trialEndDate: string | null = null;
  let trialDaysRemaining = 0;

  // Only check for trial if user is NOT on Pro or Pro+ plan
  // Paid plans should NEVER be treated as "on free trial"
  if (accountCreatedAt && currentPlan !== 'pro' && currentPlan !== 'pro_plus') {
    const signupDate = new Date(accountCreatedAt);
    signupDate.setHours(0, 0, 0, 0);
    const trialEnd = new Date(signupDate);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
    trialEnd.setHours(23, 59, 59, 999);

    const nowDate = new Date();
    nowDate.setHours(0, 0, 0, 0);

    if (nowDate <= trialEnd) {
      isTrialActive = true;
      trialEndDate = trialEnd.toISOString();
      trialDaysRemaining = Math.max(0, differenceInDays(trialEnd, nowDate));
      logSubscription('[Subscription] Free trial active (user is NOT on Pro)', {
        ownerId,
        trialDaysRemaining,
        currentPlan,
      });
    } else {
      // Trial ended - automatically switch to free plan if not already upgraded
      if (currentPlan === 'trial' || (!isPaidActive && currentPlan !== 'pro')) {
        currentPlan = 'free';
        // Note: We should update the plan in the database, but we avoid that here
        // to prevent RLS recursion. The plan will be updated on next business query.
      }
    }
  } else if (currentPlan === 'pro' || currentPlan === 'pro_plus') {
    logSubscription('[Subscription] Paid plan active - trial check skipped (paid plan takes precedence)', {
      ownerId,
      currentPlan,
    });
  }

  const plan = (currentPlan as Plan) || 'free';
  let status: SubscriptionStatus;
  let maxItems: number | null;
  let canAddItems: boolean;

  // Precedence: Pro+ > Pro > Free Trial > Free
  // Paid plans take absolute precedence - if user is on paid plan, ignore trial status
  if (plan === 'pro_plus' && isPaidActive) {
    // Pro+ plan is active - unlimited/fair use access
    status = 'active';
    maxItems = null; // Unlimited (fair use)
    canAddItems = true;
    logSubscription('[Subscription] Pro+ plan active - unlimited access', {
      ownerId,
      plan,
      isPaidActive,
    });
  } else if (plan === 'pro' && isPaidActive) {
    // Pro plan is active - 2000 products limit
    status = 'active';
    maxItems = PRO_PLAN_MAX_ITEMS;
    canAddItems = activeItemsCount < PRO_PLAN_MAX_ITEMS;
    logSubscription('[Subscription] Pro plan active - 2000 items limit', {
      ownerId,
      plan,
      isPaidActive,
      activeItemsCount,
      maxItems,
    });
  } else if (isTrialActive) {
    // User is in 30-day free trial (and NOT on paid plan) - unlimited access
    status = 'trial';
    maxItems = null; // Unlimited during trial
    canAddItems = true;
    logSubscription('[Subscription] Free trial active (not paid) - unlimited access', {
      ownerId,
      plan,
      trialDaysRemaining,
    });
  } else if (plan === 'free' || !subscriptionStatus) {
    // Free plan - limited to 150 products
    status = 'free';
    maxItems = FREE_PLAN_MAX_ITEMS;
    canAddItems = activeItemsCount < FREE_PLAN_MAX_ITEMS;
    logSubscription('[Subscription] Free plan active - limited access', {
      ownerId,
      plan,
      activeItemsCount,
      maxItems,
    });
  } else {
    // Paid subscription expired - revert to free plan limits
    status = 'expired';
    maxItems = FREE_PLAN_MAX_ITEMS;
    canAddItems = activeItemsCount < FREE_PLAN_MAX_ITEMS;
    logSubscription('[Subscription] Subscription expired - reverting to free plan', {
      ownerId,
      plan,
      activeItemsCount,
      maxItems,
    });
  }

  return {
    status,
    plan: isTrialActive ? 'trial' : plan,
    trialEndDate,
    subscriptionEndDate: subscriptionEndDate || null,
    trialDaysRemaining,
    activeItemsCount,
    totalItemsCount,
    maxItems,
    canAddItems,
    isTrialActive,
    isPaidActive,
  };
}

/**
 * Check if user can add more items
 * @param ownerId - The owner ID (profile ID)
 * @param profileSubscriptionTier - Subscription tier from profiles table
 * @param accountCreatedAt - Account created date for trial tracking
 * @param profileSubscriptionValidUntil - Subscription expiration from profiles table
 */
export async function canAddItem(
  ownerId: string,
  profileSubscriptionTier?: string | null,
  accountCreatedAt?: string,
  profileSubscriptionValidUntil?: string | null
): Promise<{ canAdd: boolean; reason?: string; plan?: Plan }> {
  const subscription = await checkSubscriptionStatus(
    ownerId,
    profileSubscriptionTier,
    accountCreatedAt,
    profileSubscriptionValidUntil
  );

  if (!subscription.canAddItems) {
    // Pro plan limit reached (2000 items)
    if (subscription.plan === 'pro' && subscription.isPaidActive && subscription.activeItemsCount >= subscription.maxItems!) {
      return {
        canAdd: false,
        plan: 'pro',
        reason: `Pro plan limit reached. You can add up to ${subscription.maxItems} items on the Pro plan. Upgrade to Pro+ for unlimited items.`,
      };
    }
    // Free plan limit reached (150 items)
    if (subscription.status === 'free' && subscription.activeItemsCount >= subscription.maxItems!) {
      return {
        canAdd: false,
        plan: 'free',
        reason: `Free plan limit reached. You can add up to ${subscription.maxItems} items on the free plan. Subscribe to add more.`,
      };
    }
    // Subscription expired
    if (subscription.status === 'expired') {
      return {
        canAdd: false,
        reason: 'Your subscription has expired. Please subscribe to continue adding items.',
      };
    }
  }

  return { canAdd: subscription.canAddItems };
}

/**
 * Activate subscription (after payment)
 * Updates the profile with subscription information
 */
export async function activateSubscription(
  ownerId: string,
  plan: Plan = 'basic',
  months: number = 1
): Promise<void> {
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);

  // Update profile with subscription information
  const updateData: any = {
    subscription_tier: plan === 'basic' ? 'pro' : 'free',
    subscription_valid_until: endDate.toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', ownerId);

  if (error) {
    console.error('Error activating subscription:', error);
    throw error;
  }
}

/**
 * Get subscription constants
 */
export const SUBSCRIPTION_CONSTANTS = {
  FREE_PLAN_MAX_ITEMS,
  BASIC_PLAN_PRICE_ILS,
  TRIAL_DAYS,
} as const;

/**
 * Get effective tier considering trial period
 * Precedence: Pro+ > Pro > Free Trial > Free
 */
export function getEffectiveTier(subscription: SubscriptionInfo): Plan {
  // Pro+ plan takes absolute precedence
  if (subscription.plan === 'pro_plus' && subscription.isPaidActive) {
    return 'pro_plus';
  }
  // Pro plan
  if (subscription.plan === 'pro' && subscription.isPaidActive) {
    return 'pro';
  }
  // Free trial (only if NOT paid plan)
  if (subscription.isTrialActive) {
    return 'trial';
  }
  return subscription.plan;
}

