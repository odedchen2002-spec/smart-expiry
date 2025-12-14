/**
 * Supabase client configuration
 * Configured with persistent login and secure token storage
 * Uses AsyncStorage for React Native and localStorage for web
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/config';
import type { Database } from '../../types/database';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase configuration. Please set environment variables.');
}

// Create a storage adapter that works with both React Native and Web
const createStorageAdapter = () => {
  // Check if we're on web
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage;
  
  if (isWeb) {
    // Web: use localStorage
    return {
      getItem: (key: string): Promise<string | null> => {
        try {
          const value = window.localStorage.getItem(key);
          return Promise.resolve(value);
        } catch (error) {
          console.error('Error reading from localStorage:', error);
          return Promise.resolve(null);
        }
      },
      setItem: (key: string, value: string): Promise<void> => {
        try {
          window.localStorage.setItem(key, value);
          return Promise.resolve();
        } catch (error) {
          console.error('Error writing to localStorage:', error);
          return Promise.resolve();
        }
      },
      removeItem: (key: string): Promise<void> => {
        try {
          window.localStorage.removeItem(key);
          return Promise.resolve();
        } catch (error) {
          console.error('Error removing from localStorage:', error);
          return Promise.resolve();
        }
      },
    };
  } else {
    // React Native: use AsyncStorage
    // Ensure AsyncStorage is available
    if (!AsyncStorage) {
      console.error('AsyncStorage is not available');
      // Return a fallback storage that does nothing
      return {
        getItem: (): Promise<string | null> => Promise.resolve(null),
        setItem: (): Promise<void> => Promise.resolve(),
        removeItem: (): Promise<void> => Promise.resolve(),
      };
    }
    
    return {
      getItem: (key: string): Promise<string | null> => {
        try {
          return AsyncStorage.getItem(key);
        } catch (error) {
          console.error('Error reading from AsyncStorage:', error);
          return Promise.resolve(null);
        }
      },
      setItem: (key: string, value: string): Promise<void> => {
        try {
          return AsyncStorage.setItem(key, value);
        } catch (error) {
          console.error('Error writing to AsyncStorage:', error);
          return Promise.resolve();
        }
      },
      removeItem: (key: string): Promise<void> => {
        try {
          return AsyncStorage.removeItem(key);
        } catch (error) {
          console.error('Error removing from AsyncStorage:', error);
          return Promise.resolve();
        }
      },
    };
  }
};

// Determine if we're on web for session detection
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // Enable session detection in URL for web (handles password reset links automatically)
    // Disable for React Native (we handle deep links manually)
    detectSessionInUrl: isWeb,
    // Use AsyncStorage for React Native, localStorage for web
    storage: createStorageAdapter(),
    storageKey: 'supabase.auth.token',
  },
  global: {
    // Headers are automatically added by Supabase
    // Authorization: Bearer <accessToken> is added automatically
  },
});

// Setup interceptor for token rotation (lazy import to avoid circular dependency)
// This will be called from AuthContext after client is initialized
let interceptorSetup = false;
export function setupSupabaseInterceptor() {
  if (interceptorSetup) return;
  interceptorSetup = true;
  
  // Lazy import to break circular dependency
  import('./interceptor').then(({ setupAuthInterceptor }) => {
    setupAuthInterceptor(supabase);
  });
}

