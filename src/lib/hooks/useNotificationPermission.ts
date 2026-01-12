/**
 * Hook to check and monitor notification permission status
 * 
 * Returns the current permission status and whether notifications are enabled.
 * Re-checks permission when the app comes to foreground (user might have changed settings).
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, AppStateStatus, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export interface NotificationPermissionState {
  /** Whether notifications are enabled (permission granted) */
  isEnabled: boolean;
  /** Raw permission status from expo-notifications */
  status: Notifications.PermissionStatus | null;
  /** Whether we're still checking the permission */
  isLoading: boolean;
  /** Whether user can be asked again (hasn't permanently denied) */
  canAskAgain: boolean;
  /** Function to open device settings */
  openSettings: () => void;
  /** Function to re-check permission status */
  refresh: () => Promise<void>;
  /** 
   * Request permission or open settings
   * If canAskAgain is true, requests permission via system dialog.
   * If permission was permanently denied, opens device settings.
   * Returns true if permission was granted.
   */
  requestOrOpenSettings: () => Promise<boolean>;
}

export function useNotificationPermission(): NotificationPermissionState {
  const [status, setStatus] = useState<Notifications.PermissionStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const checkPermission = useCallback(async () => {
    try {
      const { status: permStatus, canAskAgain: canAsk } = await Notifications.getPermissionsAsync();
      setStatus(permStatus);
      setCanAskAgain(canAsk);
    } catch (error) {
      console.error('[useNotificationPermission] Error checking permissions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check on mount
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  // Re-check when app comes to foreground (user might have changed settings)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkPermission();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [checkPermission]);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  const requestOrOpenSettings = useCallback(async (): Promise<boolean> => {
    try {
      // First check current status
      const { status: currentStatus, canAskAgain: canAsk } = await Notifications.getPermissionsAsync();
      
      // If already granted, we're done
      if (currentStatus === 'granted') {
        setStatus(currentStatus);
        return true;
      }

      // If we can ask again, request permission
      if (canAsk) {
        console.log('[useNotificationPermission] Requesting permission via system dialog...');
        const { status: newStatus } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowSound: true,
            allowBadge: true,
          },
        });
        setStatus(newStatus);
        setCanAskAgain(false); // After requesting, we typically can't ask again
        
        if (newStatus === 'granted') {
          return true;
        }
        
        // User denied - show alert to open settings
        Alert.alert(
          Platform.OS === 'ios' ? 'התראות כבויות' : 'Notifications Disabled',
          Platform.OS === 'ios' 
            ? 'כדי לקבל התראות על מוצרים שעומדים לפוג, הפעל התראות בהגדרות המכשיר.'
            : 'To receive alerts about expiring products, enable notifications in device settings.',
          [
            { text: Platform.OS === 'ios' ? 'ביטול' : 'Cancel', style: 'cancel' },
            { 
              text: Platform.OS === 'ios' ? 'פתח הגדרות' : 'Open Settings', 
              onPress: openSettings 
            },
          ]
        );
        return false;
      }

      // Can't ask again - permission was permanently denied, open settings
      console.log('[useNotificationPermission] Permission permanently denied, opening settings...');
      openSettings();
      return false;
    } catch (error) {
      console.error('[useNotificationPermission] Error requesting permission:', error);
      return false;
    }
  }, [openSettings]);

  return {
    isEnabled: status === 'granted',
    status,
    isLoading,
    canAskAgain,
    openSettings,
    refresh: checkPermission,
    requestOrOpenSettings,
  };
}

