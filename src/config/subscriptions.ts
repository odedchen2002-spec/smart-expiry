/**
 * Subscription plans configuration
 */

export type SubscriptionTier = 'free' | 'pro';

export interface PlanConfig {
  id: SubscriptionTier;
  label: string;
  max_items: number;
  price_monthly: number;
}

export const PLANS: Record<SubscriptionTier, PlanConfig> = {
  free: {
    id: 'free',
    label: 'חינמי',
    max_items: 150,
    price_monthly: 0,
  },
  pro: {
    id: 'pro',
    label: 'פרו',
    max_items: Infinity,
    price_monthly: 29, // NIS per month
  },
} as const;

