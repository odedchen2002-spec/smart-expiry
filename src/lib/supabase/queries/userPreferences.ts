/**
 * User Preferences Queries
 * Handles saving and loading user preferences from Supabase
 * This is the single source of truth for user notification settings
 */

import { supabase } from '../client';

export interface UserPreferences {
  user_id: string;
  push_token: string | null;
  timezone: string | null;
  notification_time: string | null; // Format: 'HH:mm'
  notification_days_before: number | null;
  notification_hour: number | null;
  notification_minute: number | null;
  expiry_notify_enabled: boolean | null;
  preferred_language: string | null; // 'he' or 'en'
  updated_at: string | null;
  created_at: string | null;
}

export interface NotificationSettingsFromPreferences {
  expiry_notify_enabled: boolean;
  notification_days_before: number;
  notification_hour: number;
  notification_minute: number;
  timezone: string;
}

/**
 * Get user preferences for a user
 */
export async function getUserPreferences(
  userId: string
): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No row found - return null
      return null;
    }
    console.error('[UserPreferences] Error fetching preferences:', error);
    throw error;
  }

  return data;
}

/**
 * Get notification settings from user preferences
 * Returns null if user doesn't exist or has no settings
 * Includes backward compatibility: derives hour/minute from notification_time if needed
 */
export async function getNotificationSettingsFromPreferences(
  userId: string
): Promise<NotificationSettingsFromPreferences | null> {
  const prefs = await getUserPreferences(userId);
  
  if (!prefs) {
    return null;
  }

  // Backward compatibility: if hour/minute are null but notification_time exists, derive them
  let notificationHour = prefs.notification_hour;
  let notificationMinute = prefs.notification_minute;
  let needsMigration = false;

  if ((notificationHour === null || notificationMinute === null) && prefs.notification_time) {
    // Derive hour/minute from notification_time (format: HH:mm)
    const timeMatch = prefs.notification_time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      notificationHour = parseInt(timeMatch[1], 10);
      notificationMinute = parseInt(timeMatch[2], 10);
      if (notificationHour >= 0 && notificationHour <= 23 && notificationMinute >= 0 && notificationMinute <= 59) {
        needsMigration = true;
        console.log('[UserPreferences] Migrating notification_time to hour/minute:', {
          user_id: userId,
          notification_time: prefs.notification_time,
          derived_hour: notificationHour,
          derived_minute: notificationMinute,
        });
      } else {
        // Invalid time format
        notificationHour = null;
        notificationMinute = null;
      }
    }
  }

  // Check if we have the required fields
  if (
    notificationHour === null ||
    notificationMinute === null ||
    prefs.notification_days_before === null ||
    !prefs.timezone
  ) {
    return null;
  }

  // If we derived hour/minute from notification_time, persist them back
  if (needsMigration) {
    try {
      await saveNotificationSettingsToPreferences(userId, {
        expiry_notify_enabled: prefs.expiry_notify_enabled !== false,
        notification_days_before: prefs.notification_days_before,
        notification_hour: notificationHour,
        notification_minute: notificationMinute,
        timezone: prefs.timezone,
      });
      console.log('[UserPreferences] Migrated notification_time to hour/minute and persisted');
    } catch (error) {
      console.warn('[UserPreferences] Failed to persist migrated hour/minute:', error);
      // Continue anyway - we have the values in memory
    }
  }

  return {
    expiry_notify_enabled: prefs.expiry_notify_enabled !== false, // Default true
    notification_days_before: prefs.notification_days_before,
    notification_hour: notificationHour,
    notification_minute: notificationMinute,
    timezone: prefs.timezone,
  };
}

/**
 * Save notification settings to user preferences
 * Always saves notification_time (HH:mm) in addition to hour/minute
 * Also saves push_token if provided (required for Edge Function to send notifications)
 */
export async function saveNotificationSettingsToPreferences(
  userId: string,
  settings: {
    expiry_notify_enabled: boolean;
    notification_days_before: number;
    notification_hour: number;
    notification_minute: number;
    timezone: string;
    push_token?: string; // Optional - if provided, saved to user_preferences for Edge Function
  }
): Promise<UserPreferences> {
  const now = new Date().toISOString();
  
  // Build notification_time string from hour/minute (HH:mm format with zero-padding)
  const notificationTime = `${settings.notification_hour.toString().padStart(2, '0')}:${settings.notification_minute.toString().padStart(2, '0')}`;
  
  const upsertPayload: Record<string, any> = {
    user_id: userId,
    expiry_notify_enabled: settings.expiry_notify_enabled,
    notification_days_before: settings.notification_days_before,
    notification_hour: settings.notification_hour,
    notification_minute: settings.notification_minute,
    notification_time: notificationTime, // Always set if hour/minute exist
    timezone: settings.timezone,
    updated_at: now,
  };
  
  // Include push_token if provided (required for Edge Function to find this user)
  if (settings.push_token) {
    upsertPayload.push_token = settings.push_token;
  }

  // Log upsert payload (dev mode only to avoid excessive logs)
  if (__DEV__) {
    console.log('[UserPreferences] Upserting notification settings:', {
      user_id: userId,
      payload: upsertPayload,
    });
  }

  const { error, data } = await supabase
    .from('user_preferences')
    .upsert(upsertPayload, {
      onConflict: 'user_id',
    })
    .select();

  if (error) {
    console.error('[UserPreferences] Error saving notification settings:', {
      user_id: userId,
      error: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }

  // Re-fetch user_preferences after saving
  const savedPrefs = await getUserPreferences(userId);
  
  if (!savedPrefs) {
    throw new Error('Failed to fetch saved preferences');
  }

  // Log saved values for debugging (dev mode only)
  if (__DEV__) {
    console.log('[UserPreferences] Saved and verified notification settings:', {
      user_id: userId,
      notification_hour: savedPrefs.notification_hour,
      notification_minute: savedPrefs.notification_minute,
      notification_time: savedPrefs.notification_time,
      notification_days_before: savedPrefs.notification_days_before,
      expiry_notify_enabled: savedPrefs.expiry_notify_enabled,
      timezone: savedPrefs.timezone,
      updated_at: savedPrefs.updated_at,
    });
  }

  return savedPrefs;
}

/**
 * Save preferred language to user preferences
 */
export async function savePreferredLanguage(
  userId: string,
  language: 'he' | 'en'
): Promise<void> {
  const now = new Date().toISOString();
  
  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        preferred_language: language,
        updated_at: now,
      },
      {
        onConflict: 'user_id',
      }
    );

  if (error) {
    console.error('[UserPreferences] Error saving preferred language:', {
      user_id: userId,
      error: error.message,
    });
    // Don't throw - this is not critical
  }
}

