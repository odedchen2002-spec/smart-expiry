import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';

const STORAGE_KEY = (userId: string, ownerId: string) =>
  `notif_last_seen_${userId}_${ownerId}`;

export function useNotificationBadge() {
  const { user } = useAuth();
  const { activeOwnerId } = useActiveOwner();
  const [hasNew, setHasNew] = useState<boolean>(false);
  const lastSeenRef = useRef<string | null>(null);

  const userId = user?.id;
  const ownerId = activeOwnerId;
  const enabled = Boolean(userId && ownerId);

  // Load last seen timestamp
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled) return;
      try {
        const key = STORAGE_KEY(userId!, ownerId!);
        const saved = await AsyncStorage.getItem(key);
        if (!cancelled) {
          lastSeenRef.current = saved;
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, ownerId]);

  // Initial check for latest notification
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled) return;
      const { data, error } = await supabase
        .from('notification_sent_log')
        .select('created_at')
        .eq('user_id', userId!)
        .eq('owner_id', ownerId!)
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled || error) return;
      const latest = data?.[0]?.created_at as string | undefined;
      if (!latest) {
        setHasNew(false);
        return;
      }
      const lastSeen = lastSeenRef.current;
      setHasNew(!lastSeen || new Date(latest) > new Date(lastSeen));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, ownerId]);

  // Realtime subscription to new notifications
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel('notif_badge_channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
        table: 'notification_sent_log',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if ((payload.new as any)?.owner_id === ownerId) {
            setHasNew(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, ownerId]);

  const markSeen = useMemo(
    () => async () => {
      if (!enabled) return;
      const nowIso = new Date().toISOString();
      const key = STORAGE_KEY(userId!, ownerId!);
      await AsyncStorage.setItem(key, nowIso);
      lastSeenRef.current = nowIso;
      setHasNew(false);
    },
    [enabled, userId, ownerId]
  );

  return { hasNew, markSeen, enabled };
}


