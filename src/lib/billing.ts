/**
 * Billing abstraction layer
 * Centralizes all subscription purchase logic behind a single interface
 * 
 * IMPORTANT: Actual prices come from App Store / Play Store via IAP.
 * The priceMonthly values here are only fallbacks for display before IAP loads.
 * Always use the localized price from useIAP() hook for actual display.
 */

import { supabase } from './supabase/client';

export type SubscriptionTier = 'free' | 'pro' | 'pro_plus';

export type SubscriptionPlan = {
  id: SubscriptionTier;
  label: string;
  labelEn: string;
  /** Fallback price - actual localized price comes from App Store / Play Store */
  priceMonthly: number;
  maxItems: number | null; // null = high volume (fair use)
  maxAiPagesPerMonth: number | null; // null = high volume (fair use)
  description: string;
  descriptionEn: string;
};

/**
 * Subscription plans configuration
 * 
 * NOTE: The priceMonthly values are fallbacks only.
 * Localized pricing is fetched from App Store / Play Store via IAP.
 * Use the useIAP() hook to get the actual localized price string.
 * 
 * Pro: For small businesses - 20 AI pages/month, 2000 products
 * Pro+: For high-volume businesses - fair use limits (minimarkets, supermarkets)
 */
export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    id: 'free',
    label: 'חינמי',
    labelEn: 'Free',
    priceMonthly: 0,
    maxItems: 150,
    maxAiPagesPerMonth: 5,
    description: 'מתאים להתחלה',
    descriptionEn: 'Great for getting started',
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    labelEn: 'Pro',
    priceMonthly: 29, // Fallback - actual price from store
    maxItems: 2000,
    maxAiPagesPerMonth: 20,
    description: 'מתאים לעסק קטן',
    descriptionEn: 'For small businesses',
  },
  pro_plus: {
    id: 'pro_plus',
    label: 'Pro+',
    labelEn: 'Pro+',
    priceMonthly: 59, // Fallback - actual price from store
    maxItems: null, // High volume - fair use
    maxAiPagesPerMonth: null, // High volume - fair use
    description: 'לעסקים עם נפח עבודה גבוה',
    descriptionEn: 'For high-volume businesses',
  },
};

/**
 * Billing provider type
 * Currently only 'mock', but will support 'stripe', 'apple', 'google' in the future
 */
export type BillingProvider = 'mock'; // TODO: add 'stripe' | 'apple' | 'google' etc.

/**
 * Result of a subscription purchase attempt
 */
export interface PurchaseResult {
  success: boolean;
  error?: string;
}

/**
 * Result of initiating a Stripe checkout session
 */
export interface StripeCheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
}

/**
 * Set user to free plan (no payment required)
 * 
 * @param userId - The user ID
 * @returns Result indicating success or failure
 */
export async function setFreePlan(userId: string): Promise<PurchaseResult> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_tier: 'free',
        subscription_valid_until: null,
        auto_renew: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Error setting free plan:', error);
      return { success: false, error: 'update_failed' };
    }

    return { success: true };
  } catch (error) {
    console.error('Exception setting free plan:', error);
    return { success: false, error: 'update_failed' };
  }
}

/**
 * Initiate Stripe checkout for a paid subscription plan
 * 
 * This calls a Supabase Edge Function that creates a Stripe Checkout Session
 * and returns the checkout URL. The user must complete payment in Stripe,
 * and a webhook will update the subscription status in Supabase.
 * 
 * @param userId - The user ID
 * @param plan - The subscription tier to purchase ('basic' or 'pro')
 * @returns Result with checkout URL or error
 */
export async function initiateStripeCheckout(
  userId: string,
  plan: SubscriptionTier
): Promise<StripeCheckoutResult> {
  // Validate plan
  if (plan === 'free') {
    return { success: false, error: 'invalid_plan' };
  }

  try {
    // Call Supabase Edge Function to create Stripe Checkout Session
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        userId,
        plan,
      },
    });

    if (error) {
      console.error('Error calling create-checkout-session:', error);
      
      // Check if the Edge Function doesn't exist (404) or is not deployed
      const errorMessage = error.message || String(error);
      if (
        errorMessage.includes('404') || 
        errorMessage.includes('not found') ||
        errorMessage.includes('Function not found') ||
        error.code === 'FUNCTION_NOT_FOUND'
      ) {
        return { 
          success: false, 
          error: 'edge_function_not_deployed',
        };
      }
      
      // Check for other common errors
      if (errorMessage.includes('non-2xx status code')) {
        // Function exists but returned an error - could be configuration issue
        console.error('Edge Function returned error status. Check function logs and configuration.');
        return { 
          success: false, 
          error: 'edge_function_error',
        };
      }
      
      return { success: false, error: 'checkout_failed' };
    }

    if (!data?.checkoutUrl) {
      console.error('No checkout URL returned from Edge Function');
      return { success: false, error: 'checkout_failed' };
    }

    return {
      success: true,
      checkoutUrl: data.checkoutUrl,
    };
  } catch (error: any) {
    console.error('Exception initiating Stripe checkout:', error);
    
    // Handle specific error cases
    const errorMessage = error?.message || String(error);
    if (
      errorMessage.includes('404') || 
      errorMessage.includes('not found') ||
      errorMessage.includes('Function not found')
    ) {
      return { 
        success: false, 
        error: 'edge_function_not_deployed',
      };
    }
    
    if (errorMessage.includes('non-2xx status code')) {
      return { 
        success: false, 
        error: 'edge_function_error',
      };
    }
    
    return { success: false, error: 'checkout_failed' };
  }
}

/**
 * Main entry point for starting a subscription purchase
 * 
 * For free plan: Directly updates the profile
 * For paid plans: Initiates Stripe checkout (requires real payment)
 * 
 * @param userId - The user ID
 * @param plan - The subscription tier to purchase
 * @returns Purchase result with checkout URL for paid plans, or success status for free plan
 * 
 * @deprecated Use setFreePlan() or initiateStripeCheckout() directly instead
 */
export async function startSubscriptionPurchase(
  userId: string,
  plan: SubscriptionTier
): Promise<PurchaseResult> {
  if (plan === 'free') {
    return setFreePlan(userId);
  }
  
  // For paid plans, this should not be used directly
  // Use initiateStripeCheckout() instead
  const result = await initiateStripeCheckout(userId, plan);
  return {
    success: result.success,
    error: result.error,
  };
}

/**
 * Mock subscription purchase implementation
 * 
 * This simulates a subscription purchase by directly updating the user's profile
 * in Supabase. In production, this would be replaced with real payment processing.
 * 
 * @param userId - The user ID
 * @param plan - The subscription tier to purchase ('pro')
 * @returns Purchase result
 */
async function startMockSubscriptionPurchase(
  userId: string,
  plan: SubscriptionTier
): Promise<PurchaseResult> {
  const targetPlan = SUBSCRIPTION_PLANS[plan];
  
  // Validate plan
  if (!targetPlan || plan === 'free') {
    return { success: false, error: 'invalid_plan' };
  }

  // Calculate subscription end date (30 days from now)
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Update user profile with subscription details
  const { error } = await supabase
    .from('profiles')
    .update({
      subscription_tier: plan,
      subscription_valid_until: in30Days,
      auto_renew: true,
      subscription_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Mock subscription purchase failed:', error);
    return { success: false, error: 'update_failed' };
  }

  return { success: true };
}

/**
 * Get the maximum number of items allowed for a subscription tier
 * 
 * @param tier - The subscription tier
 * @returns Maximum items (null = unlimited/fair use)
 */
export function getMaxItemsForTier(tier: SubscriptionTier): number | null {
  return SUBSCRIPTION_PLANS[tier]?.maxItems ?? null;
}

/**
 * Get the maximum number of AI pages (supplier intake) allowed per month for a tier
 * 
 * @param tier - The subscription tier
 * @returns Maximum pages/month (null = unlimited/fair use)
 */
export function getMaxAiPagesForTier(tier: SubscriptionTier): number | null {
  return SUBSCRIPTION_PLANS[tier]?.maxAiPagesPerMonth ?? null;
}

/**
 * Get subscription plan details
 * 
 * @param tier - The subscription tier
 * @returns Subscription plan or null if invalid
 */
export function getSubscriptionPlan(tier: SubscriptionTier): SubscriptionPlan | null {
  return SUBSCRIPTION_PLANS[tier] ?? null;
}

