/**
 * Push Notifications Management
 * Handles registration and sending of push notifications
 * 
 * NOTE: Expiry notifications are now handled server-side via Supabase Edge Function.
 * This module only handles push token registration.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

/**
 * Check if running in Expo Go (limited notification support)
 */
function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient' || 
         Constants.appOwnership === 'expo';
}

/**
 * Ensure notification permissions are granted
 * Requests permissions if needed and shows alert if denied
 * Returns true if permissions are granted, false otherwise
 */
export async function ensureNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus, canAskAgain } = await Notifications.getPermissionsAsync();
    console.log('[Notifications] Existing permission status:', existingStatus, 'canAskAgain:', canAskAgain);

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted' && canAskAgain) {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowSound: true,
          allowBadge: true,
        },
      });
      finalStatus = status;
      console.log('[Notifications] Request permissions status:', status);
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Notification permissions NOT granted:', finalStatus);
      Alert.alert(
        'התראות כבויות',
        'כדי לקבל התראות צריך להפעיל אותן בהגדרות האייפון → Notifications עבור ExpiryX.'
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Notifications] Failed to check/request permissions', error);
    return false;
  }
}

/**
 * Register for push notifications and request permissions
 * Returns the Expo push token if successful, undefined otherwise
 * 
 * The push token should be saved to Supabase user_devices table using saveExpoPushToken.
 * Expiry notifications are sent server-side via Supabase Edge Function.
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  console.log('[Notifications] registerForPushNotificationsAsync called');

  let token: string | undefined;

  // Check if running on a physical device (required for push notifications)
  if (!Device.isDevice) {
    console.log('[Notifications] Not running on a physical device – cannot get push token');
    return undefined;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowAnnouncements: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted – cannot get push token');
    return undefined;
  }

  // Get push token
  // Try to get projectId from environment or app config
  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID || 
                   (Constants?.expoConfig?.extra?.eas?.projectId as string) ||
                   undefined;
  
  // Log project configuration for debugging
  const appSlug = Constants?.expoConfig?.slug || 'unknown';
  const bundleId = Platform.OS === 'ios' 
    ? (Constants?.expoConfig?.ios?.bundleIdentifier || 'unknown')
    : (Constants?.expoConfig?.android?.package || 'unknown');
  
  // Get the actual projectId from the build (embedded at build time)
  const embeddedProjectId = Constants?.expoConfig?.extra?.eas?.projectId;
  const runtimeProjectId = projectId;
  
  console.log('[Notifications] Project Configuration:', {
    projectId: projectId || 'NOT SET',
    embeddedProjectId: embeddedProjectId || 'NOT SET',
    appSlug,
    bundleId,
    source: projectId 
      ? (process.env.EXPO_PUBLIC_PROJECT_ID ? 'EXPO_PUBLIC_PROJECT_ID env var' : 'app.json extra.eas.projectId')
      : 'none (will use default)',
  });
  
  // Warn if there's a mismatch between embedded and runtime projectId
  if (embeddedProjectId && runtimeProjectId && embeddedProjectId !== runtimeProjectId) {
    console.warn('[Notifications] ⚠️ WARNING: ProjectId mismatch!');
    console.warn('[Notifications]   Embedded in build:', embeddedProjectId);
    console.warn('[Notifications]   From app.json/env:', runtimeProjectId);
    console.warn('[Notifications]   This can cause APNs credential errors!');
    console.warn('[Notifications]   Solution: Rebuild the app with: eas build -p ios --profile development');
  }
  
  try {
    if (projectId) {
      console.log(`[Notifications] Getting push token with projectId: ${projectId}`);
      const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
      token = expoToken.data;
      console.log(`[Notifications] ✅ Successfully obtained push token (starts with: ${token?.substring(0, 30)}...)`);
    } else {
      console.log('[Notifications] Getting push token without projectId (using default)');
      const expoToken = await Notifications.getExpoPushTokenAsync();
      token = expoToken.data;
      console.log(`[Notifications] ✅ Successfully obtained push token (starts with: ${token?.substring(0, 30)}...)`);
    }
  } catch (error: any) {
    console.error('[Notifications] ❌ Error getting push token:', error);
    console.error('[Notifications] Error details:', {
      message: error?.message,
      code: error?.code,
      projectId: projectId || 'none',
      appSlug,
      bundleId,
    });
    // If projectId is required but missing, log warning
    if (error?.message?.includes('projectId') || error?.message?.includes('project ID')) {
      console.warn('[Notifications] Push notifications require a projectId.');
      console.warn('[Notifications] Set EXPO_PUBLIC_PROJECT_ID environment variable or configure EAS project in app.json.');
    }
    return undefined;
  }

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
      console.log('[Notifications] Android notification channel set up');
    } catch (error) {
      console.warn('[Notifications] Error setting up Android notification channel:', error);
    }
  }

  return token;
}

/**
 * Save Expo push token to user_devices table in Supabase
 */
export type SavePushTokenParams = {
  supabase: SupabaseClient;
  userId: string;
  businessId: string | null;
  expoPushToken: string;
  platform: string; // 'ios' | 'android' | 'web'
};

export async function saveExpoPushToken({
  supabase,
  userId,
  businessId,
  expoPushToken,
  platform,
}: SavePushTokenParams) {
  try {
    console.log('[Notifications] Saving Expo push token to user_devices', {
      userId,
      businessId,
      platform,
      expoPushToken,
    });

    const { error } = await supabase
      .from('user_devices')
      .upsert(
        {
          user_id: userId,
          business_id: businessId,
          expo_push_token: expoPushToken,
          platform,
        },
        {
          onConflict: 'user_id,business_id,platform',
        },
      );

    if (error) {
      console.error('[Notifications] Failed to save Expo push token', error);
      return;
    }

    console.log('[Notifications] Saved Expo push token successfully');
  } catch (err) {
    console.error(
      '[Notifications] Unexpected error while saving Expo push token',
      err,
    );
  }
}

/**
 * Remove push token for a user when signing out
 * This prevents notifications from being sent to the old account
 * Uses RPC function for reliable removal (bypasses RLS)
 */
export async function removeExpoPushToken(userId: string) {
  try {
    console.log('[Notifications] Removing push tokens for user:', userId);

    // Try using RPC function first (most reliable, uses SECURITY DEFINER)
    const { error: rpcError } = await supabase.rpc('remove_user_push_tokens', {
      p_user_id: userId,
    });

    if (rpcError) {
      console.warn('[Notifications] RPC remove_user_push_tokens failed, trying direct approach:', rpcError);
      
      // Fallback to direct approach if RPC fails
      // Remove from user_devices table
      const { error: devicesError } = await supabase
        .from('user_devices')
        .delete()
        .eq('user_id', userId);

      if (devicesError) {
        console.error('[Notifications] Failed to remove from user_devices:', devicesError);
      } else {
        console.log('[Notifications] Removed push tokens from user_devices');
      }

      // Also clear push_token from user_preferences
      const { error: prefsError } = await supabase
        .from('user_preferences')
        .update({ push_token: null })
        .eq('user_id', userId);

      if (prefsError) {
        console.error('[Notifications] Failed to clear push_token from user_preferences:', prefsError);
      } else {
        console.log('[Notifications] Cleared push_token from user_preferences');
      }
    } else {
      console.log('[Notifications] Successfully removed push tokens via RPC');
    }

    console.log('[Notifications] Push token removal completed for user:', userId);
  } catch (err) {
    console.error('[Notifications] Unexpected error removing push tokens:', err);
  }
}

/**
 * Send a test notification (local, for testing purposes)
 */
export async function sendTestNotification() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'תזכורת תפוגה',
      body: 'זוהי התראה בדיקה',
      sound: true,
    },
    trigger: {
      seconds: 2,
    },
  });
}
