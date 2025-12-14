/**
 * Initialize Push Notifications for User
 * 
 * This module handles requesting notification permissions and registering
 * push tokens on app startup, after user authentication.
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase/client';
import { saveExpoPushToken } from './pushNotifications';
import { Platform } from 'react-native';

const ASKED_KEY = 'push_permission_asked';

function getProjectId(): string | undefined {
  // Prefer EAS projectId
  return Constants?.expoConfig?.extra?.eas?.projectId
    ?? (Constants as any)?.easConfig?.projectId;
}

export interface InitPushNotificationsResult {
  ok: boolean;
  status?: string;
  token?: string;
  error?: any;
  saveError?: any;
}

export async function initPushNotificationsForUser(
  userId: string,
  activeOwnerId: string | null = null
): Promise<InitPushNotificationsResult> {
  try {
    console.log('[Push] initPushNotificationsForUser called for userId:', userId);

    const asked = await AsyncStorage.getItem(ASKED_KEY);

    // We still check permissions even if asked=true, because user may have changed Settings
    const perms = await Notifications.getPermissionsAsync();
    let status = perms.status;

    console.log('[Push] Current permission status:', { status, canAskAgain: perms.canAskAgain, asked });

    if (status !== 'granted' && perms.canAskAgain) {
      // Only request on first launch OR if we never asked before
      if (!asked) {
        console.log('[Push] Requesting notification permissions...');
        const req = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowSound: true,
            allowBadge: true,
          },
        });
        status = req.status;
        await AsyncStorage.setItem(ASKED_KEY, 'true');
        console.log('[Push] Permission request result:', status);
      } else {
        console.log('[Push] Already asked before, skipping permission request');
      }
    } else {
      if (!asked) await AsyncStorage.setItem(ASKED_KEY, 'true');
    }

    if (status !== 'granted') {
      console.log('[Push] Permission not granted:', { status, canAskAgain: perms.canAskAgain });
      return { ok: false, status };
    }

    const projectId = getProjectId();
    if (!projectId) {
      console.warn('[Push] Missing EAS projectId for getExpoPushTokenAsync');
    }

    console.log('[Push] Getting Expo push token with projectId:', projectId);

    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined as any
    );
    const expoPushToken = tokenRes.data;

    console.log('[Push] Got Expo push token:', expoPushToken);

    // Save token to Supabase user_devices table
    try {
      await saveExpoPushToken({
        supabase,
        userId,
        businessId: activeOwnerId,
        expoPushToken,
        platform: Platform.OS,
      });
      console.log('[Push] Successfully saved push token to user_devices');
    } catch (saveError) {
      console.warn('[Push] Failed saving token to user_devices:', saveError);
      return { ok: false, status, token: expoPushToken, saveError };
    }

    return { ok: true, status, token: expoPushToken };
  } catch (e) {
    console.error('[Push] initPushNotificationsForUser failed:', e);
    return { ok: false, error: e };
  }
}

