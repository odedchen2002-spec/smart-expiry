// Removed gesture/reanimated SwipeTabs for Expo Go compatibility
import AsyncStorage from '@react-native-async-storage/async-storage';

const SWIPE_SETTING_KEY = 'settings_swipe_tabs_enabled';

export type SwipeTabsProps = any;

export async function getSwipeTabsEnabled(): Promise<boolean> {
	try {
		const v = await AsyncStorage.getItem(SWIPE_SETTING_KEY);
		if (v === null) return true; // default ON
		return v === '1';
	} catch {
		return true;
	}
}

export async function setSwipeTabsEnabled(enabled: boolean): Promise<void> {
	await AsyncStorage.setItem(SWIPE_SETTING_KEY, enabled ? '1' : '0');
}

export function SwipeTabs(_: SwipeTabsProps) {
	// No-op container; swiping disabled in Expo Go mode
	return null as any;
}

// styles removed
