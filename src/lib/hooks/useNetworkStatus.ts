/**
 * Hook for detecting network connectivity status
 * Uses a simple fetch-based check that works in Expo Go without native modules
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean;
}

// Simple network check using fetch to a reliable endpoint
async function checkIsOnline(): Promise<boolean> {
  try {
    // Use Google's generate_204 endpoint - returns 204 if online
    // This is the same endpoint Android uses for connectivity checks
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.status === 204 || response.ok;
  } catch {
    // Network error or timeout = offline
    return false;
  }
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true, // Assume connected initially
    isInternetReachable: true,
  });
  
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const checkingRef = useRef(false);

  const checkNetwork = useCallback(async () => {
    // Prevent concurrent checks
    if (checkingRef.current) return;
    checkingRef.current = true;
    
    try {
      const isOnline = await checkIsOnline();
      setStatus({
        isConnected: isOnline,
        isInternetReachable: isOnline,
      });
    } catch (error) {
      console.warn('[useNetworkStatus] Error checking network:', error);
      // Keep current status on error
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Check initial state after a short delay to not block app startup
    const initialCheckTimeout = setTimeout(checkNetwork, 1000);

    // Check network when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        checkNetwork();
      }
      appStateRef.current = nextAppState;
    });

    // Poll network status every 30 seconds when app is active
    const intervalId = setInterval(() => {
      if (appStateRef.current === 'active') {
        checkNetwork();
      }
    }, 30000);

    return () => {
      clearTimeout(initialCheckTimeout);
      subscription.remove();
      clearInterval(intervalId);
    };
  }, [checkNetwork]);

  // Helper to check if truly offline
  const isOffline = !status.isConnected || !status.isInternetReachable;

  return {
    ...status,
    isOffline,
    isOnline: !isOffline,
    refresh: checkNetwork,
  };
}

// Standalone function to check network status (for use outside of React components)
export async function checkNetworkStatus(): Promise<boolean> {
  return checkIsOnline();
}
