/**
 * React hook for In-App Purchases
 * 
 * Provides localized product pricing and purchase functionality.
 * Prices come directly from App Store / Play Store based on user's storefront.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  initializeIAP,
  getProMonthlyProduct,
  getProPriceString,
  purchaseProSubscription,
  restorePurchases,
  subscribeToIAPState,
  isIAPAvailable,
  type LocalizedProduct,
} from '../iap/iapService';
import { logSubscription } from '../logging/subscriptionLogger';

interface UseIAPResult {
  /** Whether IAP is initialized and ready */
  isReady: boolean;
  /** Whether IAP is currently loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Pro monthly product with localized pricing */
  proProduct: LocalizedProduct | null;
  /** Formatted price string (e.g., "₪29.00", "$9.99") */
  proPriceString: string | null;
  /** Purchase Pro subscription */
  purchasePro: () => Promise<{ success: boolean; error?: string }>;
  /** Restore previous purchases */
  restore: () => Promise<{ success: boolean; restored: boolean; error?: string }>;
  /** Whether a purchase is in progress */
  isPurchasing: boolean;
  /** Whether restore is in progress */
  isRestoring: boolean;
  /** Retry initialization */
  retry: () => Promise<void>;
}

/**
 * Hook to access IAP functionality with localized pricing
 * 
 * @example
 * ```tsx
 * const { proPriceString, purchasePro, isReady } = useIAP();
 * 
 * // Display localized price
 * <Text>{proPriceString} / month</Text>
 * 
 * // Purchase
 * const handlePurchase = async () => {
 *   const result = await purchasePro();
 *   if (result.success) {
 *     // Purchase initiated
 *   }
 * };
 * ```
 */
export function useIAP(): UseIAPResult {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proProduct, setProProduct] = useState<LocalizedProduct | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Initialize IAP on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const success = await initializeIAP();
        
        if (mounted) {
          setIsReady(success);
          setIsLoading(false);
          
          if (success) {
            setProProduct(getProMonthlyProduct());
            setError(null);
          }
        }
      } catch (err: any) {
        if (mounted) {
          setIsLoading(false);
          setError(err.message || 'Failed to initialize IAP');
        }
      }
    };

    init();

    // Subscribe to IAP state changes
    const unsubscribe = subscribeToIAPState((state) => {
      if (mounted) {
        setIsReady(state.isConnected && state.products.size > 0);
        setIsLoading(state.isLoading);
        setError(state.error);
        
        if (state.isConnected) {
          setProProduct(getProMonthlyProduct());
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const purchasePro = useCallback(async () => {
    setIsPurchasing(true);
    try {
      const result = await purchaseProSubscription();
      return result;
    } finally {
      setIsPurchasing(false);
    }
  }, []);

  const restore = useCallback(async () => {
    setIsRestoring(true);
    try {
      const result = await restorePurchases();
      return result;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  const retry = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await initializeIAP();
      setIsReady(success);
      if (success) {
        setProProduct(getProMonthlyProduct());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize IAP');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isReady,
    isLoading,
    error,
    proProduct,
    proPriceString: proProduct?.priceString || null,
    purchasePro,
    restore,
    isPurchasing,
    isRestoring,
    retry,
  };
}

/**
 * Get the Pro price string synchronously (for use outside React components)
 * Returns null if IAP is not ready
 */
export function getProPrice(): string | null {
  if (!isIAPAvailable()) {
    return null;
  }
  return getProPriceString();
}

