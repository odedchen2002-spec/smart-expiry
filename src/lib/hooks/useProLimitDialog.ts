/**
 * useProLimitDialog - Hook to show Pro limit dialog once when reaching 2000 items
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscription } from './useSubscription';
import { useActiveOwner } from './useActiveOwner';
import { supabase } from '../supabase/client';

const PRO_LIMIT_THRESHOLD = 2000;
// Updated key to v2 to show dialog for users who already passed 2000 items
const PRO_LIMIT_DIALOG_TRIGGERED_KEY = 'pro_limit_dialog_triggered_v2_';

interface UseProLimitDialogResult {
  showDialog: boolean;
  dismissDialog: () => void;
}

export function useProLimitDialog(): UseProLimitDialogResult {
  const [showDialog, setShowDialog] = useState(false);
  const { subscription, isLoading: subLoading } = useSubscription();
  const { activeOwnerId } = useActiveOwner();

  useEffect(() => {
    const checkAndShowDialog = async () => {
      console.log('[ProLimitDialog] useEffect triggered', {
        subLoading,
        activeOwnerId,
        tier: subscription?.plan,
      });

      // Don't check if subscription is still loading OR if activeOwnerId is not available
      if (!activeOwnerId) {
        console.log('[ProLimitDialog] Skipping check - no owner yet');
        return;
      }

      // Wait for subscription to load (don't skip if subLoading is undefined, only if it's true)
      if (subLoading === true) {
        console.log('[ProLimitDialog] Skipping check - subscription is loading');
        return;
      }

      // Wait for subscription data to be available
      if (!subscription) {
        console.log('[ProLimitDialog] Skipping check - no subscription data yet');
        return;
      }

      // Only show for Pro plan users
      if (subscription.plan !== 'pro') {
        console.log('[ProLimitDialog] Not a Pro user, skipping');
        return;
      }

      try {
        // Check if dialog was already shown for this owner
        const dialogKey = PRO_LIMIT_DIALOG_TRIGGERED_KEY + activeOwnerId;
        const wasShown = await AsyncStorage.getItem(dialogKey);

        if (wasShown) {
          // Already shown, don't show again
          console.log('[ProLimitDialog] Dialog was already shown, skipping');
          return;
        }

        // Get ALL items count (including expired, but not resolved)
        // We need to count ALL items because the plan limit applies to total items, not just active ones
        console.log('[ProLimitDialog] Fetching items to check count...');
        const { count, error } = await supabase
          .from('items')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', activeOwnerId)
          .neq('status', 'resolved');

        if (error) {
          console.error('[ProLimitDialog] Error counting items:', error);
          return;
        }

        const totalItemsCount = count || 0;

        console.log('[ProLimitDialog] Checking Pro limit:', {
          totalCount: totalItemsCount,
          threshold: PRO_LIMIT_THRESHOLD,
          tier: subscription?.plan,
          note: 'Counting all items (active + expired, excluding resolved)',
        });

        // Show dialog if user has reached or exceeded threshold
        if (totalItemsCount >= PRO_LIMIT_THRESHOLD) {
          console.log('[ProLimitDialog] Showing Pro limit dialog - threshold reached!');
          setShowDialog(true);
          // Mark as shown immediately to prevent multiple shows
          await AsyncStorage.setItem(dialogKey, 'true');
        } else {
          console.log('[ProLimitDialog] Not at threshold yet:', totalItemsCount, '/', PRO_LIMIT_THRESHOLD);
        }
      } catch (error) {
        console.error('[ProLimitDialog] Error checking Pro limit:', error);
        // On error, don't show dialog to avoid annoying the user
      }
    };

    checkAndShowDialog();
  }, [subscription, subLoading, activeOwnerId]);

  const dismissDialog = () => {
    setShowDialog(false);
  };

  return {
    showDialog,
    dismissDialog,
  };
}
