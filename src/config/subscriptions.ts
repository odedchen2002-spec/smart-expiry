/**
 * Subscription plans configuration
 */

export type SubscriptionTier = 'free' | 'pro' | 'pro_plus';

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
    max_items: 2000, // Pro plan has 2000 item limit
    price_monthly: 29, // NIS per month
  },
  pro_plus: {
    id: 'pro_plus',
    label: 'פרו פלוס',
    max_items: Infinity, // Unlimited for Pro Plus
    price_monthly: 49, // NIS per month
  },
} as const;

