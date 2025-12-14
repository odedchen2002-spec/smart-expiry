/**
 * Notifications History Queries
 */

import { supabase } from '../client';

export interface NotificationHistory {
  id: string;
  user_id: string;
  owner_id: string; // Changed from business_id to owner_id
  business_id?: string; // Keep for backward compatibility
  title: string;
  body: string;
  notification_type: string;
  data?: any;
  read: boolean;
  created_at: string;
}

/**
 * Get notification history for a user for an owner
 * Automatically filters out notifications older than 30 days
 * Note: notification_sent_log may still have business_id - we'll filter by owner_id via items
 */
export async function getNotificationHistory(
  userId: string,
  ownerId: string
): Promise<NotificationHistory[]> {
  // Calculate date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  // Query notifications by owner_id
  const { data, error } = await supabase
    .from('notification_sent_log')
    .select('id,user_id,owner_id,created_at,status,expo_push_ticket')
    .eq('user_id', userId)
    .eq('owner_id', ownerId)
    .gte('created_at', thirtyDaysAgoISO) // Only notifications from the last 30 days
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching notification history:', error);
    throw error;
  }

  const mapped: NotificationHistory[] = (data || []).map((row: any) => {
    const ticket = row.expo_push_ticket || {};
    // Extract notification type from data, fallback to 'expiry_reminder' for backward compatibility
    const notificationType = ticket.data?.type || 'expiry_reminder';
    return {
      id: row.id,
      user_id: row.user_id,
      owner_id: row.owner_id || (row as any).business_id || '',
      business_id: (row as any).business_id || row.owner_id || '', // For backward compatibility
      title: ticket.title ?? 'תזכורת תפוגה',
      body: ticket.body ?? '',
      notification_type: notificationType,
      data: ticket.data ?? null,
      // All notifications start as unread; read state is managed locally via tappedIds and lastTappedAt
      read: false,
      created_at: row.created_at,
    };
  });

  return mapped;
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  // No-op: server log table doesn't track per-user read state.
  // We optimistically update UI state in the caller.
  return;
}

/**
 * Mark all notifications as read for a user for an owner
 */
export async function markAllNotificationsAsRead(
  userId: string,
  ownerId: string
): Promise<void> {
  // No-op: server log table doesn't track per-user read state.
  return;
}

/**
 * Create a notification history entry
 */
export async function createNotificationHistory(
  userId: string,
  ownerId: string,
  title: string,
  body: string,
  notificationType: string = 'expiry_reminder',
  data?: any
): Promise<NotificationHistory> {
  // Write-through helper to mirror a manual entry into notification_sent_log for testing
  const payload = {
    to: null,
    title,
    body,
    sound: 'default',
    data: {
      ...(data ?? {}),
      type: notificationType, // Ensure type is stored in data for retrieval
    },
  };

  const sentDate = new Date().toISOString().slice(0, 10);
  const notificationTime = new Date().toTimeString().slice(0, 8);

  // Try to insert the notification history entry
  // If it fails due to duplicate key constraint, fetch and return the existing entry
  const { data: inserted, error } = await supabase
    .from('notification_sent_log')
    .insert({
      user_id: userId,
      owner_id: ownerId,
      business_id: ownerId, // Required for backward compatibility with legacy schema
      sent_date: sentDate,
      notification_time: notificationTime,
      items_count: data?.itemsCount || 0,
      target_expiry_date: data?.targetDate || new Date().toISOString().slice(0, 10),
      days_before: data?.daysBefore || 0,
      status: 'sent',
      expo_push_ticket: payload,
    })
    .select('id,user_id,owner_id,created_at,status,expo_push_ticket')
    .single();

  if (error) {
    // Handle duplicate key constraint violation gracefully
    if (error.code === '23505') { // Duplicate key error
      console.log('Notification history entry already exists for this user/date/time, fetching existing entry...');
      
      // Fetch the existing entry
      const { data: existing, error: fetchError } = await supabase
        .from('notification_sent_log')
        .select('id,user_id,owner_id,created_at,status,expo_push_ticket')
        .eq('user_id', userId)
        .eq('business_id', ownerId)
        .eq('sent_date', sentDate)
        .eq('notification_time', notificationTime)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (fetchError) {
        console.error('Error fetching existing notification log:', fetchError);
        // Don't throw - just log and return a fallback
      } else if (existing) {
        // Return existing entry
        const ticket = existing.expo_push_ticket || {};
        return {
          id: existing.id,
          user_id: existing.user_id,
          business_id: (existing as any).owner_id || (existing as any).business_id || '',
          title: ticket.title ?? title,
          body: ticket.body ?? body,
          notification_type: notificationType,
          data: ticket.data ?? data ?? null,
          read: false,
          created_at: existing.created_at,
        };
      }
    }
    
    // For other errors, log and throw
    console.error('Error creating notification log:', error);
    throw error;
  }

  const ticket = inserted?.expo_push_ticket || {};
  return {
    id: inserted.id,
    user_id: inserted.user_id,
    business_id: (inserted as any).owner_id || (inserted as any).business_id || '', // For backward compatibility
    title: ticket.title ?? title,
    body: ticket.body ?? body,
    notification_type: notificationType,
    data: ticket.data ?? data ?? null,
    read: false, // New notifications should be unread initially
    created_at: inserted.created_at,
  };
}

