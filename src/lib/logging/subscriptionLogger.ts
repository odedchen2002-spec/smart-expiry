/**
 * Subscription logging utility
 * Only logs when EXPO_PUBLIC_SUBSCRIPTION_DEBUG=true is set in development
 */

export const SUBSCRIPTION_DEBUG =
  __DEV__ && process.env.EXPO_PUBLIC_SUBSCRIPTION_DEBUG === 'true';

/**
 * Log subscription-related debug information
 * Only logs in development when EXPO_PUBLIC_SUBSCRIPTION_DEBUG=true
 * @param args - Arguments to log (same as console.log)
 */
export function logSubscription(...args: any[]) {
  if (!SUBSCRIPTION_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}

