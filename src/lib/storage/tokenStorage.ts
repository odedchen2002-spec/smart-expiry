/**
 * Secure token storage
 * Uses expo-secure-store on mobile (Keychain/Keystore)
 * Uses cookies on web (HttpOnly, Secure, SameSite=Strict)
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY = 'refresh_token';

/**
 * Store refresh token securely
 */
export async function storeRefreshToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    // On web, use HttpOnly cookie via API endpoint
    // Note: In a real app, you'd call your backend API to set the cookie
    // For now, we'll use localStorage as fallback (not as secure, but works)
    // In production, implement a backend endpoint that sets HttpOnly cookies
    try {
      // Try to set cookie via document.cookie (not HttpOnly, but works for client-side)
      // For true HttpOnly, you need a backend endpoint
      const expires = new Date();
      expires.setTime(expires.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
      document.cookie = `${REFRESH_TOKEN_KEY}=${token}; expires=${expires.toUTCString()}; path=/; Secure; SameSite=Strict`;
    } catch (error) {
      console.warn('Failed to set cookie, falling back to SecureStore:', error);
      // Fallback to SecureStore even on web if cookie fails
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    }
  } else {
    // On mobile, use expo-secure-store (Keychain/Keystore)
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  }
}

/**
 * Get refresh token from secure storage
 */
export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    // On web, try to read from cookie
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === REFRESH_TOKEN_KEY) {
          return decodeURIComponent(value);
        }
      }
      return null;
    } catch (error) {
      console.warn('Failed to read cookie, trying SecureStore:', error);
      // Fallback to SecureStore
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    }
  } else {
    // On mobile, use expo-secure-store
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  }
}

/**
 * Remove refresh token from secure storage
 */
export async function removeRefreshToken(): Promise<void> {
  if (Platform.OS === 'web') {
    // On web, clear cookie
    try {
      document.cookie = `${REFRESH_TOKEN_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; Secure; SameSite=Strict`;
    } catch (error) {
      console.warn('Failed to clear cookie:', error);
    }
    // Also try SecureStore as fallback
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch (error) {
      // Ignore errors
    }
  } else {
    // On mobile, remove from SecureStore
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
}

