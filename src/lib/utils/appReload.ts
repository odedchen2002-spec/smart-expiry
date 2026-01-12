/**
 * App reload utility
 * Handles reloading the app when subscription changes
 */

import { Alert, NativeModules } from 'react-native';

const { DevSettings } = NativeModules;

/**
 * Reload the app - uses DevSettings in development
 * In production builds, expo-updates would be used but requires native rebuild
 */
export async function reloadApp(): Promise<void> {
  console.log('[AppReload] Triggering app reload...');
  
  try {
    // Use DevSettings reload (works in both dev and some production scenarios)
    if (DevSettings?.reload) {
      console.log('[AppReload] Using DevSettings.reload()');
      DevSettings.reload();
    } else {
      console.warn('[AppReload] DevSettings.reload not available - user needs to restart app manually');
    }
  } catch (error) {
    console.error('[AppReload] Failed to reload:', error);
  }
}

/**
 * Show alert before reloading (for subscription changes)
 */
export function reloadAppWithMessage(
  title: string,
  message: string,
  buttonText: string = 'OK'
): void {
  Alert.alert(
    title,
    message,
    [
      {
        text: buttonText,
        onPress: () => {
          // Small delay to let the alert dismiss
          setTimeout(() => {
            reloadApp();
          }, 300);
        },
      },
    ],
    { cancelable: false }
  );
}
