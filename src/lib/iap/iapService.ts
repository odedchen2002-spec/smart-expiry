/**
 * In-App Purchase Service
 * 
 * Handles all IAP operations including:
 * - Connecting to App Store / Play Store
 * - Fetching products with localized pricing
 * - Processing purchases
 * - Restoring purchases
 * 
 * IMPORTANT: All prices come from the stores - never hardcoded.
 * The store automatically provides localized pricing based on user's storefront.
 * 
 * NOTE: This module gracefully handles the case where the native IAP module
 * is not available (e.g., in Expo Go or development builds without native modules).
 */

import { Platform } from 'react-native';
import { supabase } from '../supabase/client';
import { logSubscription } from '../logging/subscriptionLogger';

// Try to import expo-in-app-purchases, but handle if it's not available
let InAppPurchases: typeof import('expo-in-app-purchases') | null = null;
let isIAPModuleAvailable = false;

try {
  // Dynamic require to avoid crash if native module isn't available
  InAppPurchases = require('expo-in-app-purchases');
  isIAPModuleAvailable = true;
  logSubscription('[IAP] Native module loaded successfully');
} catch (error) {
  logSubscription('[IAP] Native module not available (expected in Expo Go/dev mode):', error);
  isIAPModuleAvailable = false;
}

// Product IDs configured in App Store Connect / Google Play Console
export const IAP_PRODUCT_IDS = {
  PRO_MONTHLY: Platform.select({
    ios: 'com.expiryx.pro.monthly',
    android: 'com.expiryx.pro.monthly',
    default: 'com.expiryx.pro.monthly',
  }) as string,
};

// All product IDs as array for fetching
export const ALL_PRODUCT_IDS = Object.values(IAP_PRODUCT_IDS);

/**
 * Helper to get readable name for IAP response codes
 */
function getResponseCodeName(code: number): string {
  if (!InAppPurchases) return `CODE(${code})`;
  
  const names: Record<number, string> = {
    [InAppPurchases.IAPResponseCode.OK]: 'OK',
    [InAppPurchases.IAPResponseCode.USER_CANCELED]: 'USER_CANCELED',
    [InAppPurchases.IAPResponseCode.ERROR]: 'ERROR',
    [InAppPurchases.IAPResponseCode.DEFERRED]: 'DEFERRED',
  };
  return names[code] || `UNKNOWN(${code})`;
}

/**
 * Check if IAP native module is available
 */
export function isIAPNativeModuleAvailable(): boolean {
  return isIAPModuleAvailable && InAppPurchases !== null;
}

/**
 * Localized product information from the store
 */
export interface LocalizedProduct {
  productId: string;
  title: string;
  description: string;
  /** Formatted price string with currency symbol (e.g., "₪29.00", "$9.99") */
  priceString: string;
  /** Price as number (for calculations) */
  price: number;
  /** Currency code (e.g., "ILS", "USD") */
  currencyCode: string;
}

/**
 * IAP Service state
 */
interface IAPState {
  isConnected: boolean;
  products: Map<string, LocalizedProduct>;
  isLoading: boolean;
  error: string | null;
}

let iapState: IAPState = {
  isConnected: false,
  products: new Map(),
  isLoading: false,
  error: null,
};

// Listeners for state changes
type StateListener = (state: IAPState) => void;
const listeners: Set<StateListener> = new Set();

function notifyListeners() {
  listeners.forEach(listener => listener({ ...iapState }));
}

/**
 * Subscribe to IAP state changes
 */
export function subscribeToIAPState(listener: StateListener): () => void {
  listeners.add(listener);
  // Immediately notify with current state
  listener({ ...iapState });
  return () => listeners.delete(listener);
}

/**
 * Initialize IAP connection and fetch products
 * Should be called early in app lifecycle
 */
export async function initializeIAP(): Promise<boolean> {
  logSubscription('[IAP:init] Starting initialization...', { 
    platform: Platform.OS,
    productIds: ALL_PRODUCT_IDS,
    nativeModuleAvailable: isIAPModuleAvailable,
  });

  // Check if native module is available
  if (!isIAPModuleAvailable || !InAppPurchases) {
    logSubscription('[IAP:init] ⚠ Native module not available - using fallback mode');
    iapState.isLoading = false;
    iapState.error = 'IAP not available in development mode';
    notifyListeners();
    return false;
  }

  if (iapState.isConnected) {
    logSubscription('[IAP:init] Already connected, skipping');
    return true;
  }

  if (iapState.isLoading) {
    logSubscription('[IAP:init] Already initializing, skipping');
    return false;
  }

  iapState.isLoading = true;
  iapState.error = null;
  notifyListeners();

  try {
    logSubscription('[IAP:init] Step 1/3: Connecting to store...');
    
    // Connect to the store
    await InAppPurchases.connectAsync();
    iapState.isConnected = true;
    
    logSubscription('[IAP:init] Step 2/3: Connected! Setting up purchase listener...');

    // Set up purchase listener
    InAppPurchases.setPurchaseListener(handlePurchaseUpdate);

    logSubscription('[IAP:init] Step 3/3: Fetching products...');

    // Fetch products
    await fetchProducts();

    iapState.isLoading = false;
    notifyListeners();
    
    logSubscription('[IAP:init] ✓ Initialization complete!', {
      productsLoaded: iapState.products.size,
      proPriceString: getProPriceString(),
    });
    
    return true;
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to connect to store';
    logSubscription('[IAP:init] ✗ Initialization FAILED:', {
      error: errorMessage,
      code: error.code,
      stack: error.stack?.substring(0, 200),
    });
    iapState.isConnected = false;
    iapState.isLoading = false;
    iapState.error = errorMessage;
    notifyListeners();
    return false;
  }
}

/**
 * Fetch products from store with localized pricing
 */
async function fetchProducts(): Promise<void> {
  if (!InAppPurchases) {
    logSubscription('[IAP:fetchProducts] Native module not available');
    return;
  }

  try {
    logSubscription('[IAP:fetchProducts] Requesting products from store...', {
      productIds: ALL_PRODUCT_IDS,
    });
    
    const { responseCode, results } = await InAppPurchases.getProductsAsync(ALL_PRODUCT_IDS);
    
    logSubscription('[IAP:fetchProducts] Store response:', {
      responseCode,
      responseCodeName: getResponseCodeName(responseCode),
      productsReturned: results?.length || 0,
    });
    
    if (responseCode !== InAppPurchases.IAPResponseCode.OK) {
      throw new Error(`Failed to fetch products: response code ${responseCode} (${getResponseCodeName(responseCode)})`);
    }

    logSubscription('[IAP:fetchProducts] Processing products...');

    // Store products with localized info
    iapState.products.clear();
    
    if (results) {
      for (const product of results) {
        const localizedProduct: LocalizedProduct = {
          productId: product.productId,
          title: product.title,
          description: product.description,
          priceString: product.priceString,
          price: parseFloat(product.price),
          currencyCode: product.priceCurrencyCode,
        };
        
        iapState.products.set(product.productId, localizedProduct);
        
        logSubscription('[IAP] Product:', {
          id: product.productId,
          price: product.priceString,
          currency: product.priceCurrencyCode,
        });
      }
    }
  } catch (error: any) {
    logSubscription('[IAP] Failed to fetch products:', error);
    throw error;
  }
}

/**
 * Get localized product info
 */
export function getProduct(productId: string): LocalizedProduct | null {
  return iapState.products.get(productId) || null;
}

/**
 * Get Pro monthly subscription with localized pricing
 */
export function getProMonthlyProduct(): LocalizedProduct | null {
  return getProduct(IAP_PRODUCT_IDS.PRO_MONTHLY);
}

/**
 * Get the localized price string for Pro subscription
 * Returns formatted string like "₪29.00" or "$9.99"
 */
export function getProPriceString(): string | null {
  const product = getProMonthlyProduct();
  return product?.priceString || null;
}

/**
 * Handle purchase updates from the store
 */
async function handlePurchaseUpdate(purchase: any): Promise<void> {
  if (!InAppPurchases) return;
  
  logSubscription('[IAP] Purchase update:', {
    productId: purchase.productId,
    acknowledged: purchase.acknowledged,
    transactionId: purchase.transactionId,
  });

  if (!purchase.acknowledged) {
    try {
      // Validate and process the purchase on backend
      const success = await validateAndProcessPurchase(purchase);
      
      if (success) {
        // Finish the transaction
        await InAppPurchases.finishTransactionAsync(purchase, true);
        logSubscription('[IAP] Transaction finished successfully');
      } else {
        // Finish but mark as not consumed (for consumables)
        await InAppPurchases.finishTransactionAsync(purchase, false);
        logSubscription('[IAP] Transaction finished (not processed)');
      }
    } catch (error) {
      logSubscription('[IAP] Error processing purchase:', error);
    }
  }
}

/**
 * Validate purchase with backend and update subscription
 */
async function validateAndProcessPurchase(
  purchase: InAppPurchases.InAppPurchase
): Promise<boolean> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logSubscription('[IAP] No user logged in');
      return false;
    }

    // Call Edge Function to validate receipt and update subscription
    const { data, error } = await supabase.functions.invoke('validate-iap-receipt', {
      body: {
        userId: user.id,
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        receipt: Platform.OS === 'ios' 
          ? purchase.transactionReceipt 
          : purchase.purchaseToken,
        platform: Platform.OS,
      },
    });

    if (error) {
      logSubscription('[IAP] Receipt validation failed:', error);
      return false;
    }

    logSubscription('[IAP] Receipt validated successfully:', data);
    return true;
  } catch (error) {
    logSubscription('[IAP] Error validating purchase:', error);
    return false;
  }
}

/**
 * Purchase Pro subscription
 */
export async function purchaseProSubscription(): Promise<{
  success: boolean;
  error?: string;
}> {
  logSubscription('[IAP:purchase] Starting purchase flow...', {
    productId: IAP_PRODUCT_IDS.PRO_MONTHLY,
    isConnected: iapState.isConnected,
    nativeModuleAvailable: isIAPModuleAvailable,
  });

  // Check if native module is available
  if (!isIAPModuleAvailable || !InAppPurchases) {
    logSubscription('[IAP:purchase] ✗ Native module not available');
    return { success: false, error: 'iap_not_available' };
  }

  if (!iapState.isConnected) {
    logSubscription('[IAP:purchase] Not connected, attempting to initialize...');
    const connected = await initializeIAP();
    if (!connected) {
      logSubscription('[IAP:purchase] ✗ Failed to connect to store');
      return { success: false, error: 'store_not_connected' };
    }
  }

  try {
    logSubscription('[IAP:purchase] Showing purchase dialog...');
    
    await InAppPurchases.purchaseItemAsync(IAP_PRODUCT_IDS.PRO_MONTHLY);
    
    // Purchase flow is handled by the purchase listener
    // This resolves when the purchase sheet is shown
    logSubscription('[IAP:purchase] ✓ Purchase dialog shown (awaiting user action)');
    return { success: true };
  } catch (error: any) {
    // Handle user cancellation
    if (error.code === 'E_USER_CANCELLED') {
      logSubscription('[IAP:purchase] User cancelled purchase');
      return { success: false, error: 'user_cancelled' };
    }
    
    logSubscription('[IAP:purchase] ✗ Purchase FAILED:', {
      error: error.message,
      code: error.code,
    });
    
    return { success: false, error: error.message || 'purchase_failed' };
  }
}

/**
 * Restore previous purchases
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  restored: boolean;
  error?: string;
}> {
  logSubscription('[IAP:restore] Starting restore flow...', {
    isConnected: iapState.isConnected,
    nativeModuleAvailable: isIAPModuleAvailable,
  });

  // Check if native module is available
  if (!isIAPModuleAvailable || !InAppPurchases) {
    logSubscription('[IAP:restore] ✗ Native module not available');
    return { success: false, restored: false, error: 'iap_not_available' };
  }

  if (!iapState.isConnected) {
    logSubscription('[IAP:restore] Not connected, attempting to initialize...');
    const connected = await initializeIAP();
    if (!connected) {
      logSubscription('[IAP:restore] ✗ Failed to connect to store');
      return { success: false, restored: false, error: 'store_not_connected' };
    }
  }

  try {
    logSubscription('[IAP:restore] Fetching purchase history from store...');
    
    const { responseCode, results } = await InAppPurchases.getPurchaseHistoryAsync();
    
    logSubscription('[IAP:restore] Store response:', {
      responseCode,
      responseCodeName: getResponseCodeName(responseCode),
      purchasesFound: results?.length || 0,
    });
    
    if (responseCode !== InAppPurchases.IAPResponseCode.OK) {
      logSubscription('[IAP:restore] ✗ Store returned error response');
      return { success: false, restored: false, error: 'restore_failed' };
    }

    // Process each purchase
    let restored = false;
    if (results && results.length > 0) {
      logSubscription('[IAP:restore] Processing purchases...', {
        count: results.length,
      });
      
      for (const purchase of results) {
        logSubscription('[IAP:restore] Validating purchase:', {
          productId: purchase.productId,
          transactionId: purchase.transactionId,
        });
        
        const success = await validateAndProcessPurchase(purchase as any);
        if (success) {
          restored = true;
          logSubscription('[IAP:restore] ✓ Purchase validated successfully');
        }
      }
    } else {
      logSubscription('[IAP:restore] No purchases found to restore');
    }

    logSubscription('[IAP:restore] ✓ Restore complete', { restored });
    return { success: true, restored };
  } catch (error: any) {
    logSubscription('[IAP:restore] ✗ Restore FAILED:', {
      error: error.message,
      code: error.code,
    });
    return { success: false, restored: false, error: error.message || 'restore_failed' };
  }
}

/**
 * Disconnect from store (call on app terminate)
 */
export async function disconnectIAP(): Promise<void> {
  if (iapState.isConnected && InAppPurchases) {
    try {
      await InAppPurchases.disconnectAsync();
      iapState.isConnected = false;
      iapState.products.clear();
      notifyListeners();
      logSubscription('[IAP] Disconnected from store');
    } catch (error) {
      logSubscription('[IAP] Error disconnecting:', error);
    }
  }
}

/**
 * Get current IAP state
 */
export function getIAPState(): Readonly<IAPState> {
  return { ...iapState };
}

/**
 * Check if IAP is available (store connected and products loaded)
 */
export function isIAPAvailable(): boolean {
  return iapState.isConnected && iapState.products.size > 0;
}

